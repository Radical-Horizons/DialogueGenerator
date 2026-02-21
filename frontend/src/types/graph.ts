/**
 * Types TypeScript pour l'API Graph Editor.
 */

export interface GraphMetadata {
  title: string
  node_count: number
  edge_count: number
  filename?: string
}

export interface LoadGraphRequest {
  json_content: string
}

export interface LoadGraphResponse {
  nodes: unknown[]
  edges: unknown[]
  metadata: GraphMetadata
}

export interface SaveGraphRequest {
  nodes: unknown[]
  edges: unknown[]
  metadata: GraphMetadata
}

export interface SaveGraphResponse {
  success: boolean
  filename: string
  json_content: string
}

export interface GenerateNodeRequest {
  parent_node_id: string
  parent_node_content: Record<string, unknown>
  user_instructions: string
  context_selections: Record<string, unknown>
  max_choices?: number | null
  npc_speaker_id?: string
  system_prompt_override?: string
  narrative_tags?: string[]
  llm_model_identifier?: string
  target_choice_index?: number | null
  generate_all_choices?: boolean
}

export interface SuggestedConnection {
  from: string
  to: string
  via_choice_index?: number
  connection_type: string
}

export interface GenerateNodeResponse {
  node?: Record<string, unknown> // Pour backward compatibility
  nodes?: Record<string, unknown>[] // Liste de nœuds générés (pour génération batch)
  suggested_connections: SuggestedConnection[]
  parent_node_id: string
  batch_count?: number // Nombre total de nœuds générés en batch (si applicable)
  generated_choices_count?: number
  connected_choices_count?: number
  failed_choices_count?: number
  total_choices_count?: number
}

export interface ValidateGraphRequest {
  nodes: unknown[]
  edges: unknown[]
}

export interface ValidationErrorDetail {
  type: string
  node_id?: string
  message: string
  severity: string
  target?: string
  cycle_path?: string
  cycle_nodes?: string[]
  cycle_id?: string
}

export interface ValidateGraphResponse {
  valid: boolean
  errors: ValidationErrorDetail[]
  warnings: ValidationErrorDetail[]
}

export interface CalculateLayoutRequest {
  nodes: unknown[]
  edges: unknown[]
  algorithm: string
  direction: string
}

export interface CalculateLayoutResponse {
  nodes: unknown[]
}
