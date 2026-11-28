/**
 * Fiche de scène : déduction, graphies, contexte de génération (story 20.4 lot A).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ContextSelection } from '../types/api'
import {
  buildSceneGeneration,
  composeSceneInstructions,
  deduceSceneSheet,
  findSpeakerIssues,
  newLinkedEntries,
  parseSceneSheet,
  SCENE_DEFAULT_INSTRUCTION,
  type SceneSheet,
} from './sceneSheet'
import type { DramatisGraphNode } from './sceneDramatis'

const STRAIGHT = "Grish T'vok"
const CURLY = 'Grish T’vok'

function reply(id: string, speaker: string, line = '…'): DramatisGraphNode {
  return { id, type: 'dialogueNode', data: { speaker, line, choices: [] } }
}

const nodes: DramatisGraphNode[] = [
  reply('START', STRAIGHT, '*Il salue Uresaïr.*'),
  reply('a', STRAIGHT),
  reply('b', CURLY),
  reply('manual', ''),
  { id: 'END', type: 'endNode', data: {} },
]

function sheet(patch: Partial<SceneSheet> = {}): SceneSheet {
  return { npcs: [], pc: null, place: null, brief: '', linkedEntries: [], ...patch }
}

function ref(name: string, entryId: string | null = null) {
  return { name, entryId }
}

function emptyColumn(patch: Partial<ContextSelection> = {}): ContextSelection {
  return {
    characters_full: [],
    characters_excerpt: [],
    locations_full: [],
    locations_excerpt: [],
    items_full: [],
    items_excerpt: [],
    species_full: [],
    species_excerpt: [],
    communities_full: [],
    communities_excerpt: [],
    dialogues_examples: [],
    narrative_structures: [],
    chapters: [],
    scenes: [],
    ...patch,
  }
}

describe('deduceSceneSheet', () => {
  it('réunit les graphies en un PNJ, lit le PJ, sans lieu ni brief', () => {
    expect(deduceSceneSheet(nodes, [])).toEqual(
      sheet({ npcs: [ref(STRAIGHT)], pc: ref('Uresaïr') }),
    )
  })

  it('prend le nom et le notion_page_id de la fiche GDD', () => {
    const catalog = [{ name: CURLY, data: { notion_page_id: 'page-grish' } }]

    expect(deduceSceneSheet(nodes, catalog).npcs).toEqual([ref(CURLY, 'page-grish')])
  })

  it('deux graphies d’une même fiche, dont un alias, ne font qu’un PNJ', () => {
    const catalog = [
      { name: STRAIGHT, data: { notion_page_id: 'page-grish', values: { Alias: 'La Forge' } } },
    ]

    const deduced = deduceSceneSheet(
      [reply('1', STRAIGHT), reply('2', 'La Forge'), reply('3', 'Autre')],
      catalog,
    )

    expect(deduced.npcs).toEqual([ref(STRAIGHT, 'page-grish'), ref('Autre')])
  })

  it('classe les PNJ par présence et écarte L’Éthérée et le marqueur PNJ', () => {
    const deduced = deduceSceneSheet(
      [
        reply('1', 'Second'),
        reply('2', 'Premier'),
        reply('3', 'Premier'),
        reply('4', "L'Éthérée"),
        reply('5', 'PNJ'),
      ],
      [],
    )

    expect(deduced.npcs.map((npc) => npc.name)).toEqual(['Premier', 'Second'])
    expect(deduced.pc).toBeNull()
  })

  it('ne prend pas pour PJ un personnage qui parle comme PNJ', () => {
    const deduced = deduceSceneSheet(
      [reply('1', 'Autre', 'Uresaïr, Uresaïr.'), reply('2', 'Uresaïr', 'Vethraak ?')],
      [],
    )

    expect(deduced.pc).toEqual(ref('Vethraak'))
  })
})

describe('findSpeakerIssues', () => {
  it('propose la graphie de la fiche et signale les répliques sans locuteur, sans rien écrire', () => {
    const issues = findSpeakerIssues(nodes, deduceSceneSheet(nodes, []))

    expect(issues.spellings).toEqual([{ target: STRAIGHT, others: [CURLY], nodeIds: ['b'] }])
    expect(issues.emptyNodeIds).toEqual(['manual'])
    expect(nodes[2].data?.speaker).toBe(CURLY)
  })

  it('une graphie unique mais différente de la fiche est proposée aussi', () => {
    const issues = findSpeakerIssues([reply('1', CURLY)], sheet({ npcs: [ref(STRAIGHT)] }))

    expect(issues.spellings).toEqual([{ target: STRAIGHT, others: [CURLY], nodeIds: ['1'] }])
  })

  it('le marqueur « PNJ » compte comme une réplique sans locuteur', () => {
    const issues = findSpeakerIssues([reply('1', 'PNJ'), reply('2', ''), reply('3', STRAIGHT)], sheet())

    expect(issues.emptyNodeIds).toEqual(['1', '2'])
    expect(issues.spellings).toEqual([])
  })

  it('rien à proposer quand les locuteurs suivent la fiche', () => {
    expect(findSpeakerIssues([reply('1', STRAIGHT)], sheet({ npcs: [ref(STRAIGHT)] }))).toEqual({
      spellings: [],
      emptyNodeIds: [],
    })
  })
})

describe('buildSceneGeneration', () => {
  const full = sheet({
    npcs: [ref('Premier PNJ'), ref(STRAIGHT)],
    pc: ref('Vethraak'),
    place: ref('La Forge', 'page-forge'),
    brief: '  Il propose de réparer.  ',
    linkedEntries: [
      { category: 'items', name: 'Anneau', mode: 'excerpt', entryId: null },
      { category: 'chapters', name: 'Chapitre 1', entryId: null },
    ],
  })

  it('le PNJ est le locuteur du parent s’il est un PNJ de la fiche, à la graphie de la fiche', () => {
    const generation = buildSceneGeneration({ sheet: full, nodes, parentNodeId: 'b', characters: [] })

    expect(generation.npcSpeakerId).toBe(STRAIGHT)
    expect(generation.playerCharacterId).toBe('Vethraak')
    expect(generation.brief).toBe('Il propose de réparer.')
    expect(generation.contextSelections).toMatchObject({
      characters_full: ['Premier PNJ', STRAIGHT],
      characters_excerpt: ['Vethraak'],
      locations_full: ['La Forge'],
      items_excerpt: ['Anneau'],
      chapters: ['Chapitre 1'],
      scene_location: { lieu: 'La Forge' },
      scene_protagonists: { personnage_a: 'Vethraak', personnage_b: STRAIGHT },
    })
  })

  it('un locuteur écrit sous un alias désigne le PNJ de la fiche, pas le premier', () => {
    const generation = buildSceneGeneration({
      sheet: sheet({ npcs: [ref('Premier PNJ'), ref(STRAIGHT)] }),
      nodes: [reply('1', 'La Forge')],
      parentNodeId: '1',
      characters: [{ name: STRAIGHT, data: { values: { Alias: 'La Forge' } } }],
    })

    expect(generation.npcSpeakerId).toBe(STRAIGHT)
  })

  it('sans PJ dans la fiche, un autre PNJ jouable n’est ni lu ni pris par défaut comme PJ', () => {
    const read = buildSceneGeneration({
      sheet: sheet({ npcs: [ref('Premier PNJ'), ref('Uresaïr')] }),
      nodes: [reply('1', 'Premier PNJ', 'Uresaïr, Uresaïr, Vethraak.')],
      parentNodeId: '1',
      characters: [],
    })
    const fallback = buildSceneGeneration({
      sheet: sheet({ npcs: [ref('Premier PNJ'), ref("L'Éthérée"), ref('Uresaïr')] }),
      nodes: [reply('1', 'Premier PNJ')],
      parentNodeId: '1',
      characters: [],
    })

    expect(read.playerCharacterId).toBe('Vethraak')
    expect(read.contextSelections.characters_full).toContain('Uresaïr')
    expect(fallback.playerCharacterId).toBe('Vethraak')
  })

  it('sinon le premier PNJ de la fiche, même depuis une barre de test', () => {
    const generation = buildSceneGeneration({
      sheet: full,
      nodes: [reply('x', 'Inconnu')],
      parentNodeId: 'test-node-x-choice-0',
      characters: [],
    })

    expect(generation.npcSpeakerId).toBe('Premier PNJ')
  })

  it('PNJ et PJ absents de la fiche : lus dans le dialogue', () => {
    const generation = buildSceneGeneration({ sheet: sheet(), nodes, parentNodeId: 'a', characters: [] })

    expect(generation.npcSpeakerId).toBe(STRAIGHT)
    expect(generation.playerCharacterId).toBe('Uresaïr')
    expect(generation.contextSelections.scene_location).toBeUndefined()
  })

  it('dialogue muet : pas de PNJ inventé, PJ par défaut', () => {
    const generation = buildSceneGeneration({
      sheet: sheet(),
      nodes: [reply('1', '')],
      parentNodeId: '1',
      characters: [],
    })

    expect(generation.npcSpeakerId).toBeUndefined()
    expect(generation.playerCharacterId).toBe("L'Éthérée")
    expect(generation.contextSelections.scene_protagonists).toEqual({ personnage_a: "L'Éthérée" })
  })

  it('un lieu libre part comme lieu de scène, sans fiche de lieu', () => {
    const generation = buildSceneGeneration({
      sheet: sheet({ place: ref('Sous un pont') }),
      nodes,
      parentNodeId: 'a',
      characters: [],
    })

    expect(generation.contextSelections.scene_location).toEqual({ lieu: 'Sous un pont' })
    expect(generation.contextSelections.locations_full).toEqual([])
  })
})

describe('composeSceneInstructions', () => {
  it('fait précéder la consigne du brief', () => {
    expect(composeSceneInstructions('Un marché.', 'Plus sec')).toBe(
      'Brief de la scène : Un marché.\n\nPlus sec',
    )
  })

  it('brief sans consigne : la consigne d’écriture est celle du serveur, au caractère près', () => {
    const source = readFileSync(
      resolve(process.cwd(), '..', 'services', 'dialogue_dramatic_progression.py'),
      'utf-8',
    )
    const block = /DEFAULT_NODE_SCENE_INSTRUCTIONS = \(([\s\S]*?)\n\)/.exec(source)?.[1] ?? ''
    const server = [...block.matchAll(/"([^"]*)"/g)].map((match) => match[1]).join('')

    expect(SCENE_DEFAULT_INSTRUCTION).toBe(server)
    expect(composeSceneInstructions('Un marché.', ' ')).toBe(
      `Brief de la scène : Un marché.\n\n${server}`,
    )
  })

  it('sans brief, la consigne est intacte, même vide', () => {
    expect(composeSceneInstructions('  ', '')).toBe('')
  })
})

describe('newLinkedEntries — « Reprendre les fiches cochées »', () => {
  it('copie avec le mode, sans doublon ni recopie du PNJ, du PJ et du lieu', () => {
    const current = sheet({
      npcs: [ref(STRAIGHT)],
      pc: ref('Uresaïr'),
      place: ref('La Forge'),
      linkedEntries: [{ category: 'items', name: 'Anneau', mode: 'full', entryId: null }],
    })

    const added = newLinkedEntries(
      emptyColumn({
        characters_full: [CURLY, 'Uresaïr', 'Témoin'],
        characters_excerpt: ['Témoin'],
        locations_full: ['La Forge'],
        items_excerpt: ['Anneau'],
        chapters: ['Chapitre 1'],
      }),
      { characters: [{ name: 'Témoin', data: { notion_page_id: 'page-temoin' } }] },
      current,
    )

    expect(added).toEqual([
      { category: 'characters', name: 'Témoin', mode: 'full', entryId: 'page-temoin' },
      { category: 'chapters', name: 'Chapitre 1', entryId: null },
    ])
  })
})

describe('parseSceneSheet', () => {
  it('garde les champs sans interface', () => {
    const parsed = parseSceneSheet({
      tones: ['tension'],
      authorProfileId: 'p1',
      contextBudget: 'auto',
      futur: { a: 1 },
    })

    expect(parsed).toMatchObject({
      tones: ['tension'],
      authorProfileId: 'p1',
      contextBudget: 'auto',
      futur: { a: 1 },
      npcs: [],
      linkedEntries: [],
    })
  })

  it('ne garde que les fiches liées qui ont une catégorie et un nom', () => {
    const kept = { category: 'items', name: 'Anneau', entryId: null }

    const parsed = parseSceneSheet({
      linkedEntries: [null, 'x', 3, { category: 'items' }, { name: 'Sans catégorie' }, kept],
    })

    expect(parsed?.linkedEntries).toEqual([kept])
  })

  it('absente ou mal formée : null', () => {
    expect(parseSceneSheet(undefined)).toBeNull()
    expect(parseSceneSheet([])).toBeNull()
  })
})
