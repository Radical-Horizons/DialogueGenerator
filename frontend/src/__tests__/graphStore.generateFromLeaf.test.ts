/**
 * Régression : « Générer la suite » depuis une feuille (nœud sans choix ni nextNode).
 *
 * FastAPI sérialise `SuggestedConnection.via_choice_index = None` en `null` (pas de clé
 * absente) : la connexion `nextNode` proposée pour une feuille arrive donc avec
 * `via_choice_index: null`. Le front doit quand même relier parent → nouveau nœud par
 * `nextNode`, avec une arête sur la poignée par défaut de la feuille.
 * Vécu en prod (v1.11.0) sur Voknir, `node-trace-enfant`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Node } from 'reactflow'
import { useGraphStore } from '../store/graphStore'
import { useGenerationStore } from '../store/generationStore'
import * as graphAPI from '../api/graph'

vi.mock('../api/graph', () => ({
  loadGraph: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  generateNode: vi.fn(),
  detectContextDropping: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

vi.mock('../api/documents', () => ({
  getDocument: vi.fn(),
  getLayout: vi.fn(),
  putDocument: vi.fn(),
  putLayout: vi.fn(),
}))

const PARENT_ID = 'node-trace-enfant'
const GENERATED_ID = 'node-generated-suite'

function leafParent(): Node {
  return {
    id: PARENT_ID,
    type: 'dialogueNode',
    position: { x: 0, y: 0 },
    data: {
      id: PARENT_ID,
      displayName: 'Vers la Confluence',
      speaker: "Voknir Esh'Maradel",
      line:
        "*(un éclair d'espoir traverse son regard)* « Vraiment ? Vous feriez cela ? »",
      consequences: {
        flag: 'QUETE_TRACE_ENFANT_PERDU',
        description: 'Mène vers la quête secondaire « La Trace de l\'Enfant Perdu ».',
      },
    },
  }
}

function generatedNode() {
  return {
    id: GENERATED_ID,
    speaker: "Voknir Esh'Maradel",
    line: '« Par ici. »',
    choices: [
      { text: 'A', choiceId: 'c-a' },
      { text: 'B', choiceId: 'c-b' },
      { text: 'C', choiceId: 'c-c' },
    ],
  }
}

/** Options exactes passées par AIGenerationPanel pour une feuille en mode « suite ». */
const PANEL_OPTIONS = {
  context_selections: {},
  max_choices: null,
  target_choice_index: null,
  generate_all_choices: false,
}

function expectParentLinkedByNextNode() {
  const state = useGraphStore.getState()
  const parent = state.nodes.find((n) => n.id === PARENT_ID)
  const child = state.nodes.find((n) => n.id === GENERATED_ID)
  expect(child).toBeDefined()
  expect(child?.data?.status).toBe('pending')

  expect((parent?.data as { nextNode?: string }).nextNode).toBe(GENERATED_ID)

  const edge = state.edges.find((e) => e.source === PARENT_ID && e.target === GENERATED_ID)
  expect(edge).toBeDefined()
  // Une feuille n'expose que la poignée source par défaut (DialogueNode, `!hasChoices`) :
  // une arête sur une poignée `choice:*` n'est pas rendue par React Flow.
  expect(edge?.sourceHandle ?? null).toBeNull()
  expect((edge?.data as { edgeType?: string } | undefined)?.edgeType).toBe('nextNode')
}

describe('generateFromNode depuis une feuille (sans choix ni nextNode)', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
    useGenerationStore.getState().setContextDroppingRulesOverlay(null)
    vi.mocked(graphAPI.generateNode).mockReset()
    vi.mocked(graphAPI.detectContextDropping).mockResolvedValue({
      case_count: 0,
      summary: '',
    } as never)
    useGraphStore.getState().addNode(leafParent())
  })

  it('relie le parent au nouveau nœud quand l’API renvoie via_choice_index: null (forme réelle FastAPI)', async () => {
    vi.mocked(graphAPI.generateNode).mockResolvedValueOnce({
      node: generatedNode(),
      nodes: null,
      suggested_connections: [
        {
          from: PARENT_ID,
          to: GENERATED_ID,
          via_choice_index: null,
          connection_type: 'nextNode',
        },
      ],
      parent_node_id: PARENT_ID,
    } as never)

    await useGraphStore.getState().generateFromNode(PARENT_ID, 'Suite', PANEL_OPTIONS)

    expectParentLinkedByNextNode()
  })

  it('témoin : relie aussi quand via_choice_index est absent', async () => {
    vi.mocked(graphAPI.generateNode).mockResolvedValueOnce({
      node: generatedNode(),
      suggested_connections: [
        { from: PARENT_ID, to: GENERATED_ID, connection_type: 'nextNode' },
      ],
      parent_node_id: PARENT_ID,
    } as never)

    await useGraphStore.getState().generateFromNode(PARENT_ID, 'Suite', PANEL_OPTIONS)

    expectParentLinkedByNextNode()
  })

  it('relie le parent même si l’API ne suggère aucune connexion', async () => {
    vi.mocked(graphAPI.generateNode).mockResolvedValueOnce({
      node: generatedNode(),
      suggested_connections: [],
      parent_node_id: PARENT_ID,
    } as never)

    await useGraphStore.getState().generateFromNode(PARENT_ID, 'Suite', PANEL_OPTIONS)

    expectParentLinkedByNextNode()
  })
})
