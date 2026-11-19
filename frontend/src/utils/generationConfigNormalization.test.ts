import { describe, expect, it } from 'vitest'
import { MODEL_NAMES, normalizeModelId } from '../constants'
import {
  detectGenerationConfigFixes,
  normalizeMaxCompletionTokensForApi,
  resolveModelForUnityGeneration,
} from './generationConfigNormalization'

describe('generationConfigNormalization', () => {
  it('accepte 60K tokens génération (cas utilisateur prod)', () => {
    expect(normalizeMaxCompletionTokensForApi(60_000)).toBe(60_000)
  })

  it('normalise gpt-5.4 legacy vers gpt-6.2-astra', () => {
    expect(normalizeModelId('gpt-5.4')).toBe(MODEL_NAMES.GPT_6_2_ASTRA)
  })

  it('ne propose pas de correctif pour le littéral gpt-5.4 si sol est disponible', () => {
    const fixes = detectGenerationConfigFixes(
      { maxContextTokens: 300_000, maxCompletionTokens: 60_000, llmModel: 'gpt-5.4' },
      [{ model_identifier: MODEL_NAMES.GPT_6_2_ASTRA, display_name: 'GPT-6.2 Astra', client_type: 'openai', max_tokens: 128_000 }],
    )
    expect(fixes.filter((f) => f.field === 'llmModel')).toHaveLength(0)
  })

  it('ne propose pas de correctif pour 60K + gpt-6.2-sol', () => {
    const fixes = detectGenerationConfigFixes(
      { maxContextTokens: 300_000, maxCompletionTokens: 60_000, llmModel: MODEL_NAMES.GPT_5_2 },
      [{ model_identifier: MODEL_NAMES.GPT_5_2, display_name: 'GPT-6.2 Sol', client_type: 'openai', max_tokens: 128_000 }],
    )
    expect(fixes).toHaveLength(0)
  })

  it('ne propose pas de correctif pour gpt-6.2-astra (structured output Unity)', () => {
    const fixes = detectGenerationConfigFixes(
      { maxContextTokens: 300_000, maxCompletionTokens: 60_000, llmModel: MODEL_NAMES.GPT_5_4 },
      [{ model_identifier: MODEL_NAMES.GPT_5_4, display_name: 'GPT-6.2 Astra', client_type: 'openai', max_tokens: 128_000 }],
    )
    expect(fixes).toHaveLength(0)
  })

  it('propose un correctif modèle si Mistral sélectionné pour Unity', () => {
    const fixes = detectGenerationConfigFixes(
      { maxContextTokens: 50_000, maxCompletionTokens: null, llmModel: 'mistral-large-4' },
      [
        { model_identifier: 'gpt-6.2-sol', display_name: 'GPT-6.2 Sol', client_type: 'openai', max_tokens: 128_000 },
        { model_identifier: 'mistral-large-4', display_name: 'Mistral', client_type: 'mistral', max_tokens: 32_000 },
      ],
    )
    expect(fixes.some((f) => f.field === 'llmModel')).toBe(true)
    expect(resolveModelForUnityGeneration('mistral-large-4', [
      { model_identifier: 'gpt-6.2-sol', display_name: 'GPT-6.2 Sol', client_type: 'openai', max_tokens: 128_000 },
      { model_identifier: 'mistral-large-4', display_name: 'Mistral', client_type: 'mistral', max_tokens: 32_000 },
    ])).toBe(MODEL_NAMES.GPT_5_2)
  })
})
