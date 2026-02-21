/**
 * Hook pour valider les paramètres de génération en temps réel.
 * 
 * Extrait la logique de validation depuis GenerationPanel.
 */
import { useState, useEffect, useMemo } from 'react'
import { CONTEXT_TOKENS_LIMITS } from '../constants'

export interface ValidationError {
  field: string
  message: string
}

export interface UseGenerationValidationReturn {
  /** Erreurs de validation par champ (UX uniquement - limites tokens) */
  validationErrors: Record<string, string>
  /** Valider manuellement (UX uniquement) */
  validate: () => boolean
  /** Indique s'il y a des erreurs */
  hasErrors: boolean
  // NOTE: validateCharacters supprimé - validation métier déplacée vers backend (Pydantic validator)
}

export interface UseGenerationValidationOptions {
  /** Max tokens pour contexte */
  maxContextTokens: number
  /** Max tokens pour completion (null = valeur par défaut) */
  maxCompletionTokens: number | null
  /** Token count estimé */
  tokenCount: number | null
}

/**
 * Hook pour valider les paramètres de génération.
 * 
 * Validation en temps réel des limites de tokens et présence de personnages.
 * 
 * @param options - Options de validation
 * @returns Erreurs de validation et fonctions de validation
 */
export function useGenerationValidation(
  options: UseGenerationValidationOptions
): UseGenerationValidationReturn {
  const { maxContextTokens, maxCompletionTokens, tokenCount } = options
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  
  // selections et buildContextSelections non utilisés dans cette validation - gardés pour usage futur
  // const { selections } = useContextStore()
  // const { buildContextSelections } = useGenerationRequest()

  // Validation en temps réel des tokens
  useEffect(() => {
    const errors: Record<string, string> = {}
    
    if (maxContextTokens < CONTEXT_TOKENS_LIMITS.MIN) {
      errors.maxContextTokens = `Minimum ${CONTEXT_TOKENS_LIMITS.MIN.toLocaleString()} tokens`
    }
    if (maxContextTokens > CONTEXT_TOKENS_LIMITS.MAX) {
      errors.maxContextTokens = `Maximum ${CONTEXT_TOKENS_LIMITS.MAX.toLocaleString()} tokens`
    }
    
    if (maxCompletionTokens !== null) {
      if (maxCompletionTokens < 100) {
        errors.maxCompletionTokens = 'Minimum 100 tokens'
      }
      if (maxCompletionTokens > 16000) {
        errors.maxCompletionTokens = 'Maximum 16 000 tokens (limite backend)'
      }
    }
    
    if (tokenCount && tokenCount > maxContextTokens) {
      errors.tokenCount = `Les tokens estimés (${tokenCount.toLocaleString()}) dépassent la limite (${maxContextTokens.toLocaleString()})`
    }
    
    setValidationErrors(errors)
  }, [maxContextTokens, maxCompletionTokens, tokenCount])

  // NOTE: validateCharacters supprimé - la validation métier "personnages requis" est maintenant
  // effectuée par le backend via le validator Pydantic. Le frontend affichera les erreurs backend
  // quand elles arrivent. On garde uniquement la validation UX pour les tokens.
  
  const validate = useMemo(() => {
    return () => {
      // Valider uniquement les tokens (UX) - pas de validation métier côté frontend
      const hasTokenErrors = Object.keys(validationErrors).length > 0
      return !hasTokenErrors
    }
  }, [validationErrors])

  const hasErrors = useMemo(() => {
    return Object.keys(validationErrors).length > 0
  }, [validationErrors])

  return {
    validationErrors,
    validate,
    hasErrors,
  }
}
