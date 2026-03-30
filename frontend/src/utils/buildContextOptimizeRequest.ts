/**
 * Construit le corps de POST /context/optimize à partir des stores (FR21).
 * Logique alignée sur useContextSelectionTokenEstimate / useGenerationRequest.
 */
import type { ContextSelection, OptimizeContextRequest } from '../types/api'
import { useContextStore } from '../store/contextStore'
import { useContextConfigStore } from '../store/contextConfigStore'
import { useGenerationStore } from '../store/generationStore'
import { useVocabularyStore } from '../store/vocabularyStore'
import { useNarrativeGuidesStore } from '../store/narrativeGuidesStore'
import { useFlagsStore } from '../store/flagsStore'

const SAVED_AUTHOR_PROFILE_KEY = 'dialogue_generator_saved_author_profile'

function readAuthorProfileSync(): string | undefined {
  if (typeof localStorage === 'undefined') return undefined
  try {
    const draftSaved = localStorage.getItem('generation_draft')
    if (draftSaved) {
      const draft = JSON.parse(draftSaved) as { authorProfile?: string }
      if (draft.authorProfile !== undefined && draft.authorProfile !== '') {
        return draft.authorProfile
      }
    }
    const saved = localStorage.getItem(SAVED_AUTHOR_PROFILE_KEY)
    return saved && saved !== '' ? saved : undefined
  } catch {
    return undefined
  }
}

function buildFieldConfigsWithEssential(): Record<string, string[]> {
  const { fieldConfigs, essentialFields } = useContextConfigStore.getState()
  const out: Record<string, string[]> = {}
  for (const [elementType, fields] of Object.entries(fieldConfigs)) {
    const essential = essentialFields[elementType] || []
    out[elementType] = [...new Set([...essential, ...fields])]
  }
  return out
}

function buildContextSelectionsStatic(): ContextSelection {
  const selections = useContextStore.getState().selections
  const { sceneSelection, dialogueStructure } = useGenerationStore.getState()
  const { scene_protagonists, scene_location, ...baseSelections } = selections
  void scene_protagonists
  void scene_location
  const contextSelections: ContextSelection = { ...baseSelections }

  const sceneProtagonists: Record<string, string> = {}
  if (sceneSelection.characterA) sceneProtagonists.personnage_a = sceneSelection.characterA
  if (sceneSelection.characterB) sceneProtagonists.personnage_b = sceneSelection.characterB
  if (Object.keys(sceneProtagonists).length > 0) {
    contextSelections.scene_protagonists = sceneProtagonists
  }

  const sceneLocation: Record<string, string> = {}
  if (sceneSelection.sceneRegion) sceneLocation.lieu = sceneSelection.sceneRegion
  if (sceneSelection.subLocation) sceneLocation.sous_lieu = sceneSelection.subLocation
  if (Object.keys(sceneLocation).length > 0) {
    contextSelections.scene_location = sceneLocation
  }

  if (dialogueStructure && dialogueStructure.length > 0) {
    contextSelections.generation_settings = { dialogue_structure: dialogueStructure }
  }

  return contextSelections
}

/**
 * Corps JSON pour `/api/v1/context/optimize` (hors appel réseau).
 */
export function buildOptimizeContextRequest(): OptimizeContextRequest {
  const ctx = useContextConfigStore.getState()
  const gen = useGenerationStore.getState()
  const vocab = useVocabularyStore.getState()
  const narrative = useNarrativeGuidesStore.getState()
  const fieldConfigsWithEssential = buildFieldConfigsWithEssential()
  const inGameFlags = useFlagsStore.getState().getSelectedFlagsArray()
  const userInstructionsValue = gen.generationUserInstructions.trim() || ' '
  const authorProfile = readAuthorProfileSync()

  return {
    user_instructions: userInstructionsValue,
    context_selections: buildContextSelectionsStatic(),
    npc_speaker_id: gen.sceneSelection.characterB || undefined,
    max_context_tokens: ctx.contextTokenBudgetMax,
    system_prompt_override: gen.systemPromptOverride || undefined,
    author_profile: authorProfile,
    max_choices: null,
    choices_mode: 'free',
    narrative_tags: undefined,
    vocabulary_config: vocab.vocabularyConfig
      ? (vocab.vocabularyConfig as unknown as Record<string, string>)
      : undefined,
    include_narrative_guides: narrative.includeNarrativeGuides,
    previous_dialogue_preview: undefined,
    field_configs: Object.keys(fieldConfigsWithEssential).length > 0 ? fieldConfigsWithEssential : undefined,
    organization_mode: ctx.organization,
    in_game_flags: inGameFlags.length > 0 ? inGameFlags : undefined,
    optimization_rules: {
      pinned_entity_keys: ctx.contextOptimizationPinnedKeys,
      strategy: ctx.contextOptimizationStrategy,
      pre_generation_proxy_warning_threshold_percent: ctx.contextOptimizationProxyThreshold,
    },
  }
}
