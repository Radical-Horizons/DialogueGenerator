/**
 * Client API pour les documents canoniques (GET/PUT par id avec revision).
 * Story 16.2, 16.3 : GET/PUT /api/v1/documents/{id}, GET/PUT /api/v1/documents/{id}/layout.
 */
import apiClient from './client'
import { API_TIMEOUTS } from '../constants'
import type {
  DialoguePreviewRequest,
  DialoguePreviewResponse,
  DocumentGetResponse,
  PutDocumentRequest,
  PutDocumentResponse,
  LayoutGetResponse,
  PutLayoutRequest,
  PutLayoutResponse,
} from '../types/documents'

/**
 * Charge le document par id.
 * GET /api/v1/documents/{id} → { document, schemaVersion, revision }.
 */
export async function getDocument(documentId: string): Promise<DocumentGetResponse> {
  const response = await apiClient.get<DocumentGetResponse>(
    `/api/v1/documents/${encodeURIComponent(documentId)}`
  )
  return response.data
}

/**
 * Sauvegarde le document (optimistic locking via revision).
 * PUT /api/v1/documents/{id}. 409 si revision obsolète.
 */
export async function putDocument(
  documentId: string,
  body: PutDocumentRequest
): Promise<PutDocumentResponse> {
  const response = await apiClient.put<PutDocumentResponse>(
    `/api/v1/documents/${encodeURIComponent(documentId)}`,
    body,
    { timeout: API_TIMEOUTS.DOCUMENT_IO }
  )
  return response.data
}

/** Limite navigateur du corps d'une requête `keepalive` (64 Kio, marge comprise). */
export const KEEPALIVE_BODY_MAX_BYTES = 60_000

/**
 * Même PUT que {@link putDocument}, mais qui survit au déchargement de la page
 * (`fetch` keepalive) : axios est annulé par le navigateur au rechargement.
 * Renvoie `null` quand le corps dépasse la limite keepalive : l'appelant se replie sur axios.
 * Une erreur HTTP est rejetée sous la forme `{ response: { status, data } }` d'axios.
 */
export async function putDocumentKeepalive(
  documentId: string,
  body: PutDocumentRequest
): Promise<PutDocumentResponse | null> {
  const payload = JSON.stringify(body)
  if (new Blob([payload]).size > KEEPALIVE_BODY_MAX_BYTES) return null
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('access_token')
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(
    `${apiClient.defaults.baseURL ?? ''}/api/v1/documents/${encodeURIComponent(documentId)}`,
    { method: 'PUT', headers, body: payload, keepalive: true, credentials: 'include' }
  )
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw Object.assign(new Error(`HTTP ${response.status}`), {
      response: { status: response.status, data },
    })
  }
  return data as PutDocumentResponse
}

/**
 * Supprime le document canonique, son layout et ses sidecars.
 */
export async function deleteDocument(documentId: string): Promise<void> {
  await apiClient.delete(
    `/api/v1/documents/${encodeURIComponent(documentId)}`,
    { timeout: API_TIMEOUTS.DOCUMENT_IO }
  )
}

/**
 * Charge le layout du document par id.
 * GET /api/v1/documents/{id}/layout → { layout, revision }.
 * 404 si le document ou le layout n'existe pas.
 */
export async function getLayout(documentId: string): Promise<LayoutGetResponse> {
  const response = await apiClient.get<LayoutGetResponse>(
    `/api/v1/documents/${encodeURIComponent(documentId)}/layout`,
    { timeout: API_TIMEOUTS.DOCUMENT_IO }
  )
  return response.data
}

/**
 * Sauvegarde le layout (optimistic locking via revision).
 * PUT /api/v1/documents/{id}/layout. 409 si revision obsolète.
 */
export async function putLayout(
  documentId: string,
  body: PutLayoutRequest
): Promise<PutLayoutResponse> {
  const response = await apiClient.put<PutLayoutResponse>(
    `/api/v1/documents/${encodeURIComponent(documentId)}/layout`,
    body,
    { timeout: API_TIMEOUTS.DOCUMENT_IO }
  )
  return response.data
}

/**
 * Preview visibilité pour un état simulé (Story 9.4).
 * POST /api/v1/documents/{id}/preview
 */
export async function postDocumentPreview(
  documentId: string,
  body: DialoguePreviewRequest
): Promise<DialoguePreviewResponse> {
  const response = await apiClient.post<DialoguePreviewResponse>(
    `/api/v1/documents/${encodeURIComponent(documentId)}/preview`,
    body,
    { timeout: API_TIMEOUTS.DOCUMENT_IO }
  )
  return response.data
}
