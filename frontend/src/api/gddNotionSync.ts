/**
 * Client API synchronisation GDD depuis Notion (FR18).
 */
import { API_TIMEOUTS } from '../constants'
import apiClient from './client'

export interface GddNotionSyncConfigPublic {
  schema_version: number
  sync_interval_minutes: number
  auto_sync_enabled: boolean
  sources: Array<{ notion_id: string; kind: 'database' | 'page'; category_file: string }>
  included_categories: string[]
  mirror_rebuild_on_full_sync: boolean
  archive_retention_count: number
  token_configured: boolean
}

export interface GddNotionSyncConfigResponse {
  config: GddNotionSyncConfigPublic
}

/** Corps PUT /config (tous les champs optionnels côté API). */
export interface GddNotionSyncConfigUpdateBody {
  sync_interval_minutes?: number
  auto_sync_enabled?: boolean
  sources?: GddNotionSyncConfigPublic['sources']
  included_categories?: string[]
  mirror_rebuild_on_full_sync?: boolean
  archive_retention_count?: number
  notion_token?: string
}

export interface GddNotionConnectionTestResponse {
  ok: boolean
  message: string
  bot_id?: string
  bot_type?: string
}

export interface GddNotionSyncRunResponse {
  success: boolean
  message: string
  updated_entities: number
  partial_errors: string[]
}

export interface GddNotionSyncStatusResponse {
  last_started_at: string | null
  last_finished_at: string | null
  last_success: boolean | null
  message: string
  updated_entities: number
  partial_errors: string[]
  last_archive_relative?: string | null
  last_mirror_rebuild_used?: boolean | null
}

export interface GddNotionSyncProgressResponse {
  active: boolean
  started_at: string | null
  force_full: boolean | null
  mirror_rebuild: boolean | null
  phase: string
  sources_total: number
  sources_completed: number
  current_source_index: number
  current_category_file: string
  pages_total_known: number
  pages_processed: number
  pages_in_current_source: number
  current_page_in_source: number
  current_page_id_short: string
  message: string
  paused?: boolean
}

export interface GddFullSyncCheckpointResponse {
  resumable: boolean
  /** none | resumable | stale | invalid_file */
  checkpoint_status: string
  checkpoint_file_present: boolean
  orphan_staging_runs: number
  message: string
  staging_run_name: string
  archive_rel: string
  sources_total: number
  sources_completed: number
  completed_category_files: string[]
  eligible_category_files: string[]
}

export interface GddFullSyncSimpleOkResponse {
  ok: boolean
  message: string
}

export async function getGddNotionSyncConfig(): Promise<GddNotionSyncConfigResponse> {
  const { data } = await apiClient.get<GddNotionSyncConfigResponse>(
    '/api/v1/gdd-notion-sync/config',
  )
  return data
}

export async function putGddNotionSyncConfig(
  body: GddNotionSyncConfigUpdateBody,
): Promise<GddNotionSyncConfigResponse> {
  const { data } = await apiClient.put<GddNotionSyncConfigResponse>(
    '/api/v1/gdd-notion-sync/config',
    body,
  )
  return data
}

export async function postGddNotionTestConnection(): Promise<GddNotionConnectionTestResponse> {
  const { data } = await apiClient.post<GddNotionConnectionTestResponse>(
    '/api/v1/gdd-notion-sync/test-connection',
  )
  return data
}

export interface PostGddNotionSyncOptions {
  resume?: boolean
  fresh?: boolean
}

export async function postGddNotionSync(
  full = false,
  opts?: PostGddNotionSyncOptions,
): Promise<GddNotionSyncRunResponse> {
  const params: Record<string, boolean> = { full }
  if (opts?.resume) {
    params.resume = true
  }
  if (opts?.fresh) {
    params.fresh = true
  }
  const { data } = await apiClient.post<GddNotionSyncRunResponse>(
    '/api/v1/gdd-notion-sync/sync',
    undefined,
    {
      params,
      timeout: API_TIMEOUTS.GDD_NOTION_SYNC,
    },
  )
  return data
}

export async function getGddFullSyncCheckpoint(): Promise<GddFullSyncCheckpointResponse> {
  const { data } = await apiClient.get<GddFullSyncCheckpointResponse>(
    '/api/v1/gdd-notion-sync/full-sync-checkpoint',
  )
  return data
}

export async function deleteGddFullSyncCheckpoint(): Promise<GddFullSyncSimpleOkResponse> {
  const { data } = await apiClient.delete<GddFullSyncSimpleOkResponse>(
    '/api/v1/gdd-notion-sync/full-sync-checkpoint',
  )
  return data
}

export async function postGddFullSyncPause(): Promise<GddFullSyncSimpleOkResponse> {
  const { data } = await apiClient.post<GddFullSyncSimpleOkResponse>(
    '/api/v1/gdd-notion-sync/full-sync/pause',
  )
  return data
}

export async function postGddFullSyncUnpause(): Promise<GddFullSyncSimpleOkResponse> {
  const { data } = await apiClient.post<GddFullSyncSimpleOkResponse>(
    '/api/v1/gdd-notion-sync/full-sync/unpause',
  )
  return data
}

export async function postGddFullSyncCancel(): Promise<GddFullSyncSimpleOkResponse> {
  const { data } = await apiClient.post<GddFullSyncSimpleOkResponse>(
    '/api/v1/gdd-notion-sync/full-sync/cancel',
  )
  return data
}

export interface GddArchiveEntry {
  id: string
  created_at: string
}

export interface GddArchivesListResponse {
  archives: GddArchiveEntry[]
}

export async function getGddNotionArchives(limit = 20): Promise<GddArchivesListResponse> {
  const { data } = await apiClient.get<GddArchivesListResponse>(
    '/api/v1/gdd-notion-sync/archives',
    { params: { limit } },
  )
  return data
}

export interface GddArchiveRestoreResponse {
  ok: boolean
  message: string
  new_backup_id?: string | null
}

export async function postGddNotionArchiveRestore(
  archiveId: string,
  body: { backup_current?: boolean } = {},
): Promise<GddArchiveRestoreResponse> {
  const { data } = await apiClient.post<GddArchiveRestoreResponse>(
    `/api/v1/gdd-notion-sync/archives/${encodeURIComponent(archiveId)}/restore`,
    { backup_current: body.backup_current ?? true },
  )
  return data
}

export async function getGddNotionSyncStatus(): Promise<GddNotionSyncStatusResponse> {
  const { data } = await apiClient.get<GddNotionSyncStatusResponse>(
    '/api/v1/gdd-notion-sync/status',
  )
  return data
}

export async function getGddNotionSyncProgress(): Promise<GddNotionSyncProgressResponse> {
  const { data } = await apiClient.get<GddNotionSyncProgressResponse>(
    '/api/v1/gdd-notion-sync/sync-progress',
  )
  return data
}
