/**
 * Client API pour les documents canoniques (GET/PUT par id avec revision).
 * Story 16.2, 16.3 : GET/PUT /api/v1/documents/{id}, GET/PUT /api/v1/documents/{id}/layout.
 */
import apiClient from './client'
import type {
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
    body
  )
  return response.data
}

/**
 * Charge le layout du document par id.
 * GET /api/v1/documents/{id}/layout → { layout, revision }.
 * 404 si le document ou le layout n'existe pas.
 */
export async function getLayout(documentId: string): Promise<LayoutGetResponse> {
  const response = await apiClient.get<LayoutGetResponse>(
    `/api/v1/documents/${encodeURIComponent(documentId)}/layout`
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
    body
  )
  return response.data
}
