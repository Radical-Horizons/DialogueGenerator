/**
 * Builders réutilisables pour les edges du graphe (choix, résultats de test).
 * Source unique pour IDs, labels tronqués et config des edges TestNode → résultat.
 */
import type { Edge } from 'reactflow'

/** Longueur max du label affiché sur les edges de choix. */
export const CHOICE_LABEL_MAX_LENGTH = 30

/** Config des 4 résultats de test (TestNode → nœud de résultat). */
export const TEST_RESULT_EDGE_CONFIG = [
  {
    field: 'testCriticalFailureNode' as const,
    handleId: 'critical-failure',
    label: 'Échec critique',
    color: '#C0392B',
  },
  {
    field: 'testFailureNode' as const,
    handleId: 'failure',
    label: 'Échec',
    color: '#E74C3C',
  },
  {
    field: 'testSuccessNode' as const,
    handleId: 'success',
    label: 'Réussite',
    color: '#27AE60',
  },
  {
    field: 'testCriticalSuccessNode' as const,
    handleId: 'critical-success',
    label: 'Réussite critique',
    color: '#229954',
  },
] as const

/**
 * Tronque le texte du choix pour l'affichage sur l'edge (max 30 caractères).
 * Fallback : "Choix {choiceIndex + 1}".
 */
export function truncateChoiceLabel(
  choiceText: string | undefined,
  choiceIndex: number
): string {
  const text = choiceText ?? `Choix ${choiceIndex + 1}`
  return text.length > CHOICE_LABEL_MAX_LENGTH
    ? `${text.substring(0, CHOICE_LABEL_MAX_LENGTH)}...`
    : text
}

/**
 * ID canonique pour un edge choix → cible (DialogueNode → node ou END).
 * Aligné backend / NodeEditorPanel disconnect.
 */
export function choiceEdgeId(
  sourceId: string,
  choiceIndex: number,
  targetId: string
): string {
  return `${sourceId}-choice${choiceIndex}->${targetId}`
}

/**
 * ID canonique pour un edge choix → TestNode.
 */
export function choiceToTestEdgeId(sourceId: string, choiceIndex: number): string {
  return `${sourceId}-choice-${choiceIndex}-to-test`
}

/**
 * ID stable ADR-008 pour un edge de choix (DialogueNode → cible).
 * Important: n'inclut PAS la cible, afin que retargeter un choix conserve le même edgeId.
 *
 * Format: e:{sourceId}:choice:{stableChoiceId}
 * où stableChoiceId = choiceId (v1.1.0) ou fallback "__idx_N" (legacy).
 */
export function stableChoiceEdgeId(sourceId: string, stableChoiceId: string): string {
  return `e:${sourceId}:choice:${stableChoiceId}`
}

export interface BuildChoiceEdgeParams {
  sourceId: string
  targetId: string
  choiceIndex: number
  choiceText?: string
  /** ADR-008 : identité stable ; si fourni, sourceHandle = choice:choiceId et edge id stable. */
  choiceId?: string
  /** Si absent, déduit de choiceId ou choiceEdgeId(sourceId, choiceIndex, targetId). */
  edgeId?: string
}

/**
 * Construit un edge de type choix (DialogueNode → cible ou TestNode).
 * Si choiceId fourni : sourceHandle = choice:choiceId, id = e:sourceId:choice:choiceId (ADR-008).
 */
export function buildChoiceEdge(params: BuildChoiceEdgeParams): Edge {
  const { sourceId, targetId, choiceIndex, choiceText, choiceId, edgeId } = params
  const stableId = choiceId ?? `__idx_${choiceIndex}`
  const id = edgeId ?? stableChoiceEdgeId(sourceId, stableId)
  const label = truncateChoiceLabel(choiceText, choiceIndex)
  return {
    id,
    source: sourceId,
    target: targetId,
    sourceHandle: `choice:${stableId}`,
    type: 'smoothstep',
    label,
    data: {
      edgeType: 'choice',
      choiceIndex,
      ...(choiceId && { choiceId }),
    },
  }
}

/**
 * Construit un edge TestNode → nœud de résultat (critical-failure, failure, success, critical-success).
 */
export function buildTestResultEdge(
  testNodeId: string,
  targetId: string,
  handleId: string,
  label: string,
  color: string
): Edge {
  return {
    id: `${testNodeId}-${handleId}-${targetId}`,
    source: testNodeId,
    target: targetId,
    sourceHandle: handleId,
    type: 'smoothstep',
    label,
    style: { stroke: color },
  }
}
