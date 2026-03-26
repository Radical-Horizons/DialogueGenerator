/**
 * Client API synchronisation GDD depuis Notion (FR18).
 */
import apiClient from './client'

export interface GddNotionSyncConfigPublic {
  schema_version: number
  sync_interval_minutes: number
  auto_sync_enabled: boolean
  sources: Array<{ notion_id: string; kind: 'database' | 'page'; category_file: string }>
  included_categories: string[]
  token_configured: boolean
}

export interface GddNotionSyncConfigResponse {
  config: GddNotionSyncConfigPublic
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
}

export async function getGddNotionSyncConfig(): Promise<GddNotionSyncConfigResponse> {
  const { data } = await apiClient.get<GddNotionSyncConfigResponse>(
    '/api/v1/gdd-notion-sync/config',
  )
  return data
}

export async function postGddNotionTestConnection(): Promise<GddNotionConnectionTestResponse> {
  const { data } = await apiClient.post<GddNotionConnectionTestResponse>(
    '/api/v1/gdd-notion-sync/test-connection',
  )
  return data
}

export async function postGddNotionSync(full = false): Promise<GddNotionSyncRunResponse> {
  const { data } = await apiClient.post<GddNotionSyncRunResponse>(
    '/api/v1/gdd-notion-sync/sync',
    undefined,
    { params: { full } },
  )
  return data
}

export async function getGddNotionSyncStatus(): Promise<GddNotionSyncStatusResponse> {
  const { data } = await apiClient.get<GddNotionSyncStatusResponse>(
    '/api/v1/gdd-notion-sync/status',
  )
  return data
}
