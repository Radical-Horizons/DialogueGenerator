/**
 * Les estimations de coût mesurent la requête de la fiche de scène (story 20.4).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { Node } from 'reactflow'
import { ReactFlowProvider } from 'reactflow'
import { AIGenerationPanel } from '../components/graph/AIGenerationPanel'
import { NodeEditorPanel } from '../components/graph/NodeEditorPanel'
import { useGraphStore } from '../store/graphStore'
import { useContextStore } from '../store/contextStore'
import { useSceneProfileStore } from '../store/sceneProfileStore'

const captured = vi.hoisted(() => ({
  badge: null as Record<string, unknown> | null,
  editor: null as Record<string, unknown> | null,
}))

vi.mock('../components/graph/CostEstimationBadge', () => ({
  CostEstimationBadge: ({ estimateRequest }: { estimateRequest: Record<string, unknown> }) => {
    captured.badge = estimateRequest
    return null
  },
}))
vi.mock('../hooks/useEstimation', () => ({
  useEstimation: (input: { request: Record<string, unknown> }) => {
    captured.editor = input.request
    return {
      result: null,
      state: 'idle',
      error: null,
      runEstimate: vi.fn(),
      budgetExceeded: false,
      budgetWarning90: false,
    }
  },
}))
vi.mock('../hooks/useCostGovernance', () => ({
  useCostGovernance: () => ({ checkBudget: vi.fn(), isBlocked: false }),
}))
vi.mock('../api/authorProfiles', () => ({
  listAuthorProfilesApi: vi.fn().mockResolvedValue([]),
  listPrebuiltAuthorProfilesApi: vi.fn().mockResolvedValue([
    { id: 'sobre', name: 'Sobre', description: '', content: 'Sois sobre.' },
  ]),
}))
vi.mock('../api/config', () => ({
  listLLMModels: vi.fn().mockResolvedValue({ models: [], total: 0 }),
}))

const node: Node = {
  id: 'START',
  type: 'dialogueNode',
  position: { x: 0, y: 0 },
  data: { id: 'START', speaker: 'Autre voix', line: 'Bonjour', choices: [] },
}

const SHEET_REQUEST = {
  narrative_tags: ['tension'],
  author_profile: 'Sois sobre.',
  npc_speaker_id: 'PNJ de la fiche',
  player_character_id: 'Vethraak',
  user_instructions:
    'Brief de la scène : Un marché.\n\nEcris la réponse du PNJ à ce que dit le PJ',
  context_selections: expect.objectContaining({
    characters_full: ['PNJ de la fiche'],
    characters_excerpt: ['Vethraak'],
    scene_location: { lieu: 'Sous un pont' },
    scene_protagonists: { personnage_a: 'Vethraak', personnage_b: 'PNJ de la fiche' },
  }),
}

beforeEach(() => {
  captured.badge = null
  captured.editor = null
  useGraphStore.getState().resetGraph()
  useSceneProfileStore.setState({
    voices: [
      { id: 'sobre', name: 'Sobre', description: '', content: 'Sois sobre.', prebuilt: true },
    ],
    status: 'ready',
  })
  useContextStore.setState((state) => ({
    selections: { ...state.selections, characters_full: ['Personnage de la colonne'] },
  }))
  useGraphStore.setState({
    nodes: [node],
    selectedNodeId: 'START',
    scene: {
      npcs: [{ name: 'PNJ de la fiche', entryId: null }],
      pc: { name: 'Vethraak', entryId: null },
      place: { name: 'Sous un pont', entryId: null },
      brief: 'Un marché.',
      linkedEntries: [],
      tones: ['tension'],
      authorProfileId: 'sobre',
    },
  })
})

describe('estimations : la fiche de scène, jamais la colonne', () => {
  it('panneau « Générer la suite »', () => {
    render(<AIGenerationPanel parentNodeId="START" onClose={() => {}} />)

    expect(captured.badge).toMatchObject(SHEET_REQUEST)
    expect(JSON.stringify(captured.badge)).not.toContain('Personnage de la colonne')
  })

  it('panneau d’édition du nœud', () => {
    render(
      <ReactFlowProvider>
        <NodeEditorPanel />
      </ReactFlowProvider>,
    )

    expect(captured.editor).toMatchObject(SHEET_REQUEST)
    expect(JSON.stringify(captured.editor)).not.toContain('Personnage de la colonne')
  })
})
