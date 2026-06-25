/**
 * Fixture canonique — sortie LLM / graphe post-génération (miroir tests/fixtures/unity_post_generation.py).
 */
import type { Node, Edge } from 'reactflow'

export const RAW_POST_GENERATION_NODE = {
  id: 'START',
  speaker: 'PNJ',
  line: 'Bonjour voyageur',
  consequences: {
    flag: 'FLAG_rencontre_valkazer_init',
    description: 'Première rencontre',
  },
  choices: [
    {
      text: 'Tenter',
      test: 'Volonté+Adaptabilité:12',
    },
  ],
} as const

export const RAW_POST_GENERATION_DOCUMENT = {
  schemaVersion: '1.2.0',
  nodes: [{ ...RAW_POST_GENERATION_NODE }],
}

/** Nodes/edges React Flow pour graphToDocument / tests Vitest. */
export function postGenerationReactFlowGraph(): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: [
      {
        id: 'START',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { ...RAW_POST_GENERATION_NODE },
      },
    ],
    edges: [],
  }
}
