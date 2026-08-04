/** Client API génération batch multi-parents FR88. */
import { apiClient } from './client'

export const BATCH_GENERATE_JOB_MIN = 10

export type BatchGenerateParentStatus = 'ok' | 'error' | 'skipped' | 'cancelled'

export type BatchGenerateSuggestedConnection = {
  from?: string
  to?: string
  from_node?: string
  to_node?: string
  via_choice_index?: number | null
  connection_type?: string
}

export type BatchGenerateParentItem = {
  parent_node_id: string
  status: BatchGenerateParentStatus
  nodes: Array<Record<string, unknown> & { id: string }>
  suggested_connections: BatchGenerateSuggestedConnection[]
  error?: string | null
  warning?: string | null
  generated_choices_count?: number | null
  connected_choices_count?: number | null
  failed_choices_count?: number | null
  total_choices_count?: number | null
  context_gdd_content_fingerprint?: string | null
}

export type BatchGenerateReport = {
  items: BatchGenerateParentItem[]
  cancelled: boolean
  started_at: string
  finished_at: string
  ok_count: number
  error_count: number
  skipped_count: number
  total_nodes_generated: number
}

export type BatchGenerateJobStatus = {
  job_id: string
  status: 'queued' | 'running' | 'completed' | 'cancelled' | 'error'
  current: number
  total: number
  detail: string
  cancelled: boolean
  error?: string | null
  report?: BatchGenerateReport | null
}

export type BatchGenerateParentSpec = {
  parent_node_id: string
  parent_node_content: Record<string, unknown>
  context_selections: Record<string, unknown>
  user_instructions?: string
  npc_speaker_id?: string
  player_character_id?: string
}

export type StartBatchGenerateJobRequest = {
  document_id?: string
  parents: BatchGenerateParentSpec[]
  dialogue_nodes?: Array<Record<string, unknown>>
  llm_model_identifier?: string
  system_prompt_override?: string
  max_choices?: number | null
  choices_mode?: 'free' | 'capped'
}

export async function startBatchGenerateFromNodesJob(
  body: StartBatchGenerateJobRequest
): Promise<{ job_id: string; status: string; total: number }> {
  const response = await apiClient.post<{
    job_id: string
    status: string
    total: number
  }>('/api/v1/unity-dialogues/graph/batch-generate-from-nodes/jobs', body, {
    timeout: 60000,
  })
  return response.data
}

export async function getBatchGenerateFromNodesJob(
  jobId: string
): Promise<BatchGenerateJobStatus> {
  const response = await apiClient.get<BatchGenerateJobStatus>(
    `/api/v1/unity-dialogues/graph/batch-generate-from-nodes/jobs/${jobId}`
  )
  return response.data
}

export async function cancelBatchGenerateFromNodesJob(
  jobId: string
): Promise<BatchGenerateJobStatus> {
  const response = await apiClient.post<BatchGenerateJobStatus>(
    `/api/v1/unity-dialogues/graph/batch-generate-from-nodes/jobs/${jobId}/cancel`
  )
  return response.data
}
