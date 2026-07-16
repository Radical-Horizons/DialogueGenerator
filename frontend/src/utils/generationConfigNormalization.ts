/**
 * Normalisation des paramètres de génération Unity.
 *
 * Garder aligné avec ``constants.py`` (Defaults) et ``api/schemas/dialogue.py``.
 * Toute valeur UI doit soit passer l'API telle quelle, soit être ramenée à une valeur valide
 * avant envoi — jamais provoquer un 422 opaque pour un réglage du panneau.
 */
import {
  API_MAX_COMPLETION_TOKENS,
  COMPLETION_TOKENS_LIMITS,
  CONTEXT_TOKENS_LIMITS,
  DEFAULT_MODEL,
  MODEL_NAMES,
} from '../constants'
import type { LLMModelResponse } from '../types/api'

/** Modèles acceptés par ``GenerateUnityDialogueRequest`` (structured output Unity). */
export const UNITY_STRUCTURED_OUTPUT_MODELS = [
  MODEL_NAMES.GPT_5_6_SOL,
  MODEL_NAMES.GPT_5_6_TERRA,
  MODEL_NAMES.GPT_5_6_LUNA,
] as const

export type GenerationConfigField = 'maxContextTokens' | 'maxCompletionTokens' | 'llmModel'

export interface GenerationPanelConfig {
  maxContextTokens: number
  maxCompletionTokens: number | null
  llmModel: string
}

export interface GenerationConfigFix {
  field: GenerationConfigField
  message: string
  currentValue: number | string | null
  normalizedValue: number | string | null
}

const API_MIN_COMPLETION_TOKENS = 100

/** Ramène max_context_tokens dans les bornes API. */
export function normalizeMaxContextTokensForApi(value: number): number {
  return Math.min(
    Math.max(value, CONTEXT_TOKENS_LIMITS.MIN),
    CONTEXT_TOKENS_LIMITS.MAX,
  )
}

/** Ramène max_completion_tokens dans les bornes API (null = auto côté backend). */
export function normalizeMaxCompletionTokensForApi(value: number | null): number | null {
  if (value === null) {
    return null
  }
  const uiBounded = Math.min(
    Math.max(value, COMPLETION_TOKENS_LIMITS.MIN),
    COMPLETION_TOKENS_LIMITS.MAX,
  )
  return Math.min(Math.max(uiBounded, API_MIN_COMPLETION_TOKENS), API_MAX_COMPLETION_TOKENS)
}

/** Ramène max_completion_tokens dans les bornes du slider UI. */
export function normalizeMaxCompletionTokensForUi(value: number | null): number | null {
  if (value === null) {
    return null
  }
  return Math.min(
    Math.max(value, COMPLETION_TOKENS_LIMITS.MIN),
    COMPLETION_TOKENS_LIMITS.MAX,
  )
}

/** Modèle utilisable pour la génération Unity (structured output). */
export function resolveModelForUnityGeneration(
  model: string,
  availableModels: LLMModelResponse[],
): string {
  const availableIds = availableModels.map((m) => m.model_identifier)
  if (
    (UNITY_STRUCTURED_OUTPUT_MODELS as readonly string[]).includes(model)
    && availableIds.includes(model)
  ) {
    return model
  }
  for (const allowed of UNITY_STRUCTURED_OUTPUT_MODELS) {
    if (availableIds.includes(allowed)) {
      return allowed
    }
  }
  const fallback = availableModels.find(
    (m) => m.model_identifier && m.model_identifier !== 'unknown',
  )?.model_identifier
  return fallback ?? DEFAULT_MODEL
}

/** Détecte les écarts entre l'état UI et les valeurs normalisées envoyables à l'API. */
export function detectGenerationConfigFixes(
  config: GenerationPanelConfig,
  availableModels: LLMModelResponse[],
): GenerationConfigFix[] {
  const fixes: GenerationConfigFix[] = []

  const normalizedContext = normalizeMaxContextTokensForApi(config.maxContextTokens)
  if (normalizedContext !== config.maxContextTokens) {
    fixes.push({
      field: 'maxContextTokens',
      message: `Budget contexte ramené à ${normalizedContext.toLocaleString()} tokens (plage API).`,
      currentValue: config.maxContextTokens,
      normalizedValue: normalizedContext,
    })
  }

  const normalizedCompletion = normalizeMaxCompletionTokensForApi(config.maxCompletionTokens)
  if (normalizedCompletion !== config.maxCompletionTokens) {
    fixes.push({
      field: 'maxCompletionTokens',
      message:
        config.maxCompletionTokens !== null && config.maxCompletionTokens > API_MAX_COMPLETION_TOKENS
          ? `Max tokens génération ramené à ${(API_MAX_COMPLETION_TOKENS / 1000).toFixed(0)}K (plafond API).`
          : `Max tokens génération ramené à ${normalizedCompletion?.toLocaleString() ?? 'Auto'} (plage valide).`,
      currentValue: config.maxCompletionTokens,
      normalizedValue: normalizedCompletion,
    })
  }

  const normalizedModel = resolveModelForUnityGeneration(config.llmModel, availableModels)
  if (normalizedModel !== config.llmModel) {
    fixes.push({
      field: 'llmModel',
      message: `Le modèle « ${config.llmModel} » n'est pas supporté pour la génération Unity ; bascule vers « ${normalizedModel} ».`,
      currentValue: config.llmModel,
      normalizedValue: normalizedModel,
    })
  }

  return fixes
}

/** Applique les correctifs détectés sur l'état du panneau (retourne les setters à invoquer). */
export function applyGenerationConfigFixes(
  fixes: GenerationConfigFix[],
): Partial<GenerationPanelConfig> {
  const patch: Partial<GenerationPanelConfig> = {}
  for (const fix of fixes) {
    if (fix.field === 'maxContextTokens' && typeof fix.normalizedValue === 'number') {
      patch.maxContextTokens = fix.normalizedValue
    } else if (fix.field === 'maxCompletionTokens') {
      patch.maxCompletionTokens =
        typeof fix.normalizedValue === 'number' ? fix.normalizedValue : null
    } else if (fix.field === 'llmModel' && typeof fix.normalizedValue === 'string') {
      patch.llmModel = fix.normalizedValue
    }
  }
  return patch
}

/** Mappe une réponse 422 (champs Pydantic) vers des correctifs UI quand possible. */
export function fixesFromApiValidationDetails(
  details: Record<string, unknown> | undefined,
  config: GenerationPanelConfig,
  availableModels: LLMModelResponse[],
): GenerationConfigFix[] {
  if (!details) {
    return []
  }
  const fixes: GenerationConfigFix[] = []

  const completionMsg = details.max_completion_tokens
  if (typeof completionMsg === 'string' && config.maxCompletionTokens !== null) {
    const normalized = normalizeMaxCompletionTokensForApi(config.maxCompletionTokens)
    if (normalized !== config.maxCompletionTokens) {
      fixes.push({
        field: 'maxCompletionTokens',
        message: completionMsg,
        currentValue: config.maxCompletionTokens,
        normalizedValue: normalized,
      })
    }
  }

  const contextMsg = details.max_context_tokens
  if (typeof contextMsg === 'string') {
    const normalized = normalizeMaxContextTokensForApi(config.maxContextTokens)
    if (normalized !== config.maxContextTokens) {
      fixes.push({
        field: 'maxContextTokens',
        message: contextMsg,
        currentValue: config.maxContextTokens,
        normalizedValue: normalized,
      })
    }
  }

  const modelMsg = details.llm_model_identifier
  if (typeof modelMsg === 'string') {
    const normalized = resolveModelForUnityGeneration(config.llmModel, availableModels)
    if (normalized !== config.llmModel) {
      fixes.push({
        field: 'llmModel',
        message: modelMsg,
        currentValue: config.llmModel,
        normalizedValue: normalized,
      })
    }
  }

  return fixes
}
