/**
 * Types pour l'API documents (GET/PUT document et layout).
 * Alignés sur api/schemas/documents.py (Story 16.2, 16.3).
 */

export interface DocumentGetResponse {
  document: Record<string, unknown>
  schemaVersion: string
  revision: number
}

export interface PutDocumentRequest {
  document: Record<string, unknown>
  revision: number
  validationMode?: 'draft' | 'export'
}

export interface PutDocumentResponse {
  revision: number
  validationReport?: Array<{ code: string; message: string; path: string }>
}

export interface LayoutGetResponse {
  layout: Record<string, unknown>
  revision: number
}

export interface PutLayoutRequest {
  layout: Record<string, unknown>
  revision: number
}

export interface PutLayoutResponse {
  revision: number
}
