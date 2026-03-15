/**
 * Types TypeScript pour l'API.
 */

// WARNING: Types distincts pour éviter les faux amis
// RawPrompt = Le prompt brut réellement utilisé pour la génération
// Ces deux prompts peuvent différer et NE DOIVENT JAMAIS être confondus dans l'UI.

/**
 * Type pour le prompt brut réellement utilisé pour la génération.
 * Ce prompt provient de raw_prompt dans EstimateTokensResponse ou GenerateUnityDialogueResponse.
 * C'est le SEUL prompt qui doit être affiché comme "PROMPT BRUT" dans l'UI.
 */
export type RawPrompt = string

// Flags in-game
export interface InGameFlag {
  id: string
  value: boolean | number | string
  category?: string
  timestamp?: string
}

// Auth
export interface LoginRequest {
  username: string
  password: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

export interface UserResponse {
  id: string
  username: string
  email?: string
}

// Dialogue
export type ElementMode = 'full' | 'excerpt'

export interface ContextSelection {
  // Listes séparées par mode pour chaque type d'élément
  characters_full: string[]
  characters_excerpt: string[]
  locations_full: string[]
  locations_excerpt: string[]
  items_full: string[]
  items_excerpt: string[]
  species_full: string[]
  species_excerpt: string[]
  communities_full: string[]
  communities_excerpt: string[]
  dialogues_examples: string[]
  scene_protagonists?: Record<string, unknown>
  scene_location?: Record<string, unknown>
  generation_settings?: Record<string, unknown>
}

/**
 * Base pour les requêtes de construction de prompt.
 */
export interface BasePromptRequest {
  user_instructions: string
  context_selections: ContextSelection
  npc_speaker_id?: string
  max_context_tokens: number
  system_prompt_override?: string
  author_profile?: string
  max_choices?: number | null
  choices_mode: 'free' | 'capped'
  narrative_tags?: string[]
  vocabulary_config?: Record<string, string>
  include_narrative_guides?: boolean
  previous_dialogue_preview?: string
  in_game_flags?: InGameFlag[]
}

export interface EstimateTokensRequest extends BasePromptRequest {
  field_configs?: Record<string, string[]>
  organization_mode?: string
}

export interface EstimateTokensResponse {
  context_tokens: number
  token_count: number
  raw_prompt: RawPrompt
  prompt_hash: string
  structured_prompt?: import('./prompt').PromptStructure
}

export interface PreviewPromptRequest extends BasePromptRequest {
  field_configs?: Record<string, string[]>
  organization_mode?: string
}

export interface PreviewPromptResponse {
  raw_prompt: RawPrompt
  prompt_hash: string
  structured_prompt?: import('./prompt').PromptStructure
}

// Context
export interface CharacterResponse {

  name: string
  data: Record<string, unknown>
}

export interface CharacterListResponse {
  characters: CharacterResponse[]
  total: number
  page?: number
  page_size?: number
  total_pages?: number
}

export interface LocationResponse {
  name: string
  data: Record<string, unknown>
}

export interface LocationListResponse {
  locations: LocationResponse[]
  total: number
  page?: number
  page_size?: number
  total_pages?: number
}

export interface ItemResponse {
  name: string
  data: Record<string, unknown>
}

export interface ItemListResponse {
  items: ItemResponse[]
  total: number
  page?: number
  page_size?: number
  total_pages?: number
}

export interface SpeciesResponse {
  name: string
  data: Record<string, unknown>
}

export interface SpeciesListResponse {
  species: SpeciesResponse[]
  total: number
}

export interface CommunityResponse {
  name: string
  data: Record<string, unknown>
}

export interface CommunityListResponse {
  communities: CommunityResponse[]
  total: number
  page?: number
  page_size?: number
  total_pages?: number
}

export interface RegionListResponse {
  regions: string[]
  total: number
}

export interface SubLocationListResponse {
  sub_locations: string[]
  total: number
  region_name: string
}

export interface LinkedElementsRequest {
  character_a?: string
  character_b?: string
  scene_region?: string
  sub_location?: string
}

export interface LinkedElementsResponse {
  linked_elements: string[]
  total: number
}

// Config
export interface LLMModelResponse {
  model_identifier: string
  display_name: string
  client_type: string
  max_tokens: number
}

export interface LLMModelsListResponse {
  models: LLMModelResponse[]
  total: number
}

export interface UnityDialoguesPathResponse {
  path: string
}

// InteractionContextPathResponse supprimé - système obsolète

// Unity Dialogue
export interface GenerateUnityDialogueRequest extends BasePromptRequest {
  llm_model_identifier: string
  max_completion_tokens?: number | null
  reasoning_effort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | null
  top_p?: number | null
}

export interface ReasoningTrace {
  effort?: string
  summary?: string
  items?: Array<Record<string, unknown> | string>
  items_count?: number
}

export interface GenerateUnityDialogueResponse {
  json_content: string
  title?: string
  reasoning_trace?: ReasoningTrace | null
  raw_prompt: RawPrompt
  prompt_hash: string
  estimated_tokens: number
  warning?: string
  structured_prompt?: import('./prompt').PromptStructure
}


export interface ExportUnityDialogueRequest {
  json_content: string
  title: string
  filename?: string
}

export interface ExportUnityDialogueResponse {
  file_path: string
  filename: string
  success: boolean
}

// Unity Dialogues Library
export interface UnityDialogueMetadata {
  filename: string
  file_path: string
  size_bytes: number
  modified_time: string
  title?: string
}

export interface UnityDialogueListResponse {
  dialogues: UnityDialogueMetadata[]
  total: number
}

export interface UnityDialogueReadResponse {
  filename: string
  json_content: string
  title?: string
  size_bytes: number
  modified_time: string
}

export interface UnityDialoguePreviewRequest {
  json_content: string
}

export interface UnityDialoguePreviewResponse {
  preview_text: string
  node_count: number
}

// Unity Dialogue Node Types (for editor)
export interface UnityDialogueChoice {
  text: string
  targetNode: string
  traitRequirements?: Array<{
    trait: string
    minValue: number
  }>
  allowInfluenceForcing?: boolean
  influenceThreshold?: number
  influenceDelta?: number
  respectDelta?: number
  test?: string
  testCriticalFailureNode?: string
  testFailureNode?: string
  testSuccessNode?: string
  testCriticalSuccessNode?: string
  condition?: string
  [key: string]: unknown
}

export interface UnityDialogueNode {
  id: string
  speaker?: string
  line?: string
  nextNode?: string
  choices?: UnityDialogueChoice[]
  test?: string
  successNode?: string
  failureNode?: string
  isLongRest?: boolean
  startState?: number
  cutsceneMode?: boolean
  cutsceneImageId?: string
  cutsceneId?: string
  exitCutsceneMode?: boolean
  consequences?: {
    flag: string
    description?: string
  }
  [key: string]: unknown
}

