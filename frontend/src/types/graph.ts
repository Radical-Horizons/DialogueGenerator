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
  /** Optionnel : React Flow autorise un nœud sans `type` (rendu par défaut). */
  type?: string
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
  dialogue_flags?: Array<{
    flagId: string
    type: string
    initialValue: boolean | number | string
  }>
}

export interface SaveGraphResponse {
  success: boolean
  filename: string
  json_content: string
  ack_seq?: number
  last_seq?: number
}

export interface ExportPreviewResponse {
  json_content: string
  size_bytes: number
  node_count: number
  filename: string
  schema_valid: boolean
  errors: string[]
}

export interface GenerateNodeRequest {
  parent_node_id: string
  parent_node_content: Record<string, unknown>
  user_instructions: string
  context_selections: Record<string, unknown>
  max_choices?: number | null
  npc_speaker_id?: string
  player_character_id?: string
  system_prompt_override?: string
  narrative_tags?: string[]
  llm_model_identifier?: string
  target_choice_index?: number | null
  generate_all_choices?: boolean
  choices_mode?: 'free' | 'capped'
  dialogue_id?: string
  template_id?: string
  template_name?: string
  dialogue_nodes?: Array<{
    id: string
    speaker: string
    line: string
    choices: Array<{ text: string; targetNode?: string }>
  }>
}

/** Requête pour estimer le coût avant génération (même structure que GenerateNodeRequest). */
export interface EstimateCostRequest {
  parent_node_id: string
  parent_node_content: Record<string, unknown>
  user_instructions: string
  context_selections: Record<string, unknown>
  max_choices?: number | null
  npc_speaker_id?: string
  player_character_id?: string
  system_prompt_override?: string
  narrative_tags?: string[]
  llm_model_identifier?: string
  target_choice_index?: number | null
  generate_all_choices?: boolean
  dialogue_nodes?: GenerateNodeRequest['dialogue_nodes']
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
  player_character_id?: string
  dialogue_nodes?: GenerateNodeRequest['dialogue_nodes']
  template_id?: string
  template_name?: string
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
  /** Document canonique (Story 9.5) pour validation références dialogueFlags */
  document?: Record<string, unknown> | null
}

export interface LoreAmbiguityCandidate {
  name: string
  category: string
  gdd_path: string
}

export interface ValidationErrorDetail {
  type: string
  node_id?: string
  message: string
  severity: string
  /** Story 9.5 — flag catalogue concerné */
  referenced_flag_id?: string
  /** Story 9.5 — suggestion typo */
  suggested_flag_id?: string
  target?: string
  cycle_path?: string
  cycle_nodes?: string[]
  cycle_id?: string
  /** Référence GDD (FR38 lore) */
  gdd_reference?: string
  /** FR39 — sous-type heuristique */
  lore_subtype?: string
  /** FR39 — clé stable pour persistance UI */
  lore_warning_key?: string
  /** FR39 — candidats GDD (ambiguïté) */
  ambiguity_candidates?: LoreAmbiguityCandidate[]
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
  /** FR39 */
  ambiguity_warnings_count?: number
  nodes_with_ambiguity_warnings_count?: number
  /** Résumé agrégé (explicite + potentiel + ambiguïté) — logs / débogage. */
  summary: string
  /** Bandeau UI : contradictions explicites uniquement (FR39 AC #5). */
  summary_explicit_only: string
}

export interface ValidateGraphResponse {
  valid: boolean
  errors: ValidationErrorDetail[]
  warnings: ValidationErrorDetail[]
}

/** FR42 — critère renvoyé par le juge LLM. */
export type DialogueQualityCriterionId =
  | 'narrative_coherence'
  | 'characterization'
  | 'agency'
  | 'style'

export interface DialogueQualityCriterionDetail {
  criterion_id: DialogueQualityCriterionId
  label: string
  score: number
  comment: string
}

export interface EvaluateDialogueQualityRequest {
  nodes: GraphNodePayload[]
  edges: GraphEdgePayload[]
  llm_model_identifier?: string | null
}

export interface EvaluateDialogueQualityResponse {
  overall_score: number
  score_variance_margin: number
  score_variance_note: string
  criteria: DialogueQualityCriterionDetail[]
  global_comment?: string | null
  suggestions: string[]
  strengths: string[]
  model_id: string
  provider: string
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

/** Options détection AI slop (FR43) — alignées Pydantic `AiSlopDetectionOptions`. */
export interface AiSlopDetectionOptionsState {
  include_gpt_isms: boolean
  include_repetitions: boolean
  include_generic_phrases: boolean
  custom_keywords: string[]
  custom_regex_patterns: string[]
}

export type AiSlopOccurrenceKind = 'gpt_ism' | 'repetition' | 'generic_phrase'

export interface AiSlopOccurrenceItem {
  kind: AiSlopOccurrenceKind
  node_id: string
  node_display_id?: string | null
  field: string
  excerpt: string
  matched_span: string
  suggestion: string
  severity: 'warning'
}

export interface AiSlopRepetitionGroup {
  normalized_phrase: string
  occurrence_count: number
  node_ids: string[]
  sample_excerpt: string
}

export interface DetectAiSlopRequest {
  nodes: GraphNodePayload[]
  edges: GraphEdgePayload[]
  options?: AiSlopDetectionOptionsState
}

export interface DetectAiSlopResponse {
  summary_gpt_isms: string
  summary_repetitions: string
  summary_generic_phrases: string
  gpt_ism_occurrence_count: number
  gpt_ism_distinct_node_count: number
  generic_phrase_occurrence_count: number
  repetition_group_count: number
  occurrences: AiSlopOccurrenceItem[]
  repetition_groups: AiSlopRepetitionGroup[]
  message?: string | null
}

/** Options détection context dropping (FR44 / Story 4.10). */
export interface DetectContextDroppingOptionsState {
  rules_profile?: 'strict' | 'light'
  tolerance?: number
  mandatory_info?: string[]
  dialogue_type?: string
  dialogue_type_overrides?: Record<string, { rules_profile?: 'strict' | 'light'; tolerance?: number }>
}

export type ContextDroppingCaseKind = 'context_dropping' | 'too_subtle' | 'mandatory_missing'

/** Surcharge de règles pour un type de dialogue (Story 4.10). */
export interface DialogueTypeRuleOverride {
  rules_profile?: 'strict' | 'light'
  tolerance?: number
}

/** Règles anti-context-dropping persistées (Story 4.10). */
export interface ContextDroppingRules {
  rules_profile: 'strict' | 'light'
  tolerance?: number | null
  mandatory_info: string[]
  dialogue_type_overrides: Record<string, DialogueTypeRuleOverride>
  schema_version?: string
}

export interface ContextDroppingCaseItem {
  kind: ContextDroppingCaseKind
  node_id?: string | null
  node_display_id?: string | null
  context_label: string
  message: string
  suggestion: string
  severity: 'warning' | 'info'
}

export interface DetectContextDroppingRequest {
  nodes: GraphNodePayload[]
  edges: GraphEdgePayload[]
  context_selections: Record<string, unknown>
  scene_instruction?: string
  context_text?: string | null
  options?: DetectContextDroppingOptionsState
}

export interface DetectContextDroppingResponse {
  summary: string
  case_count: number
  cases: ContextDroppingCaseItem[]
  message?: string | null
  rules_profile_effective: string
}

/** Requête validation schéma JSON Unity (FR48 / Story 4.13). */
export interface ValidateSchemaRequest {
  nodes: GraphNodePayload[]
  edges: GraphEdgePayload[]
  dialogue_flags?: Array<{
    flagId: string
    type: string
    initialValue: boolean | number | string
  }>
}

/** Erreur ou avertissement structuré validation schéma Unity (Story 5.3 / FR51). */
export interface SchemaValidationIssue {
  code: string
  message: string
  path?: string
  node_id?: string
}

/** Réponse validation schéma JSON Unity (FR48 / Story 4.13, FR51). */
export interface ValidateSchemaResponse {
  is_valid: boolean
  errors: string[]
  error_count: number
  warnings?: SchemaValidationIssue[]
  structured_errors?: SchemaValidationIssue[]
}

/** Métadonnées schéma Unity de référence (Story 5.3). */
export interface UnitySchemaSectionSummary {
  name: string
  description: string
  required_fields: string[]
}

export interface UnitySchemaReferenceResponse {
  available: boolean
  version: string | null
  source_path: string
  required_root_fields: string[]
  sections: UnitySchemaSectionSummary[]
}

/** Requête simulation de flux (FR46 / Story 4.11). */
export interface SimulateFlowRequest {
  nodes: GraphNodePayload[]
  edges: GraphEdgePayload[]
}

/** Statistiques de couverture de simulation (FR47 / Story 4.12). */
export interface FlowCoverageStats {
  total_nodes: number
  accessible_count: number
  dead_end_count: number
  cul_de_sac_count: number
  coverage_percentage: number
}

/** Réponse simulation de flux (FR46 + FR47). */
export interface SimulateFlowResponse {
  dead_ends: ValidationErrorDetail[]
  cul_de_sacs: ValidationErrorDetail[]
  coverage?: FlowCoverageStats
}
