export type ReputationAxis = 'Admiration' | 'Prestige' | 'Crainte'
export type SocialTargetKind = 'heroine' | 'npc' | 'community'
export type ReputationReadMode = 'raw_npc' | 'final_npc' | 'community_calculated'
export type RepPalier =
  | 'Hostilité'
  | 'Rejet'
  | 'Méfiance'
  | 'Distance'
  | 'Neutre'
  | 'Sympathie'
  | 'Faveur'
  | 'Dévotion'
  | 'Icône'

export type ReputationComparisonOperator = '=' | '!=' | '>=' | '<=' | '>' | '<'

export interface SocialTarget {
  kind: SocialTargetKind
  id: string
}

export interface ReputationConditionFr94 {
  heroineId: string
  target: SocialTarget
  axis: ReputationAxis
  readMode: ReputationReadMode
  operator: ReputationComparisonOperator
  threshold: number
}

export interface ReputationPreviewStateFr94 {
  values: Record<string, number>
}

export interface ReputationConditionResultFr94 {
  satisfied: boolean
  currentValue: number
  currentPalier: RepPalier
}

export function legacyReputationStateKey(axisId: string, factionId: string): string {
  return `${axisId}::${factionId}`
}

export function reputationStateKey(condition: ReputationConditionFr94): string {
  return [
    'fr94',
    condition.heroineId,
    condition.target.kind,
    condition.target.id,
    condition.axis,
    condition.readMode,
  ].join('::')
}

export function calculateRepPalier(value: number): RepPalier {
  if (value < -60) return 'Hostilité'
  if (value < -30) return 'Rejet'
  if (value < -10) return 'Méfiance'
  if (value < 0) return 'Distance'
  if (value < 10) return 'Neutre'
  if (value < 30) return 'Sympathie'
  if (value < 60) return 'Faveur'
  if (value < 90) return 'Dévotion'
  return 'Icône'
}

function compareReputationValue(
  left: number,
  operator: ReputationComparisonOperator,
  right: number,
): boolean {
  switch (operator) {
    case '=':
      return left === right
    case '!=':
      return left !== right
    case '>=':
      return left >= right
    case '<=':
      return left <= right
    case '>':
      return left > right
    case '<':
      return left < right
  }
}

export function evaluateReputationCondition(
  condition: ReputationConditionFr94,
  state: ReputationPreviewStateFr94,
): ReputationConditionResultFr94 {
  const currentValue = state.values[reputationStateKey(condition)] ?? 0
  return {
    satisfied: compareReputationValue(currentValue, condition.operator, condition.threshold),
    currentValue,
    currentPalier: calculateRepPalier(currentValue),
  }
}
