import { describe, expect, it } from 'vitest'
import type { PromptStructure } from '../types/prompt'
import {
  computeTotalsFromStructuredPrompt,
  mergePrecomputedIntoStructuredPrompt,
  reconcileStructuredPromptTotals,
} from './structuredPromptMerge'

describe('structuredPromptMerge', () => {
  it('total prompt = somme des sections affichées', () => {
    const overhead: PromptStructure = {
      sections: [
        { type: 'other', title: 'CONTRAT GLOBAL', content: 'x', tokenCount: 234 },
        { type: 'other', title: 'GUIDES NARRATIFS', content: 'y', tokenCount: 2698 },
      ],
      metadata: { totalTokens: 0, generatedAt: 't' },
    }

    const merged = mergePrecomputedIntoStructuredPrompt(overhead, [
      {
        entityType: 'characters',
        name: 'Uresaïr',
        mode: 'full',
        tokenCount: 1533,
        contextItem: { id: 'c1', name: 'Uresaïr', sections: [], tokenCount: 1533 },
      },
      {
        entityType: 'locations',
        name: 'Plis',
        mode: 'full',
        tokenCount: 5941,
        contextItem: { id: 'l1', name: 'Plis', sections: [], tokenCount: 5941 },
      },
    ])

    const reconciled = reconcileStructuredPromptTotals(merged)
    const { selectionTokens, promptTokens } = computeTotalsFromStructuredPrompt(reconciled)

    expect(selectionTokens).toBe(1533 + 5941)
    expect(promptTokens).toBe(234 + 2698 + 1533 + 5941)
    expect(reconciled.metadata.totalTokens).toBe(promptTokens)
  })
})
