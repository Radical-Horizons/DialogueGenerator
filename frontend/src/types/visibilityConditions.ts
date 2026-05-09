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

export type ReputationAxisFr94 = 'Admiration' | 'Prestige' | 'Crainte'
export type ReputationTargetKindFr94 = 'heroine' | 'npc' | 'community'
export type ReputationReadModeFr94 = 'raw_npc' | 'final_npc' | 'community_calculated'

export interface ReputationConditionFr94 {
  kind: 'reputation_fr94'
  heroineId: string
  target: {
    kind: ReputationTargetKindFr94
    id: string
  }
  axis: ReputationAxisFr94
  readMode: ReputationReadModeFr94
  operator: ComparisonOperator
  threshold: number
}

export interface FactionTitleCondition {
  kind: 'faction_title'
  flagId?: string
  titleId?: string
}

export type ConditionAtom =
  | FlagBoolCondition
  | FlagCounterCondition
  | FlagEnumCondition
  | ReputationCondition
  | ReputationConditionFr94
  | FactionTitleCondition

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
