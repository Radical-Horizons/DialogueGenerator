/**
 * Types TypeScript pour les flags in-game.
 */

// Union type pour les valeurs de flags
export type FlagValue = boolean | number | string

export interface FlagDefinition {
  id: string
  type: 'bool' | 'int' | 'float' | 'string'
  category: string
  label: string
  description?: string
  defaultValue: string
  defaultValueParsed?: boolean | number | string  // Valeur parsée selon le type
  tags: string[]
  isFavorite: boolean
  /** Type fonctionnel FR89 (catalogue enrichi). */
  semanticType?: string
  scope?: string
  minValue?: boolean | number | string
  maxValue?: boolean | number | string
  enumValues?: string[]
}

export interface InGameFlag {
  id: string
  value: FlagValue
  category?: string
  timestamp?: string
}

export interface FlagsCatalogResponse {
  flags: FlagDefinition[]
  total: number
}

export interface UpsertFlagRequest {
  id: string
  type: 'bool' | 'int' | 'float' | 'string'
  category: string
  label: string
  description?: string
  defaultValue: string
  tags: string[]
  isFavorite: boolean
}

export interface UpsertFlagResponse {
  success: boolean
  flag: FlagDefinition
}

export interface ToggleFavoriteRequest {
  flag_id: string
  is_favorite: boolean
}

export interface ToggleFavoriteResponse {
  success: boolean
  flag_id: string
  is_favorite: boolean
}

export interface FlagSnapshot {
  version: string
  timestamp?: string
  flags: Record<string, FlagValue>
}

export interface ImportSnapshotRequest {
  snapshot_json: string
}

export interface ImportSnapshotResponse {
  success: boolean
  imported_count: number
  warnings: string[]
  snapshot: FlagSnapshot
}

export interface ExportSnapshotRequest {
  flags?: InGameFlag[]
}

export interface ExportSnapshotResponse {
  success: boolean
  snapshot: FlagSnapshot
}
