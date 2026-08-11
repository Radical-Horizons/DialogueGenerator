/** Focus nœud différé après ouverture depuis un rapport de validation batch. */

let pendingFocusNodeId: string | undefined

export function setPendingValidationFocus(nodeId?: string): void {
  pendingFocusNodeId = nodeId || undefined
}

export function consumePendingValidationFocus(): string | undefined {
  const value = pendingFocusNodeId
  pendingFocusNodeId = undefined
  return value
}
