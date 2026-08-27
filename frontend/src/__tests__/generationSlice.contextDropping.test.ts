import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGraphStore } from '../store/graphStore'
import { useGenerationStore } from '../store/generationStore'
import * as graphAPI from '../api/graph'
import { DEFAULT_CONTEXT_DROPPING_RULES, withAntiDropClause } from '../utils/contextDroppingOverlay'
import type { Node } from 'reactflow'

vi.mock('../api/graph', () => ({
  generateNode: vi.fn(),
  regenerateNode: vi.fn(),
  detectContextDropping: vi.fn(),
  loadGraph: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

describe('generationSlice — overlay anti-drop [6.5]', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
    useGenerationStore.getState().clearTemplateSession()
    useGenerationStore.getState().setContextDroppingWarning(null)
    vi.clearAllMocks()
  })

  it('injecte la clause dans user_instructions à l’envoi seulement', async () => {
    const parentNode: Node = {
      id: 'parent-1',
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: { id: 'parent-1', speaker: 'PNJ', line: 'Parent' },
    }
    useGraphStore.getState().addNode(parentNode)
    useGenerationStore.getState().setContextDroppingRulesOverlay(DEFAULT_CONTEXT_DROPPING_RULES)
    vi.mocked(graphAPI.generateNode).mockResolvedValue({
      node: {
        id: 'generated-1',
        type: 'dialogueNode',
        speaker: 'PNJ',
        line: 'Réponse',
      },
      suggested_connections: [],
      parent_node_id: 'parent-1',
    })
    vi.mocked(graphAPI.detectContextDropping).mockResolvedValue({
      summary: '0 cas',
      case_count: 0,
      cases: [],
      rules_profile_effective: 'strict',
      message: null,
    })

    await useGraphStore.getState().generateFromNode('parent-1', 'Brief canvas', {})

    expect(graphAPI.generateNode).toHaveBeenCalledWith(
      expect.objectContaining({
        user_instructions: withAntiDropClause('Brief canvas', DEFAULT_CONTEXT_DROPPING_RULES),
      }),
      expect.any(Object),
    )
  })

  it('post-detect pose un warning si des cas existent, sans faire échouer la génération', async () => {
    const parentNode: Node = {
      id: 'parent-1',
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: { id: 'parent-1', speaker: 'PNJ', line: 'Parent' },
    }
    useGraphStore.getState().addNode(parentNode)
    useGenerationStore.getState().setContextDroppingRulesOverlay({
      ...DEFAULT_CONTEXT_DROPPING_RULES,
      rules_profile: 'strict',
    })
    vi.mocked(graphAPI.generateNode).mockResolvedValue({
      node: {
        id: 'generated-1',
        type: 'dialogueNode',
        speaker: 'PNJ',
        line: 'Réponse sans lore',
      },
      suggested_connections: [],
      parent_node_id: 'parent-1',
    })
    vi.mocked(graphAPI.detectContextDropping).mockResolvedValue({
      summary: '2 cas de context dropping détectés',
      case_count: 2,
      cases: [],
      rules_profile_effective: 'strict',
      message: null,
    })

    const result = await useGraphStore.getState().generateFromNode('parent-1', 'Brief', {
      context_selections: { characters_full: ['char-alpha'] },
    })

    expect(result.nodeId).toBe('generated-1')
    await vi.waitFor(() => {
      expect(useGenerationStore.getState().contextDroppingWarning).toBe(
        '2 cas de context dropping détectés',
      )
    })
    expect(graphAPI.detectContextDropping).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ rules_profile: 'strict' }),
      }),
    )
  })

  it('n’appelle pas detect si aucun overlay', async () => {
    const parentNode: Node = {
      id: 'parent-1',
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: { id: 'parent-1', speaker: 'PNJ', line: 'Parent' },
    }
    useGraphStore.getState().addNode(parentNode)
    vi.mocked(graphAPI.generateNode).mockResolvedValue({
      node: {
        id: 'generated-1',
        type: 'dialogueNode',
        speaker: 'PNJ',
        line: 'Réponse',
      },
      suggested_connections: [],
      parent_node_id: 'parent-1',
    })

    await useGraphStore.getState().generateFromNode('parent-1', 'Brief', {})

    expect(graphAPI.generateNode).toHaveBeenCalledWith(
      expect.objectContaining({ user_instructions: 'Brief' }),
      expect.any(Object),
    )
    expect(graphAPI.detectContextDropping).not.toHaveBeenCalled()
  })

  it('envoie template_id et template_name si un template est chargé', async () => {
    const parentNode: Node = {
      id: 'parent-1',
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: { id: 'parent-1', speaker: 'PNJ', line: 'Parent' },
    }
    useGraphStore.getState().addNode(parentNode)
    useGenerationStore.getState().setAppliedTemplate('confrontation', 'Confrontation')
    vi.mocked(graphAPI.generateNode).mockResolvedValue({
      node: {
        id: 'generated-1',
        type: 'dialogueNode',
        speaker: 'PNJ',
        line: 'Réponse',
      },
      suggested_connections: [],
      parent_node_id: 'parent-1',
    })

    await useGraphStore.getState().generateFromNode('parent-1', 'Brief', {})

    expect(graphAPI.generateNode).toHaveBeenCalledWith(
      expect.objectContaining({
        template_id: 'confrontation',
        template_name: 'Confrontation',
      }),
      expect.any(Object),
    )
  })

  it('injecte la clause aussi sur regenerateNode', async () => {
    const parentNode: Node = {
      id: 'parent-1',
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: { id: 'parent-1', speaker: 'PNJ', line: 'Parent' },
    }
    const childNode: Node = {
      id: 'child-1',
      type: 'dialogueNode',
      position: { x: 0, y: 120 },
      data: { id: 'child-1', speaker: 'PNJ', line: 'Enfant' },
    }
    useGraphStore.getState().addNode(parentNode)
    useGraphStore.getState().addNode(childNode)
    useGraphStore.setState({
      edges: [{ id: 'e1', source: 'parent-1', target: 'child-1' }],
    })
    useGenerationStore.getState().setContextDroppingRulesOverlay(DEFAULT_CONTEXT_DROPPING_RULES)
    vi.mocked(graphAPI.regenerateNode).mockResolvedValue({
      node: { id: 'child-1', type: 'dialogueNode', speaker: 'PNJ', line: 'Régénéré' },
      suggested_connections: [],
    })
    vi.mocked(graphAPI.detectContextDropping).mockResolvedValue({
      summary: '0 cas',
      case_count: 0,
      cases: [],
      rules_profile_effective: 'strict',
      message: null,
    })

    await useGraphStore.getState().regenerateNode('child-1', 'Ton plus sombre')

    expect(graphAPI.regenerateNode).toHaveBeenCalledWith(
      'child-1',
      expect.objectContaining({
        new_instructions: withAntiDropClause('Ton plus sombre', DEFAULT_CONTEXT_DROPPING_RULES),
      }),
    )
  })
})
