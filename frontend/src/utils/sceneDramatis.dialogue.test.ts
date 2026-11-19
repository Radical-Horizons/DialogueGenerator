import { describe, expect, it } from 'vitest'
import {
  type DramatisGraphNode,
  findParentDialogueNode,
  resolveDialogueDramatis,
  resolveGraphGenerationDramatis,
} from './sceneDramatis'

const VOKNIR = "Voknir Esh'Maradel"

/** Extrait du dialogue importé « Voknir — L'Atelier du Cartographe » (prod, 2026-11-18). */
const voknirNodes: DramatisGraphNode[] = [
  {
    id: 'START',
    type: 'dialogueNode',
    data: {
      speaker: VOKNIR,
      line: '*Voknir est agenouillé, presque immobile, il se grave lentement la peau.*',
      choices: [
        { choiceId: 'choice_START_0', text: '*[Vous pénétrez dans l’atelier.]* « Salutation, cartographe. »' },
      ],
    },
  },
  {
    id: 'node-craquement',
    type: 'dialogueNode',
    data: {
      speaker: VOKNIR,
      line: '*Le cartographe se détourne d’Uresaïr pour faire face aux murs d’équations.*',
      choices: [{ choiceId: 'c-craq-0', text: '« Qu’est-ce donc ? »', test: 'Intelligence+Orientation:15' }],
    },
  },
  {
    id: 'node-autoritaire',
    type: 'dialogueNode',
    data: {
      speaker: VOKNIR,
      line: '*Son regard se pose furtivement sur quelque chose derrière Uresaïr.*',
      choices: [],
    },
  },
  { id: 'test-node-node-craquement-choice-0', type: 'testNode', data: { test: 'Intelligence+Orientation:15' } },
  { id: 'END', type: 'endNode', data: {} },
]

/** Scène restée dans le panneau de contexte depuis la page « Générer ». */
const panelScene = { playerCharacterId: "L'Éthérée", npcSpeakerId: 'Uresaïr' }

describe('resolveDialogueDramatis — le dialogue ouvert dit qui parle', () => {
  it('Voknir : PNJ = locuteur du parent, PJ = jouable nommé dans le dialogue (pas le panneau)', () => {
    expect(
      resolveDialogueDramatis({ nodes: voknirNodes, parentNodeId: 'node-autoritaire', fallback: panelScene }),
    ).toEqual({ playerCharacterId: 'Uresaïr', npcSpeakerId: VOKNIR })
  })

  it('parent donné comme barre de test : le PNJ est celui du nœud qui porte le choix', () => {
    expect(
      findParentDialogueNode(voknirNodes, 'test-node-node-craquement-choice-0')?.id,
    ).toBe('node-craquement')
    expect(findParentDialogueNode(voknirNodes, 'test:c-craq-0')?.id).toBe('node-craquement')
    expect(
      resolveDialogueDramatis({
        nodes: voknirNodes,
        parentNodeId: 'test-node-node-craquement-choice-0',
        fallback: panelScene,
      }),
    ).toEqual({ playerCharacterId: 'Uresaïr', npcSpeakerId: VOKNIR })
  })

  it('aucun jouable nommé : le PJ du panneau sert de repli', () => {
    const nodes: DramatisGraphNode[] = [
      { id: 'START', type: 'dialogueNode', data: { speaker: 'Laios Sul Kandar', line: '« Tu cherches une route. »' } },
    ]
    expect(
      resolveDialogueDramatis({
        nodes,
        parentNodeId: 'START',
        fallback: { playerCharacterId: 'Vethraak', npcSpeakerId: 'Uresaïr' },
      }),
    ).toEqual({ playerCharacterId: 'Vethraak', npcSpeakerId: 'Laios Sul Kandar' })
  })

  it('un jouable peut être le PNJ du dialogue (Uresaïr face à L’Éthérée), jamais aussi le PJ', () => {
    const nodes: DramatisGraphNode[] = [
      {
        id: 'START',
        type: 'dialogueNode',
        data: { speaker: 'Uresaïr', line: '*Dans les os creux, Uresaïr se tait.* « Approche. »' },
      },
    ]
    const dramatis = resolveDialogueDramatis({
      nodes,
      parentNodeId: 'START',
      fallback: { playerCharacterId: 'Uresaïr', npcSpeakerId: 'Akthar-Neth Amatru' },
    })
    expect(dramatis.npcSpeakerId).toBe('Uresaïr')
    expect(dramatis.playerCharacterId).toBe("L'Éthérée")
  })

  it('L’Éthérée n’est jamais PNJ ; parent sans locuteur → locuteur le plus fréquent', () => {
    const nodes: DramatisGraphNode[] = [
      { id: 'a', type: 'dialogueNode', data: { speaker: "L'Éthérée", line: '…' } },
      { id: 'b', type: 'dialogueNode', data: { speaker: VOKNIR, line: '« Uresaïr ! »' } },
      { id: 'manual', type: 'dialogueNode', data: { speaker: '', line: '' } },
    ]
    expect(
      resolveDialogueDramatis({ nodes, parentNodeId: 'manual', fallback: panelScene }),
    ).toEqual({ playerCharacterId: 'Uresaïr', npcSpeakerId: VOKNIR })
  })

  it('dialogue sans locuteur exploitable : la scène du panneau reste inchangée', () => {
    const nodes: DramatisGraphNode[] = [{ id: 'START', type: 'dialogueNode', data: { speaker: 'PNJ', line: '' } }]
    expect(resolveDialogueDramatis({ nodes, parentNodeId: 'START', fallback: panelScene })).toEqual(panelScene)
  })
})

describe('resolveGraphGenerationDramatis', () => {
  it('le dialogue l’emporte sur la sélection du panneau et les valeurs explicites', () => {
    expect(
      resolveGraphGenerationDramatis({
        nodes: voknirNodes,
        parentNodeId: 'START',
        contextSelections: { characters_full: ["L'Éthérée", 'Uresaïr'] },
        sceneSelection: { characterA: "L'Éthérée", characterB: 'Uresaïr' },
        npcSpeakerId: 'Uresaïr',
        playerCharacterId: "L'Éthérée",
      }),
    ).toEqual({ playerCharacterId: 'Uresaïr', npcSpeakerId: VOKNIR })
  })
})
