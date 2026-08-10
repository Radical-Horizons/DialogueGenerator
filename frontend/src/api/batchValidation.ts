/** Client API validation batch FR87. */
import apiClient from './client'

export type BatchValidationIssue = {
  type: string
  message: string
  severity: 'error' | 'warning'
  source: 'graph' | 'schema' | 'lore'
  node_id?: string | null
}

export type BatchValidationItem = {
  document_id: string
  status: 'valid' | 'invalid' | 'skipped' | 'cancelled' | 'denied'
  issues: BatchValidationIssue[]
  validated_at: string
}

export type BatchValidateReport = {
  items: BatchValidationItem[]
  cancelled: boolean
  started_at: string
  finished_at: string
  valid_count: number
  invalid_count: number
  skipped_count: number
}

export type BatchValidateJobStatus = {
  job_id: string
  status: 'queued' | 'running' | 'completed' | 'cancelled' | 'error'
  current: number
  total: number
  cancelled: boolean
  error?: string | null
  report?: BatchValidateReport | null
}

export const BATCH_VALIDATE_JOB_MIN = 20

export async function batchValidateSync(
  documentIds: string[],
  signal?: AbortSignal
): Promise<BatchValidateReport> {
  const response = await apiClient.post<BatchValidateReport>(
    '/api/v1/dialogues/batch-validate',
    { document_ids: documentIds },
    { signal }
  )
  return response.data
}

export async function startBatchValidateJob(
  documentIds: string[]
): Promise<{ job_id: string; status: string; total: number }> {
  const response = await apiClient.post<{
    job_id: string
    status: string
    total: number
  }>('/api/v1/dialogues/batch-validate/jobs', { document_ids: documentIds })
  return response.data
}

export async function getBatchValidateJob(
  jobId: string
): Promise<BatchValidateJobStatus> {
  const response = await apiClient.get<BatchValidateJobStatus>(
    `/api/v1/dialogues/batch-validate/jobs/${jobId}`
  )
  return response.data
}

export async function cancelBatchValidateJob(
  jobId: string
): Promise<BatchValidateJobStatus> {
  const response = await apiClient.post<BatchValidateJobStatus>(
    `/api/v1/dialogues/batch-validate/jobs/${jobId}/cancel`
  )
  return response.data
}
