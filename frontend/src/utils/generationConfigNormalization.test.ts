import { describe, expect, it } from 'vitest'
import { MODEL_NAMES } from '../constants'
import {
  detectGenerationConfigFixes,
  normalizeMaxCompletionTokensForApi,
  resolveModelForUnityGeneration,
} from './generationConfigNormalization'

describe('generationConfigNormalization', () => {
  it('accepte 60K tokens génération (cas utilisateur prod)', () => {
    expect(normalizeMaxCompletionTokensForApi(60_000)).toBe(60_000)
  })

  it('ne propose pas de correctif pour 60K + gpt-5.6-terra', () => {
    const fixes = detectGenerationConfigFixes(
      { maxContextTokens: 300_000, maxCompletionTokens: 60_000, llmModel: MODEL_NAMES.GPT_5_2 },
      [{ model_identifier: MODEL_NAMES.GPT_5_2, display_name: 'GPT-5.6 Terra', client_type: 'openai', max_tokens: 128_000 }],
    )
    expect(fixes).toHaveLength(0)
  })

  it('ne propose pas de correctif pour gpt-5.6-sol (structured output Unity)', () => {
    const fixes = detectGenerationConfigFixes(
      { maxContextTokens: 300_000, maxCompletionTokens: 60_000, llmModel: MODEL_NAMES.GPT_5_4 },
      [{ model_identifier: MODEL_NAMES.GPT_5_4, display_name: 'GPT-5.6 Sol', client_type: 'openai', max_tokens: 128_000 }],
    )
    expect(fixes).toHaveLength(0)
  })

  it('propose un correctif modèle si Mistral sélectionné pour Unity', () => {
    const fixes = detectGenerationConfigFixes(
      { maxContextTokens: 50_000, maxCompletionTokens: null, llmModel: 'labs-mistral-small-creative' },
      [
        { model_identifier: 'gpt-5.6-terra', display_name: 'GPT-5.6 Terra', client_type: 'openai', max_tokens: 128_000 },
        { model_identifier: 'labs-mistral-small-creative', display_name: 'Mistral', client_type: 'mistral', max_tokens: 32_000 },
      ],
    )
    expect(fixes.some((f) => f.field === 'llmModel')).toBe(true)
    expect(resolveModelForUnityGeneration('labs-mistral-small-creative', [
      { model_identifier: 'gpt-5.6-terra', display_name: 'GPT-5.6 Terra', client_type: 'openai', max_tokens: 128_000 },
      { model_identifier: 'labs-mistral-small-creative', display_name: 'Mistral', client_type: 'mistral', max_tokens: 32_000 },
    ])).toBe(MODEL_NAMES.GPT_5_2)
  })
})
