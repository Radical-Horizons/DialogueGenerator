/**
 * Conditions de visibilité structurées (Story 9.2) — aligné sur dialogue-format.schema.json.
 */
export type VisibilityCombinator = 'AND' | 'OR'

export type ComparisonOperator = '=' | '!=' | '>=' | '<=' | '>' | '<'

export interface FlagBoolCondition {
  kind: 'flag_bool'
  flagId: string
  equals: boolean
}

export interface FlagCounterCondition {
  kind: 'flag_counter'
  flagId: string
  operator: ComparisonOperator
  value: number
}

export interface FlagEnumCondition {
  kind: 'flag_enum'
  flagId: string
  operator: '=' | '!='
  value: string
}

export interface ReputationCondition {
  kind: 'reputation'
  axisId: string
  factionId: string
  operator: ComparisonOperator
  threshold: number
}

export type ConditionAtom =
  | FlagBoolCondition
  | FlagCounterCondition
  | FlagEnumCondition
  | ReputationCondition

export interface VisibilityConditionsBlock {
  combinator: VisibilityCombinator
  items: ConditionAtom[]
}

/** État minimal pour évaluer les conditions en local (Story 9.2 / préparation 9.4). */
export interface VisibilityEvalState {
  /** Valeurs runtime des flags référencés (bool / nombre / enum string). */
  flags: Record<string, boolean | number | string>
  /** Réputation courante par clé stable `${axisId}::${factionId}`. */
  reputation: Record<string, number>
}
