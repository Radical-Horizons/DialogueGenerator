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
 * Liste tous les fichiers de dialogues Unity JSON.
 */
export async function listUnityDialogues(): Promise<UnityDialogueListResponse> {
  const response = await apiClient.get<UnityDialogueListResponse>('/api/v1/unity-dialogues')
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




