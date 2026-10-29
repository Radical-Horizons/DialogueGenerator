/**
 * Client API pour les collections de dialogues (Story 8.5 / FR84).
 */
import apiClient from './client'
import { API_TIMEOUTS } from '../constants'

export interface DialogueCollection {
  id: string
  name: string
  description: string | null
  icon: string | null
  owner_id: string
  created_at: string
  updated_at: string
  dialogue_ids: string[]
}

export interface CollectionDeleteResult {
  id: string
  removed_dialogue_count: number
}

export interface CollectionWritePayload {
  name: string
  description?: string | null
  icon?: string | null
}

export async function listCollections(): Promise<DialogueCollection[]> {
  const response = await apiClient.get<DialogueCollection[]>(
    '/api/v1/collections',
    { timeout: API_TIMEOUTS.DOCUMENT_IO }
  )
  return response.data
}

export async function createCollection(
  payload: CollectionWritePayload
): Promise<DialogueCollection> {
  const response = await apiClient.post<DialogueCollection>(
    '/api/v1/collections',
    payload,
    { timeout: API_TIMEOUTS.DOCUMENT_IO }
  )
  return response.data
}

export async function updateCollection(
  collectionId: string,
  payload: Partial<CollectionWritePayload>
): Promise<DialogueCollection> {
  const response = await apiClient.put<DialogueCollection>(
    `/api/v1/collections/${encodeURIComponent(collectionId)}`,
    payload,
    { timeout: API_TIMEOUTS.DOCUMENT_IO }
  )
  return response.data
}

export async function deleteCollection(
  collectionId: string
): Promise<CollectionDeleteResult> {
  const response = await apiClient.delete<CollectionDeleteResult>(
    `/api/v1/collections/${encodeURIComponent(collectionId)}`,
    { timeout: API_TIMEOUTS.DOCUMENT_IO }
  )
  return response.data
}

export async function addDialoguesToCollection(
  collectionId: string,
  documentIds: string[]
): Promise<DialogueCollection> {
  const response = await apiClient.post<DialogueCollection>(
    `/api/v1/collections/${encodeURIComponent(collectionId)}/dialogues`,
    { document_ids: documentIds },
    { timeout: API_TIMEOUTS.DOCUMENT_IO }
  )
  return response.data
}

export async function removeDialoguesFromCollection(
  collectionId: string,
  documentIds: string[]
): Promise<DialogueCollection> {
  const response = await apiClient.delete<DialogueCollection>(
    `/api/v1/collections/${encodeURIComponent(collectionId)}/dialogues`,
    {
      data: { document_ids: documentIds },
      timeout: API_TIMEOUTS.DOCUMENT_IO,
    }
  )
  return response.data
}

/**
 * Construit une map document_id → collections pour badges / filtre.
 */
export function buildDocumentCollectionMap(
  collections: DialogueCollection[]
): Map<string, DialogueCollection[]> {
  const map = new Map<string, DialogueCollection[]>()
  for (const collection of collections) {
    for (const documentId of collection.dialogue_ids) {
      // Aligné sur `normalizeDialogueFilenameKey` (casse) pour les badges.
      const key = documentId.replace(/\.json$/i, '').toLowerCase()
      const existing = map.get(key)
      if (existing) {
        existing.push(collection)
      } else {
        map.set(key, [collection])
      }
    }
  }
  return map
}
