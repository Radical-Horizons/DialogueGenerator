/**
 * Déduit l'index d'un choix depuis un sourceHandle React Flow (choice:N ou choice:__idx_N ou choice:choiceId).
 */
export function getChoiceIndexFromSourceHandle(
  sourceNodeId: string,
  sourceHandleId: string,
  nodes: Array<{ id: string; data?: { choices?: Array<{ choiceId?: string }> } }>
): number | undefined {
  if (sourceHandleId.startsWith('choice-')) {
    const n = parseInt(sourceHandleId.replace('choice-', ''), 10)
    return Number.isNaN(n) ? undefined : n
  }
  if (sourceHandleId.startsWith('choice:')) {
    const id = sourceHandleId.slice(7)
    if (id.startsWith('__idx_')) {
      const n = parseInt(id.replace('__idx_', ''), 10)
      return Number.isNaN(n) ? undefined : n
    }
    const source = nodes.find((n) => n.id === sourceNodeId)
    const choices = (source?.data?.choices ?? []) as Array<{ choiceId?: string }>
    const idx = choices.findIndex((c, i) => (c?.choiceId ?? `__idx_${i}`) === id)
    return idx >= 0 ? idx : undefined
  }
  return undefined
}
