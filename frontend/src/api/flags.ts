/**
 * Client API pour les flags in-game.
 */
import apiClient from './client'
import type {
  FlagsCatalogResponse,
  UpsertFlagRequest,
  UpsertFlagResponse,
  ToggleFavoriteRequest,
  ToggleFavoriteResponse,
  ImportSnapshotRequest,
  ImportSnapshotResponse,
  ExportSnapshotRequest,
  ExportSnapshotResponse,
  InGameFlag
} from '../types/flags'

/**
 * Liste les définitions de flags disponibles.
 */
export async function listFlags(params?: {
  q?: string
  category?: string
  favoritesOnly?: boolean
  semantic_type?: string
  scope?: string
}): Promise<FlagsCatalogResponse> {
  const response = await apiClient.get<FlagsCatalogResponse>(
    '/api/v1/mechanics/flags',
    { params }
  )
  return response.data
}

/**
 * Crée ou met à jour une définition de flag.
 */
export async function upsertFlag(
  request: UpsertFlagRequest
): Promise<UpsertFlagResponse> {
  const response = await apiClient.post<UpsertFlagResponse>(
    '/api/v1/mechanics/flags',
    request
  )
  return response.data
}

/**
 * Active/désactive le statut favori d'un flag.
 */
export async function toggleFavorite(
  request: ToggleFavoriteRequest
): Promise<ToggleFavoriteResponse> {
  const response = await apiClient.post<ToggleFavoriteResponse>(
    '/api/v1/mechanics/flags/toggle-favorite',
    request
  )
  return response.data
}

/**
 * Importe un snapshot Unity (état réel des flags du jeu).
 */
export async function importSnapshot(
  snapshotJson: string
): Promise<ImportSnapshotResponse> {
  const response = await apiClient.post<ImportSnapshotResponse>(
    '/api/v1/mechanics/flags/import-snapshot',
    { snapshot_json: snapshotJson } as ImportSnapshotRequest
  )
  return response.data
}

/**
 * Exporte la sélection actuelle en snapshot.
 */
export async function exportSnapshot(
  flags?: InGameFlag[]
): Promise<ExportSnapshotResponse> {
  const response = await apiClient.post<ExportSnapshotResponse>(
    '/api/v1/mechanics/flags/export-snapshot',
    flags ? { flags } as ExportSnapshotRequest : undefined
  )
  return response.data
}
