/**
 * API client pour la configuration.
 */
import apiClient from './client'
import type { LLMModelsListResponse, UnityDialoguesPathResponse } from '../types/api'
import type {
  ContextFieldsResponse,
  ContextFieldSuggestionsResponse,
  ContextPreviewResponse,
} from '../store/contextConfigStore'

export interface DefaultSystemPromptResponse {
  prompt: string
}

interface DefaultSystemPromptApiResponse {
  prompt?: string
  system_prompt?: string
}

export interface ContextPreviewRequest {
  selected_elements: Record<string, string[]>
  field_configs: Record<string, string[]>
  organization_mode?: string
  scene_instruction?: string
  max_tokens?: number
}

/**
 * Liste tous les modèles LLM disponibles.
 */
export async function listLLMModels(): Promise<LLMModelsListResponse> {
  const response = await apiClient.get<LLMModelsListResponse>('/api/v1/config/llm/models')
  return response.data
}

/**
 * Récupère le chemin configuré des dialogues Unity.
 */
export async function getUnityDialoguesPath(): Promise<UnityDialoguesPathResponse> {
  const response = await apiClient.get<UnityDialoguesPathResponse>('/api/v1/config/unity-dialogues-path')
  return response.data
}

/**
 * Configure le chemin des dialogues Unity.
 */
export async function setUnityDialoguesPath(path: string): Promise<UnityDialoguesPathResponse> {
  const response = await apiClient.put<UnityDialoguesPathResponse>('/api/v1/config/unity-dialogues-path', { path })
  return response.data
}

/**
 * Récupère le system prompt par défaut.
 */
export async function getDefaultSystemPrompt(): Promise<DefaultSystemPromptResponse> {
  const response = await apiClient.get<DefaultSystemPromptApiResponse>('/api/v1/config/default-system-prompt')
  const prompt = response.data.prompt ?? response.data.system_prompt

  if (!prompt) {
    throw new Error('La réponse API ne contient pas de prompt par défaut')
  }

  return {
    prompt,
  }
}

/**
 * Récupère les champs disponibles pour un type d'élément.
 */
export async function getContextFields(elementType: string): Promise<ContextFieldsResponse> {
  const response = await apiClient.get<ContextFieldsResponse>(`/api/v1/config/context-fields/${elementType}`)
  return response.data
}

/**
 * Récupère les suggestions de champs selon le contexte.
 */
export async function getFieldSuggestions(
  elementType: string,
  context?: string
): Promise<ContextFieldSuggestionsResponse> {
  const response = await apiClient.post<ContextFieldSuggestionsResponse>(
    '/api/v1/config/context-fields/suggestions',
    {
      element_type: elementType,
      context: context || null,
    }
  )
  return response.data
}

/**
 * Prévisualise le contexte avec une configuration personnalisée.
 */
export async function previewContext(
  request: ContextPreviewRequest
): Promise<ContextPreviewResponse> {
  const response = await apiClient.post<ContextPreviewResponse>(
    '/api/v1/config/context-fields/preview',
    request
  )
  return response.data
}

/**
 * Récupère les templates de prompts disponibles.
 */
export interface PromptTemplate {
  id: string
  name: string
  description: string
  prompt: string
}

export interface PromptTemplatesResponse {
  templates: PromptTemplate[]
  total: number
}

export async function getPromptTemplates(): Promise<PromptTemplatesResponse> {
  const response = await apiClient.get<PromptTemplatesResponse>('/api/v1/config/prompt-templates')
  return response.data
}

/**
 * Récupère la configuration par défaut des champs.
 */
export async function getDefaultFieldConfig(): Promise<{
  essential_fields: Record<string, string[]>
  default_fields: Record<string, string[]>
}> {
  const response = await apiClient.get<{
    essential_fields: Record<string, string[]>
    default_fields: Record<string, string[]>
  }>('/api/v1/config/context-fields/default')
  return response.data
}

/**
 * Invalide le cache des champs de contexte.
 */
export async function invalidateContextFieldsCache(elementType?: string): Promise<void> {
  const url = elementType
    ? `/api/v1/config/context-fields/invalidate-cache?element_type=${elementType}`
    : '/api/v1/config/context-fields/invalidate-cache'
  await apiClient.post(url)
}

/**
 * Récupère les templates d'instructions de scène disponibles.
 */
export interface SceneInstructionTemplate {
  id: string
  name: string
  description: string
  instructions: string
}

export interface SceneInstructionTemplatesResponse {
  templates: SceneInstructionTemplate[]
  total: number
}

export async function getSceneInstructionTemplates(): Promise<SceneInstructionTemplatesResponse> {
  const response = await apiClient.get<SceneInstructionTemplatesResponse>('/api/v1/config/scene-instruction-templates')
  return response.data
}

/**
 * Récupère les templates de profils d'auteur disponibles.
 */
export interface AuthorProfileTemplate {
  id: string
  name: string
  description: string
  profile: string
}

export interface AuthorProfileTemplatesResponse {
  templates: AuthorProfileTemplate[]
  total: number
}

export async function getAuthorProfileTemplates(): Promise<AuthorProfileTemplatesResponse> {
  const response = await apiClient.get<AuthorProfileTemplatesResponse>('/api/v1/config/author-profile-templates')
  return response.data
}

/**
 * Réponse contenant les chemins des fichiers de templates.
 */
export interface TemplateFilePathsResponse {
  system_prompt_path: string
  scene_instructions_dir: string
  author_profiles_dir: string
  config_dir: string
}

/**
 * Récupère les chemins des fichiers de templates pour les ouvrir dans l'éditeur.
 */
export async function getTemplateFilePaths(): Promise<TemplateFilePathsResponse> {
  const response = await apiClient.get<TemplateFilePathsResponse>('/api/v1/config/template-file-paths')
  return response.data
}

