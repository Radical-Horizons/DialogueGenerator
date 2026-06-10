export const DEFAULT_EFFORT_POOL = 10

export interface ChoiceEffortCost {
  effortCost?: number
}

export interface EffortPreviewState {
  availablePool?: number
}

export interface EffortAccessResult {
  accessible: boolean
  availablePool: number
  cost: number
  disabledReason?: string
}

export function formatEffortDisabledReason(availablePool: number, cost: number): string {
  return `Effort insuffisant : ${availablePool} PE disponibles, coût ${cost} PE.`
}

export function evaluateChoiceEffortAccess(
  choice: ChoiceEffortCost,
  state: EffortPreviewState,
): EffortAccessResult {
  const availablePool = state.availablePool ?? DEFAULT_EFFORT_POOL
  const cost = Math.max(0, choice.effortCost ?? 0)
  if (availablePool >= cost) {
    return { accessible: true, availablePool, cost }
  }
  return {
    accessible: false,
    availablePool,
    cost,
    disabledReason: formatEffortDisabledReason(availablePool, cost),
  }
}
