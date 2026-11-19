/**
 * Régression (2026-11-19) : sur un dialogue importé (Voknir), « Générer la suite » envoyait
 * la scène du panneau de contexte — PNJ Uresaïr, PJ L'Éthérée — au lieu de celle du dialogue.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Edge, Node } from 'reactflow'
import { useGraphStore } from '../store/graphStore'
import { useGenerationStore } from '../store/generationStore'
import * as graphAPI from '../api/graph'

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

const VOKNIR = "Voknir Esh'Maradel"
const panelSelections = { characters_full: ["L'Éthérée", 'Uresaïr'], characters_excerpt: [] }

function voknirNode(id: string, line: string): Node {
  return { id, type: 'dialogueNode', position: { x: 0, y: 0 }, data: { id, speaker: VOKNIR, line, choices: [] } }
}

describe('generationSlice — PJ/PNJ lus dans le dialogue ouvert', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
    useGenerationStore.getState().setContextDroppingRulesOverlay(null)
    vi.clearAllMocks()
    vi.mocked(graphAPI.detectContextDropping).mockResolvedValue({
      summary: '0 cas',
      case_count: 0,
      cases: [],
      rules_profile_effective: 'strict',
      message: null,
    })
  })

  it('generateFromNode envoie Voknir (PNJ) et Uresaïr (PJ) malgré les valeurs du panneau', async () => {
    useGraphStore.getState().addNode(voknirNode('START', '*Le cartographe se détourne d’Uresaïr.*'))
    useGraphStore.getState().addNode(voknirNode('node-respect-3', '« C’est l’atelier qui le déplace. »'))
    vi.mocked(graphAPI.generateNode).mockResolvedValue({
      node: { id: 'node-gen-1', type: 'dialogueNode', speaker: VOKNIR, line: '« Écoutez. »' },
      suggested_connections: [],
      parent_node_id: 'node-respect-3',
    })

    await useGraphStore.getState().generateFromNode('node-respect-3', 'Suite', {
      context_selections: panelSelections,
      npc_speaker_id: 'Uresaïr',
      player_character_id: "L'Éthérée",
    })

    expect(graphAPI.generateNode).toHaveBeenCalledWith(
      expect.objectContaining({ npc_speaker_id: VOKNIR, player_character_id: 'Uresaïr' }),
      expect.any(Object),
    )
  })

  it('regenerateNode transmet la scène du dialogue (PJ + scene_protagonists)', async () => {
    useGraphStore.getState().addNode(voknirNode('START', '*Il se tourne vers Uresaïr.*'))
    const child: Node = {
      ...voknirNode('node-child', '« Les cartes saignent. »'),
      data: {
        id: 'node-child',
        speaker: VOKNIR,
        line: '« Les cartes saignent. »',
        choices: [],
        gddContextSelectionsSnapshot: {
          ...panelSelections,
          scene_protagonists: { personnage_a: "L'Éthérée", personnage_b: 'Uresaïr' },
        },
      },
    }
    useGraphStore.getState().addNode(child)
    const edge: Edge = { id: 'START->node-child', source: 'START', target: 'node-child' }
    useGraphStore.setState({ edges: [edge] })
    vi.mocked(graphAPI.regenerateNode).mockResolvedValue({
      node: { id: 'node-child', speaker: VOKNIR, line: '« Autre version. »' },
      suggested_connections: [],
    })

    await useGraphStore.getState().regenerateNode('node-child', 'Plus sec')

    expect(graphAPI.regenerateNode).toHaveBeenCalledWith(
      'node-child',
      expect.objectContaining({
        player_character_id: 'Uresaïr',
        context_selections: expect.objectContaining({
          scene_protagonists: { personnage_a: 'Uresaïr', personnage_b: VOKNIR },
        }),
      }),
    )
  })
})
