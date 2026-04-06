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

export interface GraphNodePayload {
  id: string
  type: string
  position?: { x: number; y: number }
  data?: Record<string, unknown>
  [key: string]: unknown
}

export interface GraphEdgePayload {
  id: string
  source: string
  target: string
  type?: string
  label?: string
  data?: Record<string, unknown>
  sourceHandle?: string
  targetHandle?: string
  [key: string]: unknown
}

export interface LoadGraphResponse {
  nodes: GraphNodePayload[]
  edges: GraphEdgePayload[]
  metadata: GraphMetadata
}

export interface SaveGraphRequest {
  nodes: GraphNodePayload[]
  edges: GraphEdgePayload[]
  metadata: GraphMetadata
  seq?: number
  document_id?: string
}

export interface SaveGraphResponse {
  success: boolean
  filename: string
  json_content: string
  ack_seq?: number
  last_seq?: number
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
  dialogue_id?: string
}

/** Requête pour estimer le coût avant génération (même structure que GenerateNodeRequest). */
export interface EstimateCostRequest {
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

export interface EstimateCostPerNodeBreakdown {
  choice_index?: number
  prompt_tokens: number
  completion_tokens: number
  estimated_cost_eur: number
}

export interface EstimateCostResponse {
  estimated_cost_eur: number
  prompt_tokens: number
  completion_tokens: number
  model_id: string
  provider: string
  batch_count?: number
  per_node_breakdown?: EstimateCostPerNodeBreakdown[]
  /** AC #3 — comparaison inter-providers */
  alternative_provider?: string
  alternative_model_id?: string
  alternative_cost_eur?: number
  /** Différence en % vs provider actuel (négatif = alternatif moins cher) */
  cost_difference_pct?: number
}

/** Entrée d'historique de régénération (Story 1.10 - AC#3). */
export interface RegenerationEntry {
  timestamp: string
  instructions: string
  generationId: string
  cost?: number
  provider?: string
}

export interface SuggestedConnection {
  from: string
  to: string
  via_choice_index?: number
  connection_type: string
}

export interface GenerateNodeResponse {
  node?: GraphNodePayload // Pour backward compatibility
  nodes?: GraphNodePayload[] // Liste de nœuds générés (pour génération batch)
  suggested_connections: SuggestedConnection[]
  parent_node_id: string
  batch_count?: number // Nombre total de nœuds générés en batch (si applicable)
  generated_choices_count?: number
  connected_choices_count?: number
  failed_choices_count?: number
  total_choices_count?: number
  /** Empreinte SHA-256 du contexte GDD au moment de la génération (Story 3.9). */
  context_gdd_content_fingerprint?: string | null
}

export interface RegenerateNodeRequest {
  dialogue_id: string
  new_instructions: string
  preserve_connections?: boolean
  parent_node_id: string
  parent_node_content: Record<string, unknown>
  context_selections?: Record<string, unknown>
  system_prompt_override?: string
  llm_model_identifier?: string
  via_choice_index?: number
}

export interface RegenerateNodeResponse {
  node: Record<string, unknown>
  suggested_connections: SuggestedConnection[]
  context_gdd_content_fingerprint?: string | null
}

/** Réponse GET /graph/prompt — prompt exact ou reconstruit pour un nœud (Story 1.14). */
export interface NodePromptResponse {
  raw_prompt: string
  prompt_tokens?: number | null
  completion_tokens?: number | null
  timestamp?: string | null
  is_historical: boolean
  message?: string | null
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
  /** Référence GDD (FR38 lore) */
  gdd_reference?: string
}

/** Fait GDD pour validation lore explicite (aligné Pydantic `GddLoreFactPayload`). */
export interface GddLoreFactPayload {
  entity_name: string
  category: string
  gdd_path: string
  vitality: 'alive' | 'dead'
}

export interface ValidateLoreExplicitRequest {
  nodes: unknown[]
  edges: unknown[]
  context_selections?: Record<string, unknown>
  scene_instruction?: string
  gdd_lore_facts?: GddLoreFactPayload[]
}

export interface ValidateLoreExplicitResponse {
  valid: boolean
  errors: ValidationErrorDetail[]
  warnings: ValidationErrorDetail[]
  contradiction_count: number
  nodes_with_contradictions_count: number
  potential_warnings_count: number
  nodes_with_potential_warnings_count: number
  summary: string
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
  nodes: Array<{ id: string; position: { x: number; y: number }; [key: string]: unknown }>
}
