/**
 * Bootstrap sélection GDD depuis le cache précompilé (lancement + resync config).
 */
import type { ContextSelection } from '../types/api'
import type { PromptSection } from '../types/prompt'
import { fetchPrecomputedEntityTokens } from '../api/context'
import {
  listAllSelectionEntities,
  selectionFingerprint,
  type SelectionEntityDelta,
} from './contextEntityTokenCache'

const PRECOMPUTED_CHUNK_SIZE = 64

export interface PrecomputedBootstrapInput {
  selections: ContextSelection
  organizationMode: string
  fieldConfigs?: Record<string, string[]>
  userInstructions: string
  includeNarrativeGuides: boolean
  systemPromptOverride?: string | null
  gameRules?: string | null
  authorProfile?: string | null
  vocabularyConfig?: Record<string, string> | null
}

export interface PrecomputedBootstrapResult {
  entities: Array<{
    entityType: string
    name: string
    mode: 'full' | 'excerpt'
    token_count: number
    context_item?: import('../types/prompt').ContextItem | null
  }>
  overheadSections?: PromptSection[] | null
  fingerprint: string
}

export async function fetchPrecomputedBootstrap(
  input: PrecomputedBootstrapInput,
  signal?: AbortSignal,
): Promise<PrecomputedBootstrapResult> {
  const allEntities = listAllSelectionEntities(input.selections)
  if (allEntities.length === 0) {
    return { entities: [], overheadSections: null, fingerprint: selectionFingerprint(input.selections) }
  }

  const chunks: SelectionEntityDelta[][] = []
  for (let i = 0; i < allEntities.length; i += PRECOMPUTED_CHUNK_SIZE) {
    chunks.push(allEntities.slice(i, i + PRECOMPUTED_CHUNK_SIZE))
  }

  const mergedEntities: PrecomputedBootstrapResult['entities'] = []
  let overheadSections: PromptSection[] | null = null

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex]
    const response = await fetchPrecomputedEntityTokens(
      {
        entities: chunk.map((entity) => ({
          entity_type: entity.entityType,
          name: entity.name,
          mode: entity.mode,
        })),
        organization_mode: input.organizationMode,
        field_configs: input.fieldConfigs,
        include_prompt_overhead: chunkIndex === 0,
        user_instructions: input.userInstructions,
        include_narrative_guides: input.includeNarrativeGuides,
        system_prompt_override: input.systemPromptOverride || undefined,
        game_rules: input.gameRules || undefined,
        author_profile: input.authorProfile || undefined,
        vocabulary_config: input.vocabularyConfig ?? undefined,
      },
      signal,
    )

    mergedEntities.push(
      ...response.entities.map((row) => ({
        entityType: row.entity_type,
        name: row.name,
        mode: row.mode as 'full' | 'excerpt',
        token_count: row.token_count,
        context_item: row.context_item as import('../types/prompt').ContextItem | null | undefined,
      })),
    )

    if (chunkIndex === 0 && response.prompt_overhead_sections?.length) {
      overheadSections = response.prompt_overhead_sections
    }
  }

  return {
    entities: mergedEntities,
    overheadSections,
    fingerprint: selectionFingerprint(input.selections),
  }
}

export function isBootstrapComplete(
  result: PrecomputedBootstrapResult,
  expectedCount: number,
): boolean {
  if (expectedCount === 0) return true
  return (
    result.entities.length === expectedCount &&
    result.entities.every((row) => Boolean(row.context_item) && row.token_count > 0)
  )
}
