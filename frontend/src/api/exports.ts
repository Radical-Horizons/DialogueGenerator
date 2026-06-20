/**
 * API client logs d'export Unity (Story 5.6 / FR54).
 */
import apiClient from './client'

export type ExportLogStatus = 'success' | 'failure'

export interface ExportLogEntry {
  id: string
  timestamp: string
  dialogue_id: string
  filename: string
  export_status: ExportLogStatus
  validation_status: 'valid' | 'invalid' | 'skipped'
  cost_eur: number | null
  file_size_bytes: number | null
  errors: string[]
  warnings_gdd: Record<string, unknown>[]
  source: 'graph' | 'library' | 'batch' | 'unity_export'
}

export interface ExportLogsResponse {
  entries: ExportLogEntry[]
  total_count: number
  success_count: number
  failure_count: number
}

export interface GetExportLogsParams {
  start_date?: string
  end_date?: string
  status?: ExportLogStatus
}

export async function getExportLogs(
  params: GetExportLogsParams = {},
  signal?: AbortSignal,
): Promise<ExportLogsResponse> {
  const response = await apiClient.get<ExportLogsResponse>('/api/v1/exports/logs', {
    params,
    signal,
  })
  return response.data
}
