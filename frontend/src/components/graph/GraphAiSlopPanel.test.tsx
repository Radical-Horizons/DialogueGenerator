/**
 * FR43 : chargement, résumé, détail, erreur API, payload options.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GraphAiSlopPanel } from './GraphAiSlopPanel'
import { useGraphStore } from '../../store/graphStore'
import type { DetectAiSlopResponse } from '../../types/graph'

vi.mock('../../api/graph', () => ({
  detectAiSlop: vi.fn(),
}))

import * as graphAPI from '../../api/graph'

function makeResponse(): DetectAiSlopResponse {
  return {
    summary_gpt_isms: 'GPT-isms : 1 occurrence(s) dans 1 nœud(s)',
    summary_repetitions: 'Répétitions : aucune phrase détectée',
    summary_generic_phrases: 'Phrases génériques : 0 occurrence',
    gpt_ism_occurrence_count: 1,
    gpt_ism_distinct_node_count: 1,
    generic_phrase_occurrence_count: 0,
    repetition_group_count: 0,
    occurrences: [
      {
        kind: 'gpt_ism',
        node_id: 'N1',
        node_display_id: 'N1',
        field: 'line',
        excerpt: 'Ah, je vois.',
        matched_span: 'Ah, je vois',
        suggestion: 'Test',
        severity: 'warning',
      },
    ],
    repetition_groups: [],
  }
}

function seedStoreOneDialogueNode() {
  useGraphStore.setState({
    nodes: [
      {
        id: 'N1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'N1', speaker: 'PNJ', line: 'Ah, je vois.' },
      },
    ],
    edges: [],
  })
}

describe('GraphAiSlopPanel', () => {
  beforeEach(() => {
    vi.mocked(graphAPI.detectAiSlop).mockReset()
    useGraphStore.setState({ nodes: [], edges: [] })
    localStorage.removeItem('dialogueGenerator.aiSlopDetection.v1')
  })

  it('affiche loading puis résumé et une occurrence après succès API', async () => {
    seedStoreOneDialogueNode()
    let resolveDetect!: (value: DetectAiSlopResponse) => void
    vi.mocked(graphAPI.detectAiSlop).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDetect = resolve
        })
    )
    const user = userEvent.setup()
    render(<GraphAiSlopPanel onClose={() => undefined} />)
    await user.click(screen.getByTestId('graph-ai-slop-detect'))
    expect(screen.getByRole('button', { name: /Détection/i })).toBeDisabled()
    resolveDetect(makeResponse())
    expect(await screen.findByTestId('graph-ai-slop-summary')).toBeInTheDocument()
    expect(screen.getByTestId('graph-ai-slop-occurrences')).toBeInTheDocument()
  })

  it('affiche erreur API', async () => {
    seedStoreOneDialogueNode()
    vi.mocked(graphAPI.detectAiSlop).mockRejectedValue(new Error('API down'))
    const user = userEvent.setup()
    render(<GraphAiSlopPanel onClose={() => undefined} />)
    await user.click(screen.getByTestId('graph-ai-slop-detect'))
    expect(await screen.findByTestId('graph-ai-slop-error')).toHaveTextContent('API down')
  })

  it('envoie include_repetitions: false quand la case est décochée', async () => {
    seedStoreOneDialogueNode()
    vi.mocked(graphAPI.detectAiSlop).mockResolvedValue({
      ...makeResponse(),
      occurrences: [],
    })
    const user = userEvent.setup()
    render(<GraphAiSlopPanel onClose={() => undefined} />)
    await user.click(screen.getByTestId('slop-toggle-repetitions'))
    await user.click(screen.getByTestId('graph-ai-slop-detect'))
    expect(vi.mocked(graphAPI.detectAiSlop)).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ include_repetitions: false }),
      })
    )
  })

  it('ajoute un mot-clé custom au payload via Appliquer', async () => {
    seedStoreOneDialogueNode()
    vi.mocked(graphAPI.detectAiSlop).mockResolvedValue(makeResponse())
    const user = userEvent.setup()
    render(<GraphAiSlopPanel onClose={() => undefined} />)
    await user.type(screen.getByTestId('slop-keywords-draft'), 'monmotunique')
    await user.click(screen.getByTestId('slop-keywords-apply'))
    await user.click(screen.getByTestId('graph-ai-slop-detect'))
    expect(vi.mocked(graphAPI.detectAiSlop)).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ custom_keywords: ['monmotunique'] }),
      })
    )
  })
})
