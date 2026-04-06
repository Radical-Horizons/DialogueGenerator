import type { ValidationErrorDetail } from '../types/graph'

/**
 * Supprime les signalements de validation liés à des nœuds qui n'existent plus (FR40).
 * Évite des avertissements fantômes après suppression simple ou en lot.
 */
export function pruneGraphValidationDiagnostics<
  T extends {
    validationErrors: ValidationErrorDetail[]
    highlightedNodeIds: string[]
    highlightedCycleNodes: string[]
  },
>(state: T, survivingNodeIds: ReadonlySet<string>): Pick<
  T,
  'validationErrors' | 'highlightedNodeIds' | 'highlightedCycleNodes'
> {
  const keepIssue = (e: ValidationErrorDetail): boolean => {
    if (
      e.type === 'cycle_detected' &&
      e.cycle_nodes &&
      Array.isArray(e.cycle_nodes) &&
      e.cycle_nodes.length > 0
    ) {
      return e.cycle_nodes.every((id) => typeof id === 'string' && survivingNodeIds.has(id))
    }
    return e.node_id == null || e.node_id === '' || survivingNodeIds.has(e.node_id)
  }

  const droppedCycleNodeIds = new Set<string>()
  const prunedErrors: ValidationErrorDetail[] = []
  for (const e of state.validationErrors) {
    if (keepIssue(e)) {
      prunedErrors.push(e)
      continue
    }
    if (e.type === 'cycle_detected' && e.cycle_nodes && Array.isArray(e.cycle_nodes)) {
      for (const id of e.cycle_nodes) {
        if (typeof id === 'string') {
          droppedCycleNodeIds.add(id)
        }
      }
    }
  }

  return {
    validationErrors: prunedErrors,
    highlightedNodeIds: state.highlightedNodeIds.filter((id) => survivingNodeIds.has(id)),
    highlightedCycleNodes: state.highlightedCycleNodes.filter(
      (id) => survivingNodeIds.has(id) && !droppedCycleNodeIds.has(id)
    ),
  }
}
