/**
 * Builders réutilisables pour les edges du graphe (choix, résultats de test).
 * Source unique pour IDs, labels tronqués et config des edges TestNode → résultat.
 *
 * IDs canoniques (ADR-008, éviter régressions double edge / flicker) :
 * - Choix → cible : e:{sourceId}:choice:{stableChoiceId} (stableChoiceEdgeId)
 * - Choix → TestNode : e:{sourceId}:choice:{stableChoiceId}:test (documentToGraph + testNodeSync)
 * - TestNode id : test:{choiceId} ou test-node-{nodeId}-choice-{index} (legacy)
 */
import type { Edge } from 'reactflow'
import { theme } from '../theme'
import { redesignAccent, redesignGraphEdge } from '../theme/redesignTokens'

/** Longueur max du label affiché sur les edges de choix. */
export const CHOICE_LABEL_MAX_LENGTH = 30

/**
 * Écran 2e : un seul trait neutre de 1,5 px pour les choix et les suites. Le type de lien
 * se lit déjà à son handle et à son libellé ; la couleur est réservée aux issues de test
 * et au chemin sortant du nœud sélectionné.
 */
export const EDGE_NEUTRAL_COLOR = redesignGraphEdge.neutral
export const EDGE_STROKE_WIDTH = 1.5
export const SELECTED_OUTGOING_EDGE_COLOR = redesignAccent.base
export const CHOICE_EDGE_COLOR = EDGE_NEUTRAL_COLOR
export const NEXT_EDGE_COLOR = EDGE_NEUTRAL_COLOR

/**
 * Couleurs des 4 issues de test. Elles encodent le résultat et doivent rester identiques
 * aux libellés colorés du TestNode (`É. CRIT`, `ÉCHEC`, `RÉUSSITE`, `R. CRIT`).
 */
export const TEST_RESULT_EDGE_COLORS = {
  criticalFailure: '#C0392B',
  failure: '#E74C3C',
  success: '#27AE60',
  criticalSuccess: '#0088FF',
} as const

/** Config des 4 résultats de test (TestNode → nœud de résultat). */
export const TEST_RESULT_EDGE_CONFIG = [
  {
    field: 'testCriticalFailureNode' as const,
    handleId: 'critical-failure',
    label: 'Échec critique',
    color: TEST_RESULT_EDGE_COLORS.criticalFailure,
  },
  {
    field: 'testFailureNode' as const,
    handleId: 'failure',
    label: 'Échec',
    color: TEST_RESULT_EDGE_COLORS.failure,
  },
  {
    field: 'testSuccessNode' as const,
    handleId: 'success',
    label: 'Réussite',
    color: TEST_RESULT_EDGE_COLORS.success,
  },
  {
    field: 'testCriticalSuccessNode' as const,
    handleId: 'critical-success',
    label: 'Réussite critique',
    color: TEST_RESULT_EDGE_COLORS.criticalSuccess,
  },
] as const

export function testResultEdgeColor(sourceHandle?: string | null): string | undefined {
  if (!sourceHandle) return undefined
  return TEST_RESULT_EDGE_CONFIG.find((c) => c.handleId === sourceHandle)?.color
}

export function edgeStrokeFromSourceHandle(sourceHandle?: string): string | undefined {
  if (!sourceHandle) return undefined
  if (sourceHandle.startsWith('choice:')) return CHOICE_EDGE_COLOR
  return testResultEdgeColor(sourceHandle)
}

export function edgeStrokeFromSource(params: {
  sourceHandle?: string
  connectionType?: string
  edgeLabel?: string
}): string | undefined {
  const fromHandle = edgeStrokeFromSourceHandle(params.sourceHandle)
  if (fromHandle) return fromHandle
  if (params.connectionType === 'nextNode' || params.edgeLabel === 'Suivant') {
    return NEXT_EDGE_COLOR
  }
  return undefined
}

/**
 * Couleur d'un lien sur le canvas. Priorité : issue de test (elle encode le résultat,
 * y compris quand son TestNode est sélectionné) > chemin sortant du nœud sélectionné > neutre.
 */
export function canvasEdgeStroke(
  edge: Pick<Edge, 'source' | 'sourceHandle'>,
  selectedNodeId: string | null
): string {
  const outcome = testResultEdgeColor(edge.sourceHandle)
  if (outcome) return outcome
  if (selectedNodeId !== null && edge.source === selectedNodeId) {
    return SELECTED_OUTGOING_EDGE_COLOR
  }
  return EDGE_NEUTRAL_COLOR
}

/**
 * Style d'un lien hors sélection. Le trait est posé explicitement : React Flow fusionne
 * `defaultEdgeOptions` en surface, donc un lien qui porte son propre `style` perdrait
 * l'épaisseur par défaut.
 */
export function toRestingCanvasEdge(edge: Edge, isBrokenTarget: boolean): Edge {
  if (isBrokenTarget) {
    return {
      ...edge,
      style: {
        ...edge.style,
        stroke: theme.state.error.border,
        strokeDasharray: '8,4',
        opacity: 0.5,
      },
      animated: false,
    }
  }
  return {
    ...edge,
    style: {
      ...edge.style,
      stroke: canvasEdgeStroke(edge, null),
      strokeWidth: EDGE_STROKE_WIDTH,
    },
  }
}

/**
 * Passe à l'accent les liens sortants du nœud sélectionné. Les autres liens gardent leur
 * référence, pour que React Flow ne re-rende que ceux qui changent à chaque sélection.
 */
export function highlightSelectedOutgoingEdges(
  edges: Edge[],
  selectedNodeId: string | null,
  brokenTargets: ReadonlySet<string>
): Edge[] {
  if (selectedNodeId === null) return edges
  return edges.map((edge) => {
    if (edge.source !== selectedNodeId || brokenTargets.has(edge.target)) return edge
    const stroke = canvasEdgeStroke(edge, selectedNodeId)
    if (edge.style?.stroke === stroke) return edge
    return { ...edge, style: { ...edge.style, stroke } }
  })
}

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
    style: { stroke: CHOICE_EDGE_COLOR },
    data: {
      edgeType: 'choice',
      choiceIndex,
      ...(choiceId && { choiceId }),
      ...(choiceText !== undefined && choiceText !== '' && { choiceText }),
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
    data: { edgeType: handleId },
  }
}
