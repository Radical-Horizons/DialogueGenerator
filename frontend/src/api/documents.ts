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

/**
 * Limite navigateur des corps `keepalive` (64 Kio, marge comprise). La spec Fetch la
 * partage entre toutes les requêtes keepalive en vol : au-delà, `fetch` lève un TypeError.
 */
export const KEEPALIVE_BODY_MAX_BYTES = 60_000

let keepaliveBytesInFlight = 0

/**
 * PUT qui survit au déchargement de la page (`fetch` keepalive) : axios est annulé
 * par le navigateur au rechargement.
 * Renvoie `null` quand le corps ne tient pas dans le quota keepalive restant :
 * l'appelant se replie sur axios. Le quota est réservé dès l'appel, de façon synchrone.
 * Une erreur HTTP est rejetée sous la forme `{ response: { status, data } }` d'axios.
 */
async function putKeepalive<T>(path: string, body: unknown): Promise<T | null> {
  const payload = JSON.stringify(body)
  const size = new Blob([payload]).size
  if (keepaliveBytesInFlight + size > KEEPALIVE_BODY_MAX_BYTES) return null
  keepaliveBytesInFlight += size
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('access_token')
  if (token) headers.Authorization = `Bearer ${token}`
  let response: Response
  try {
    response = await fetch(`${apiClient.defaults.baseURL ?? ''}${path}`, {
      method: 'PUT',
      headers,
      body: payload,
      keepalive: true,
      credentials: 'include',
    })
  } finally {
    keepaliveBytesInFlight -= size
  }
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw Object.assign(new Error(`HTTP ${response.status}`), {
      response: { status: response.status, data },
    })
  }
  return data as T
}

/** {@link putDocument} en keepalive (voir {@link putKeepalive}). */
export function putDocumentKeepalive(
  documentId: string,
  body: PutDocumentRequest
): Promise<PutDocumentResponse | null> {
  return putKeepalive<PutDocumentResponse>(
    `/api/v1/documents/${encodeURIComponent(documentId)}`,
    body
  )
}

/** {@link putLayout} en keepalive (voir {@link putKeepalive}). */
export function putLayoutKeepalive(
  documentId: string,
  body: PutLayoutRequest
): Promise<PutLayoutResponse | null> {
  return putKeepalive<PutLayoutResponse>(
    `/api/v1/documents/${encodeURIComponent(documentId)}/layout`,
    body
  )
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
