/**
 * Construction partagée des requêtes POST /dialogues/estimate-tokens et /dialogues/preview-prompt.
 */
import type { EstimateTokensRequest } from '../types/api'
import type { PromptStateParams } from './hashUtils'
import { useContextConfigStore } from '../store/contextConfigStore'
import { useFlagsStore } from '../store/flagsStore'

export interface BuildTokenEstimateRequestInput {
  userInstructions: string
  contextSelections: EstimateTokensRequest['context_selections']
  maxContextTokens: number
  maxCompletionTokens?: number | null
  maxChoices?: number | null
  choicesMode?: 'free' | 'capped'
  narrativeTags?: string[]
  systemPromptOverride?: string | null
  gameRules?: string | null
  authorProfile?: string | null
  vocabularyConfig?: Record<string, string> | null
  includeNarrativeGuides?: boolean
  previousDialoguePreview?: string | null
  npcSpeakerId?: string | null
}

export function buildFieldConfigsWithEssential(): Record<string, string[]> {
  const { fieldConfigs, essentialFields } = useContextConfigStore.getState()
  const out: Record<string, string[]> = {}
  for (const [elementType, fields] of Object.entries(fieldConfigs)) {
    const essential = essentialFields[elementType] || []
    out[elementType] = [...new Set([...essential, ...fields])]
  }
  return out
}

/**
 * Construit la requête d'estimation contexte alignée sur le hash prompt.
 */
export function buildTokenEstimateRequest(input: BuildTokenEstimateRequestInput): EstimateTokensRequest {
  const { organization } = useContextConfigStore.getState()
  const fieldConfigsWithEssential = buildFieldConfigsWithEssential()
  const inGameFlags = useFlagsStore.getState().getSelectedFlagsArray()
  const userInstructionsValue = input.userInstructions.trim() || ' '

  return {
    user_instructions: userInstructionsValue,
    context_selections: input.contextSelections,
    npc_speaker_id: input.npcSpeakerId || undefined,
    max_context_tokens: input.maxContextTokens,
    max_completion_tokens: input.maxCompletionTokens ?? undefined,
    system_prompt_override: input.systemPromptOverride || undefined,
    game_rules: input.gameRules || undefined,
    author_profile: input.authorProfile || undefined,
    max_choices: input.maxChoices ?? undefined,
    choices_mode: input.choicesMode ?? 'free',
    narrative_tags: input.narrativeTags && input.narrativeTags.length > 0 ? input.narrativeTags : undefined,
    vocabulary_config: input.vocabularyConfig ?? undefined,
    include_narrative_guides: input.includeNarrativeGuides,
    previous_dialogue_preview: input.previousDialoguePreview || undefined,
    field_configs: Object.keys(fieldConfigsWithEssential).length > 0 ? fieldConfigsWithEssential : undefined,
    organization_mode: organization,
    in_game_flags: inGameFlags.length > 0 ? inGameFlags : undefined,
  }
}

/**
 * Paramètres pour computeStateHash — même forme que buildTokenEstimateRequest.
 */
export function buildPromptStateParams(input: BuildTokenEstimateRequestInput): PromptStateParams {
  const req = buildTokenEstimateRequest(input)
  return {
    user_instructions: req.user_instructions,
    context_selections: req.context_selections,
    npc_speaker_id: req.npc_speaker_id,
    max_context_tokens: req.max_context_tokens,
    max_completion_tokens: req.max_completion_tokens ?? null,
    system_prompt_override: req.system_prompt_override,
    game_rules: req.game_rules,
    author_profile: req.author_profile,
    max_choices: req.max_choices ?? null,
    choices_mode: req.choices_mode ?? 'free',
    narrative_tags: req.narrative_tags,
    vocabulary_config: req.vocabulary_config,
    include_narrative_guides: req.include_narrative_guides,
    previous_dialogue_preview: req.previous_dialogue_preview,
    field_configs: req.field_configs,
    organization_mode: req.organization_mode,
    in_game_flags: req.in_game_flags,
  }
}
