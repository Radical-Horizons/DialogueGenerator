/**
 * Client API synchronisation GDD depuis Notion (FR18).
 */
import { API_TIMEOUTS } from '../constants'
import apiClient from './client'

/** Clé React Query pour l’état checkpoint / reprise sync complète. */
export const GDD_FULL_SYNC_CHECKPOINT_QUERY_KEY = ['gdd-full-sync-checkpoint'] as const

export interface GddNotionSyncConfigPublic {
  schema_version: number
  sync_interval_minutes: number
  auto_sync_enabled: boolean
  sources: Array<{
    notion_id: string
    kind: 'database' | 'page'
    category_file: string
    /** Bases multi-vues : forcer les UUID data source Notion (vide = auto côté serveur). */
    notion_data_source_ids?: string[]
  }>
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
  mirror_promotion_pending?: boolean
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
  mirror_promotion_pending?: boolean | null
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
  mirror_promotion_pending?: boolean
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

/** Réponse POST prévisualisation première ligne d’une base (alignée Pydantic). */
export interface GddNotionPreviewDatabaseResponse {
  ok: boolean
  message: string
  category_file: string
  notion_database_id: string
  data_sources_count: number
  data_source_entries: Array<{ id: string; name: string }>
  query_total_rows: number
  first_page_id: string
  property_keys_from_query_row: string[]
  property_keys_from_get_page: string[]
  mapped_record: Record<string, unknown> | null
  compact_table: boolean
}

/** Une ligne comme en sync : utile pour vérifier Notion avant une sync complète. */
export async function postGddNotionPreviewDatabaseRow(
  categoryFile: string,
): Promise<GddNotionPreviewDatabaseResponse> {
  const { data } = await apiClient.post<GddNotionPreviewDatabaseResponse>(
    '/api/v1/gdd-notion-sync/preview-database-row',
    { category_file: categoryFile },
    { timeout: API_TIMEOUTS.LLM_GENERATION },
  )
  return data
}

export interface PostGddNotionSyncOptions {
  resume?: boolean
  fresh?: boolean
  /** Limite ce run aux ``category_file`` listés (bases) ; sans suppression des autres bases. */
  categoryFiles?: string[]
  /** Applique le staging conservé après erreurs partielles (full=true requis). */
  applyStagingDespiteErrors?: boolean
  /** Filtre UI éphémère (non persisté). ``[]`` = toutes les bases cochées / pas de filtre. */
  includedCategories?: string[]
}

export async function postGddNotionSync(
  full = false,
  opts?: PostGddNotionSyncOptions,
): Promise<GddNotionSyncRunResponse> {
  /** FastAPI attend ``category_file=a&category_file=b`` ; Axios mettrait ``category_file[]`` (ignoré). */
  const search = new URLSearchParams()
  search.set('full', full ? 'true' : 'false')
  if (opts?.resume) {
    search.set('resume', 'true')
  }
  if (opts?.fresh) {
    search.set('fresh', 'true')
  }
  if (opts?.applyStagingDespiteErrors) {
    search.set('apply_staging_despite_errors', 'true')
  }
  if (opts?.includedCategories !== undefined) {
    search.set('included_filter', 'ui')
    for (const raw of opts.includedCategories) {
      const t = raw.trim()
      if (t) {
        search.append('included_category', t)
      }
    }
  }
  for (const raw of opts?.categoryFiles ?? []) {
    const t = raw.trim()
    if (t) {
      search.append('category_file', t)
    }
  }
  const qs = search.toString()
  const { data } = await apiClient.post<GddNotionSyncRunResponse>(
    `/api/v1/gdd-notion-sync/sync?${qs}`,
    undefined,
    { timeout: API_TIMEOUTS.GDD_NOTION_SYNC },
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
  /** Taille totale des fichiers du snapshot (octets). */
  size_bytes: number
  /** Nombre estimé de fiches GDD (shards + monolithes). */
  fiche_count: number
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

/** Télécharge le ZIP Markdown NotebookLM (sources Notion sync + Vision.json ; max_files côté API défaut 64). */
export type GddNotebooklmExportScope = 'disk' | 'sync'

export async function getGddNotebooklmExportZip(
  maxFiles = 64,
  scope: GddNotebooklmExportScope = 'disk',
): Promise<Blob> {
  const { data } = await apiClient.get<Blob>('/api/v1/gdd-notion-sync/notebooklm-export', {
    params: { max_files: maxFiles, scope },
    responseType: 'blob',
    timeout: API_TIMEOUTS.GDD_NOTEBOOKLM_EXPORT,
  })
  return data
}
