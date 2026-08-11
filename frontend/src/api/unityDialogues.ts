/**
 * API client pour la bibliothèque de dialogues Unity JSON.
 */
import apiClient from './client'
import { deleteDocument } from './documents'
import type {
  UnityDialogueListResponse,
  UnityDialogueReadResponse,
  UnityDialoguePreviewRequest,
  UnityDialoguePreviewResponse,
} from '../types/api'
import type { UnitySchemaReferenceResponse } from '../types/graph'

/**
 * Options de pagination serveur (opt-in). Omettre `page` conserve le
 * comportement historique : la réponse contient la liste complète.
 */
export interface ListUnityDialoguesParams {
  page?: number
  pageSize?: number
}

/**
 * Liste les fichiers de dialogues Unity JSON visibles par l'utilisateur.
 *
 * Sans `page`, l'API renvoie la liste complète (rétrocompatible). Avec `page`,
 * la réponse est paginée (`page`, `page_size`, `total_pages` renseignés).
 */
export async function listUnityDialogues(
  params?: ListUnityDialoguesParams
): Promise<UnityDialogueListResponse> {
  const query: Record<string, number> = {}
  if (params?.page != null) query.page = params.page
  if (params?.pageSize != null) query.page_size = params.pageSize
  const response = await apiClient.get<UnityDialogueListResponse>(
    '/api/v1/unity-dialogues',
    Object.keys(query).length > 0 ? { params: query } : undefined
  )
  return response.data
}

/**
 * Lit un fichier de dialogue Unity JSON.
 */
export async function getUnityDialogue(filename: string): Promise<UnityDialogueReadResponse> {
  const response = await apiClient.get<UnityDialogueReadResponse>(
    `/api/v1/unity-dialogues/${encodeURIComponent(filename)}`
  )
  return response.data
}

/**
 * Supprime un fichier de dialogue Unity JSON.
 */
export async function deleteUnityDialogue(filename: string): Promise<void> {
  await deleteDocument(filename.replace(/\.json$/i, ''))
}

/**
 * Génère un résumé texte injectable LLM à partir d'un dialogue Unity JSON.
 */
export async function previewUnityDialogue(
  request: UnityDialoguePreviewRequest
): Promise<UnityDialoguePreviewResponse> {
  const response = await apiClient.post<UnityDialoguePreviewResponse>(
    '/api/v1/unity-dialogues/preview',
    request
  )
  return response.data
}

/**
 * Métadonnées du schéma Unity de référence (Story 5.3 / FR51).
 */
export async function getUnitySchemaReference(): Promise<UnitySchemaReferenceResponse> {
  const response = await apiClient.get<UnitySchemaReferenceResponse>(
    '/api/v1/unity-dialogues/schema'
  )
  return response.data
}




