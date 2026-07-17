/**
 * Client API pour le partage co-édition des dialogues (Story 7.6 / FR69).
 */
import apiClient from './client'
import { API_TIMEOUTS } from '../constants'

export interface DialogueShare {
  document_id: string
  user_id: string
  username: string
  permission: string
  created_at: string
}

export async function listDialogueShares(
  documentId: string
): Promise<DialogueShare[]> {
  const response = await apiClient.get<DialogueShare[]>(
    `/api/v1/dialogues/${encodeURIComponent(documentId)}/shares`,
    { timeout: API_TIMEOUTS.DOCUMENT_IO }
  )
  return response.data
}

export async function createDialogueShare(
  documentId: string,
  username: string
): Promise<DialogueShare> {
  const response = await apiClient.post<DialogueShare>(
    `/api/v1/dialogues/${encodeURIComponent(documentId)}/shares`,
    { username },
    { timeout: API_TIMEOUTS.DOCUMENT_IO }
  )
  return response.data
}

export async function deleteDialogueShare(
  documentId: string,
  userId: string
): Promise<void> {
  await apiClient.delete(
    `/api/v1/dialogues/${encodeURIComponent(documentId)}/shares/${encodeURIComponent(userId)}`,
    { timeout: API_TIMEOUTS.DOCUMENT_IO }
  )
}
