/**
 * Hook pour valider les paramètres de génération en temps réel.
 * 
 * Extrait la logique de validation depuis GenerationPanel.
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { CONTEXT_TOKENS_LIMITS, COMPLETION_TOKENS_LIMITS } from '../constants'
import {
  applyGenerationConfigFixes,
  detectGenerationConfigFixes,
  type GenerationConfigFix,
} from '../utils/generationConfigNormalization'
import type { LLMModelResponse } from '../types/api'

export interface UseGenerationValidationReturn {
  /** Erreurs de validation par champ (UX uniquement - limites tokens) */
  validationErrors: Record<string, string>
  /** Correctifs proposés (valeur UI → valeur API valide) */
  configFixes: GenerationConfigFix[]
  /** Applique les correctifs sur l'état local (via setters fournis) */
  applyConfigFixes: () => Partial<{
    maxContextTokens: number
    maxCompletionTokens: number | null
    llmModel: string
  }>
  /** Valider manuellement (UX uniquement) */
  validate: () => boolean
  /** Indique s'il y a des erreurs */
  hasErrors: boolean
}

export interface UseGenerationValidationOptions {
  maxContextTokens: number
  maxCompletionTokens: number | null
  llmModel: string
  availableModels: LLMModelResponse[]
  tokenCount: number | null
}

export function useGenerationValidation(
  options: UseGenerationValidationOptions
): UseGenerationValidationReturn {
  const { maxContextTokens, maxCompletionTokens, llmModel, availableModels, tokenCount } = options
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  const configFixes = useMemo(
    () => detectGenerationConfigFixes(
      { maxContextTokens, maxCompletionTokens, llmModel },
      availableModels,
    ),
    [maxContextTokens, maxCompletionTokens, llmModel, availableModels],
  )

  useEffect(() => {
    const errors: Record<string, string> = {}

    if (maxContextTokens < CONTEXT_TOKENS_LIMITS.MIN) {
      errors.maxContextTokens = `Minimum ${CONTEXT_TOKENS_LIMITS.MIN.toLocaleString()} tokens`
    }
    if (maxContextTokens > CONTEXT_TOKENS_LIMITS.MAX) {
      errors.maxContextTokens = `Maximum ${CONTEXT_TOKENS_LIMITS.MAX.toLocaleString()} tokens`
    }

    if (maxCompletionTokens !== null) {
      if (maxCompletionTokens < COMPLETION_TOKENS_LIMITS.MIN) {
        errors.maxCompletionTokens = `Minimum ${(COMPLETION_TOKENS_LIMITS.MIN / 1000).toFixed(0)} 000 tokens`
      }
      if (maxCompletionTokens > COMPLETION_TOKENS_LIMITS.MAX) {
        errors.maxCompletionTokens = `Maximum ${(COMPLETION_TOKENS_LIMITS.MAX / 1000).toFixed(0)} 000 tokens`
      }
    }

    if (tokenCount && tokenCount > maxContextTokens) {
      errors.tokenCount = `Les tokens estimés (${tokenCount.toLocaleString()}) dépassent la limite (${maxContextTokens.toLocaleString()})`
    }

    for (const fix of configFixes) {
      if (fix.field === 'maxContextTokens') {
        errors.maxContextTokens = fix.message
      } else if (fix.field === 'maxCompletionTokens') {
        errors.maxCompletionTokens = fix.message
      } else if (fix.field === 'llmModel') {
        errors.llmModel = fix.message
      }
    }

    setValidationErrors(errors)
  }, [maxContextTokens, maxCompletionTokens, tokenCount, configFixes])

  const applyConfigFixes = useCallback(
    () => applyGenerationConfigFixes(configFixes),
    [configFixes],
  )

  const validate = useMemo(() => {
    return () => Object.keys(validationErrors).length === 0
  }, [validationErrors])

  const hasErrors = useMemo(() => Object.keys(validationErrors).length > 0, [validationErrors])

  return {
    validationErrors,
    configFixes,
    applyConfigFixes,
    validate,
    hasErrors,
  }
}
