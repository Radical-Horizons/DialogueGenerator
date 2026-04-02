import { describe, it, expect } from 'vitest'
import { buildCostEstimateHeaders } from '../api/costEstimateHeaders'

describe('buildCostEstimateHeaders', () => {
  it('adds X-LLM-Model for non-empty trimmed identifier', () => {
    const h = buildCostEstimateHeaders({
      llmModelIdentifier: '  gpt-5-mini  ',
      promptTokens: 10,
    })
    expect(h?.['X-LLM-Model']).toBe('gpt-5-mini')
    expect(h?.['X-Estimated-Prompt-Tokens']).toBe('10')
  })

  it('omits X-LLM-Model when blank', () => {
    const h = buildCostEstimateHeaders({ llmModelIdentifier: '   ' })
    expect(h).toBeUndefined()
  })
})
