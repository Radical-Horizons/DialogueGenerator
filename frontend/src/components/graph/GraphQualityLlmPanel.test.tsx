/**
 * FR42 : chargement, score, critère, erreur API.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GraphQualityLlmPanel } from './GraphQualityLlmPanel'
import { useGraphStore } from '../../store/graphStore'
import type { EvaluateDialogueQualityResponse } from '../../types/graph'

vi.mock('../../api/graph', () => ({
  evaluateDialogueQuality: vi.fn(),
}))

import * as graphAPI from '../../api/graph'

function seedStoreOneDialogueNode() {
  useGraphStore.setState({
    nodes: [
      {
        id: 'N1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'N1', speaker: 'PNJ', line: 'Salut' },
      },
    ],
    edges: [],
  })
}

const baseCriterion = {
  criterion_id: 'narrative_coherence' as const,
  label: 'Cohérence narrative',
  score: 7,
  comment: 'OK',
}

function makeResponse(overall: number): EvaluateDialogueQualityResponse {
  return {
    overall_score: overall,
    score_variance_margin: 1,
    score_variance_note: 'Variance ±1',
    criteria: [
      baseCriterion,
      {
        criterion_id: 'characterization',
        label: 'Caractérisation',
        score: 7,
        comment: 'x',
      },
      { criterion_id: 'agency', label: 'Agentivité', score: 7, comment: 'x' },
      { criterion_id: 'style', label: 'Style', score: 7, comment: 'x' },
    ],
    global_comment: 'Synthèse',
    suggestions: overall < 5 ? ['Regénérer'] : [],
    strengths: overall > 8 ? ['Bon rythme'] : [],
    model_id: 'gpt-test',
    provider: 'openai',
  }
}

/** Score bas sans suggestions API : doit afficher des pistes dérivées des commentaires (AC #3). */
function makeResponseLowDerivedOnly(): EvaluateDialogueQualityResponse {
  return {
    overall_score: 4,
    score_variance_margin: 1,
    score_variance_note: 'Variance ±1',
    criteria: [
      {
        criterion_id: 'narrative_coherence',
        label: 'Cohérence narrative',
        score: 3,
        comment: 'Fil fragile.',
      },
      {
        criterion_id: 'characterization',
        label: 'Caractérisation',
        score: 3,
        comment: 'PNJ plat.',
      },
      { criterion_id: 'agency', label: 'Agentivité', score: 3, comment: 'Peu de choix.' },
      { criterion_id: 'style', label: 'Style', score: 4, comment: 'OK.' },
    ],
    global_comment: null,
    suggestions: [],
    strengths: [],
    model_id: 'gpt-test',
    provider: 'openai',
  }
}

describe('GraphQualityLlmPanel', () => {
  beforeEach(() => {
    vi.mocked(graphAPI.evaluateDialogueQuality).mockReset()
    useGraphStore.setState({ nodes: [], edges: [] })
  })

  it('affiche loading puis score et un critère après succès API', async () => {
    seedStoreOneDialogueNode()
    vi.mocked(graphAPI.evaluateDialogueQuality).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(makeResponse(7)), 20)
        })
    )
    const user = userEvent.setup()
    render(<GraphQualityLlmPanel onClose={() => undefined} />)
    await user.click(screen.getByTestId('graph-quality-llm-evaluate'))
    expect(screen.getByRole('button', { name: /Évaluation/i })).toBeDisabled()
    expect(await screen.findByText(/Score global : 7/)).toBeInTheDocument()
    expect(screen.getByTestId('quality-criterion-narrative_coherence')).toBeInTheDocument()
  })

  it('affiche message erreur si API échoue', async () => {
    seedStoreOneDialogueNode()
    vi.mocked(graphAPI.evaluateDialogueQuality).mockRejectedValue(new Error('API down'))
    const user = userEvent.setup()
    render(<GraphQualityLlmPanel onClose={() => undefined} />)
    await user.click(screen.getByTestId('graph-quality-llm-evaluate'))
    expect(await screen.findByTestId('graph-quality-llm-error')).toHaveTextContent('API down')
  })

  it('score 4 → avertissement faible ; deux runs → historique 2 points', async () => {
    seedStoreOneDialogueNode()
    vi.mocked(graphAPI.evaluateDialogueQuality)
      .mockResolvedValueOnce(makeResponse(4))
      .mockResolvedValueOnce(makeResponse(4))
    const user = userEvent.setup()
    render(<GraphQualityLlmPanel onClose={() => undefined} />)
    await user.click(screen.getByTestId('graph-quality-llm-evaluate'))
    expect(await screen.findByTestId('graph-quality-llm-warning-low')).toBeInTheDocument()
    await user.click(screen.getByTestId('graph-quality-llm-evaluate'))
    expect(screen.getByText(/Historique session \(2\)/)).toBeInTheDocument()
  })

  it('score 9 → message positif', async () => {
    seedStoreOneDialogueNode()
    vi.mocked(graphAPI.evaluateDialogueQuality).mockResolvedValue(makeResponse(9))
    const user = userEvent.setup()
    render(<GraphQualityLlmPanel onClose={() => undefined} />)
    await user.click(screen.getByTestId('graph-quality-llm-evaluate'))
    expect(await screen.findByTestId('graph-quality-llm-positive-high')).toBeInTheDocument()
  })

  it('score bas + suggestions vides → affiche pistes dérivées des critères', async () => {
    seedStoreOneDialogueNode()
    vi.mocked(graphAPI.evaluateDialogueQuality).mockResolvedValue(makeResponseLowDerivedOnly())
    const user = userEvent.setup()
    render(<GraphQualityLlmPanel onClose={() => undefined} />)
    await user.click(screen.getByTestId('graph-quality-llm-evaluate'))
    const box = await screen.findByTestId('graph-quality-llm-warning-low')
    expect(box).toHaveTextContent('Cohérence narrative')
    expect(box).toHaveTextContent('Fil fragile')
  })
})
