/**
 * « Générer la suite avec l'IA » : le contexte parent montre la réplique entière.
 * Vécu le 2026-11-19 : coupée à 150 caractères sur trois lignes, l'auteur ne voyait pas
 * la fin de la réplique dont il demandait la suite.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useGraphStore } from '../../store/graphStore'

vi.mock('../../api/config', () => ({
  listLLMModels: vi.fn().mockResolvedValue({ models: [], total: 0 }),
  getLLMModels: vi.fn().mockResolvedValue({ models: [], total: 0 }),
}))
vi.mock('./CostEstimationBadge', () => ({ CostEstimationBadge: () => null }))
vi.mock('../../hooks/useCostGovernance', () => ({
  useCostGovernance: () => ({ checkBudget: vi.fn(), isBlocked: false }),
}))

import { AIGenerationPanel } from './AIGenerationPanel'

const LONG_LINE =
  "*(un éclair d'espoir traverse son regard)* « Vraiment ? Vous feriez cela ? » *Il pose son outil et se lève précipitamment.*\n" +
  '« C’était près de la Confluence, là où les flux temporels se croisent. Suivez-moi ! »'

describe('AIGenerationPanel — contexte parent', () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: [
        {
          id: 'node-trace-enfant',
          type: 'dialogueNode',
          position: { x: 0, y: 0 },
          data: { id: 'node-trace-enfant', speaker: "Voknir Esh'Maradel", line: LONG_LINE },
        },
      ],
      edges: [],
    })
  })

  it('affiche la réplique parente en entier, narration et parole séparées', () => {
    render(<AIGenerationPanel parentNodeId="node-trace-enfant" onClose={() => {}} />)
    const line = screen.getByTestId('ai-generation-parent-line')
    expect(line.style.maxHeight).toBe('')
    const segments = Array.from(line.querySelectorAll('[data-segment]')).map((el) => [
      el.getAttribute('data-segment'),
      el.textContent,
    ])
    expect(segments).toEqual([
      ['narration', "(un éclair d'espoir traverse son regard)"],
      ['speech', '« Vraiment ? Vous feriez cela ? »'],
      ['narration', 'Il pose son outil et se lève précipitamment.'],
      ['speech', '« C’était près de la Confluence, là où les flux temporels se croisent. Suivez-moi ! »'],
    ])
  })
})
