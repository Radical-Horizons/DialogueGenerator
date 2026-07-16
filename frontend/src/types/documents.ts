/**
 * Types pour l'API documents (GET/PUT document et layout).
 * Alignés sur api/schemas/documents.py (Story 16.2, 16.3).
 */

export interface DialogueCapabilities {
  can_read: boolean
  can_edit: boolean
  can_delete: boolean
  is_owner: boolean
}

export interface DocumentGetResponse {
  document: Record<string, unknown>
  schemaVersion: string
  revision: number
  capabilities?: DialogueCapabilities
}

export interface PutDocumentRequest {
  document: Record<string, unknown>
  revision: number
  validationMode?: 'draft' | 'export'
  createOnly?: boolean
}

export interface PutDocumentResponse {
  revision: number
  validationReport?: Array<{ code: string; message: string; path: string }>
  flagThresholdWarnings?: string[]
}

export interface LayoutGetResponse {
  layout: Record<string, unknown>
  revision: number
}

export interface PutLayoutRequest {
  layout: Record<string, unknown>
  revision: number
}

export interface PutLayoutResponse {
  revision: number
}

/** POST /documents/{id}/preview (Story 9.4). */
export interface DialoguePreviewRequest {
  revision?: number | null
  flag_states: Record<string, unknown>
  reputation_states?: Record<string, number>
  game_systems_state?: PreviewGameSystemsState
}

export interface PreviewGameSystemsState {
  attributes: Record<string, number>
  skills: Record<string, number>
  effort_pool: number
  reputation_values: Record<string, number>
  faction_titles: Record<string, string>
}

export interface MaskedChoiceRef {
  node_id: string
  choice_id: string
}

export interface DialoguePreviewResponse {
  revision: number
  nodes_total: number
  nodes_masked: number
  choices_total: number
  choices_masked: number
  masked_node_ids: string[]
  masked_choice_refs: MaskedChoiceRef[]
  game_systems_state: PreviewGameSystemsState
  simulation_limits: string[]
  visibility_warnings?: string[]
}
