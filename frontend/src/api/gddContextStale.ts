/**
 * API — empreinte GDD et historique d'entité (Story 3.9 FR19).
 */
import apiClient from './client'

export interface GddContentFingerprintBody {
  context_selections: Record<string, unknown>
  field_configs?: Record<string, string[]>
  organization_mode?: string
}

export async function postGddContentFingerprint(
  body: GddContentFingerprintBody,
): Promise<{ fingerprint: string }> {
  const { data } = await apiClient.post<{ fingerprint: string }>(
    '/api/v1/context/gdd-content-fingerprint',
    body,
  )
  return data
}

export interface GddEntityHistoryEvent {
  at: string
  source: string
  summary: string
  snapshot?: Record<string, unknown> | null
  diff_from_previous?: string | null
}

export interface GddEntityHistoryResponse {
  category: string
  name: string
  events: GddEntityHistoryEvent[]
  diff_hint?: string | null
  previous_snapshot?: Record<string, unknown> | null
  current_snapshot?: Record<string, unknown> | null
}

export async function getGddEntityHistory(
  category: string,
  name: string,
  options?: { includeSnapshots?: boolean },
): Promise<GddEntityHistoryResponse> {
  const { data } = await apiClient.get<GddEntityHistoryResponse>(
    '/api/v1/context/gdd-entity-history',
    {
      params: {
        category,
        name,
        include_snapshots: options?.includeSnapshots === true,
      },
    },
  )
  return data
}
