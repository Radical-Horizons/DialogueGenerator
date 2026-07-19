/**
 * Client typé des journaux d'audit administratifs (FR71).
 */
import apiClient from './client'
import type { AuditLogListParams, AuditLogListResponse } from '../types/api'

export async function listAuditLogs(
  params: AuditLogListParams = {},
): Promise<AuditLogListResponse> {
  const response = await apiClient.get<AuditLogListResponse>(
    '/api/v1/audit-logs',
    { params },
  )
  return response.data
}

export async function exportAuditLogs(
  format: 'json' | 'csv',
  params: Omit<AuditLogListParams, 'page' | 'page_size'> = {},
): Promise<Blob> {
  const response = await apiClient.get<Blob>('/api/v1/audit-logs/export', {
    params: { ...params, format },
    responseType: 'blob',
  })
  return response.data
}
