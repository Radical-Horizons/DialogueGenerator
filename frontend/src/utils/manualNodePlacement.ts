/**
 * Position d'un nœud créé depuis la toolbar : dans la zone visible, pas à une coordonnée fixe
 * du graphe qui peut se trouver loin de la vue courante.
 */
import type { ReactFlowInstance } from 'reactflow'
import {
  MANUAL_NODE_CASCADE_LENGTH,
  MANUAL_NODE_OFFSET_X,
  MANUAL_NODE_OFFSET_Y,
  MANUAL_NODE_STEP,
  MANUAL_NODE_STEP_Y,
} from '../components/graph/graphToolbarConstants'
import { GRAPH_DIALOGUE_NODE_WIDTH } from './graphNodeLayout'

/** Hauteur d'un nœud vide, pour le centrer verticalement. */
const EMPTY_NODE_HEIGHT_PX = 120

/**
 * Centre de la vue, en escalier pour que des créations successives ne s'empilent pas.
 *
 * @param instance - Instance React Flow, `null` si le canvas n'est pas monté.
 * @param canvasElement - Conteneur du canvas.
 * @param dialogueNodeCount - Nombre de nœuds de dialogue existants (rang dans l'escalier).
 * @returns Coordonnées graphe du coin supérieur gauche du nouveau nœud.
 */
export function manualNodePositionInView(
  instance: ReactFlowInstance | null,
  canvasElement: HTMLElement | null,
  dialogueNodeCount: number
): { x: number; y: number } {
  const rect = canvasElement?.getBoundingClientRect()
  if (!instance || !rect || rect.width === 0 || rect.height === 0) {
    return {
      x: MANUAL_NODE_OFFSET_X + dialogueNodeCount * MANUAL_NODE_STEP,
      y: MANUAL_NODE_OFFSET_Y + dialogueNodeCount * MANUAL_NODE_STEP_Y,
    }
  }
  const center = instance.screenToFlowPosition({
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  })
  const step = dialogueNodeCount % MANUAL_NODE_CASCADE_LENGTH
  return {
    x: center.x - GRAPH_DIALOGUE_NODE_WIDTH / 2 + step * MANUAL_NODE_STEP,
    y: center.y - EMPTY_NODE_HEIGHT_PX / 2 + step * MANUAL_NODE_STEP_Y,
  }
}
