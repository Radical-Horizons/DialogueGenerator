/** Client API des métadonnées agrégées d'un dialogue. */
import apiClient from './client'
import { API_TIMEOUTS } from '../constants'
import type { DialogueMetadataResponse } from '../types/api'

export async function getDialogueMetadata(
  documentId: string
): Promise<DialogueMetadataResponse> {
  const response = await apiClient.get<DialogueMetadataResponse>(
    `/api/v1/dialogues/${encodeURIComponent(documentId)}/metadata`,
    { timeout: API_TIMEOUTS.DOCUMENT_IO }
  )
  return response.data
}
