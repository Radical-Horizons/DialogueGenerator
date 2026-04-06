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
  const keepIssue = (e: ValidationErrorDetail): boolean =>
    e.node_id == null || e.node_id === '' || survivingNodeIds.has(e.node_id)

  return {
    validationErrors: state.validationErrors.filter(keepIssue),
    highlightedNodeIds: state.highlightedNodeIds.filter((id) => survivingNodeIds.has(id)),
    highlightedCycleNodes: state.highlightedCycleNodes.filter((id) => survivingNodeIds.has(id)),
  }
}
