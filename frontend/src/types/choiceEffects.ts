/**
 * Effets catalogue sur choix (Story 9.3) — aligné sur dialogue-format.schema.json + API Pydantic.
 */

export type CounterAdjustOperator = '=' | '+=' | '-='

export interface SetBoolEffect {
  kind: 'set_bool'
  flagId: string
  value: boolean
}

export interface AdjustCounterEffect {
  kind: 'adjust_counter'
  flagId: string
  operator: CounterAdjustOperator
  value: number
}

export interface SetEnumEffect {
  kind: 'set_enum'
  flagId: string
  value: string
}

export interface ReputationDeltaEffect {
  kind: 'reputation_delta'
  axisId: string
  factionId: string
  delta: number
}

export type ChoiceEffect =
  | SetBoolEffect
  | AdjustCounterEffect
  | SetEnumEffect
  | ReputationDeltaEffect
