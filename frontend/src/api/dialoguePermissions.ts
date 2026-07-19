/**
 * Client API pour la vue agrégée des permissions dialogue (Story 7.7 / FR70).
 */
import apiClient from './client'
import { API_TIMEOUTS } from '../constants'
import type { DialogueShare } from './dialogueShares'

export interface DialoguePermissionUser {
  user_id: string
  username: string
}

export interface DialoguePermissions {
  owner: DialoguePermissionUser
  co_editors: DialogueShare[]
  can_manage: boolean
}

export async function getDialoguePermissions(
  documentId: string
): Promise<DialoguePermissions> {
  const response = await apiClient.get<DialoguePermissions>(
    `/api/v1/dialogues/${encodeURIComponent(documentId)}/permissions`,
    { timeout: API_TIMEOUTS.DOCUMENT_IO }
  )
  return response.data
}
