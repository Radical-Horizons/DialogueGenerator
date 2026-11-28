import { describe, expect, it } from 'vitest'
import {
  type DramatisGraphNode,
  findParentDialogueNode,
  readDialogueDramatis,
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

describe('readDialogueDramatis — le dialogue ouvert dit qui parle, sans repli', () => {
  it('Voknir : PNJ = locuteur du parent, PJ = jouable nommé dans le dialogue', () => {
    expect(
      readDialogueDramatis({ nodes: voknirNodes, parentNodeId: 'node-autoritaire' }),
    ).toEqual({ playerCharacterId: 'Uresaïr', npcSpeakerId: VOKNIR })
  })

  it('parent donné comme barre de test : le PNJ est celui du nœud qui porte le choix', () => {
    expect(
      findParentDialogueNode(voknirNodes, 'test-node-node-craquement-choice-0')?.id,
    ).toBe('node-craquement')
    expect(findParentDialogueNode(voknirNodes, 'test:c-craq-0')?.id).toBe('node-craquement')
    expect(
      readDialogueDramatis({
        nodes: voknirNodes,
        parentNodeId: 'test-node-node-craquement-choice-0',
      }),
    ).toEqual({ playerCharacterId: 'Uresaïr', npcSpeakerId: VOKNIR })
  })

  it('aucun jouable nommé : pas de PJ inventé', () => {
    const nodes: DramatisGraphNode[] = [
      { id: 'START', type: 'dialogueNode', data: { speaker: 'Laios Sul Kandar', line: '« Tu cherches une route. »' } },
    ]
    expect(readDialogueDramatis({ nodes, parentNodeId: 'START' })).toEqual({
      playerCharacterId: null,
      npcSpeakerId: 'Laios Sul Kandar',
    })
  })

  it('un jouable peut être le PNJ du dialogue, jamais aussi le PJ', () => {
    const nodes: DramatisGraphNode[] = [
      {
        id: 'START',
        type: 'dialogueNode',
        data: { speaker: 'Uresaïr', line: '*Dans les os creux, Uresaïr se tait.* « Approche. »' },
      },
    ]
    expect(readDialogueDramatis({ nodes, parentNodeId: 'START' })).toEqual({
      playerCharacterId: null,
      npcSpeakerId: 'Uresaïr',
    })
  })

  it('L’Éthérée n’est jamais PNJ ; parent sans locuteur → locuteur le plus fréquent', () => {
    const nodes: DramatisGraphNode[] = [
      { id: 'a', type: 'dialogueNode', data: { speaker: "L'Éthérée", line: '…' } },
      { id: 'b', type: 'dialogueNode', data: { speaker: VOKNIR, line: '« Uresaïr ! »' } },
      { id: 'manual', type: 'dialogueNode', data: { speaker: '', line: '' } },
    ]
    expect(readDialogueDramatis({ nodes, parentNodeId: 'manual' })).toEqual({
      playerCharacterId: 'Uresaïr',
      npcSpeakerId: VOKNIR,
    })
  })

  it('PNJ imposé par la fiche : il n’est pas relu, et n’est jamais pris pour PJ', () => {
    expect(
      readDialogueDramatis({ nodes: voknirNodes, parentNodeId: 'START', npcSpeakerId: 'Uresaïr' }),
    ).toEqual({ playerCharacterId: null, npcSpeakerId: 'Uresaïr' })
  })

  it('dialogue sans locuteur exploitable : rien', () => {
    const nodes: DramatisGraphNode[] = [{ id: 'START', type: 'dialogueNode', data: { speaker: 'PNJ', line: '' } }]
    expect(readDialogueDramatis({ nodes, parentNodeId: 'START' })).toEqual({
      playerCharacterId: null,
      npcSpeakerId: null,
    })
  })
})
