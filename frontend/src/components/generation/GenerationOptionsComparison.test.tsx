/**
 * Comparaison multi-options (2b) : progression, Garder, Variante.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { GenerateUnityDialogueRequest, GenerateUnityDialogueResponse } from '../../types/api'

vi.mock('../../api/dialogues', () => ({
  createGenerationJob: vi.fn().mockResolvedValue({
    job_id: 'job-x',
    stream_url: '/stream',
    status: 'queued',
  }),
  cancelGenerationJob: vi.fn().mockResolvedValue({ success: true }),
}))

const setUnityDialogueResponse = vi.fn()
vi.mock('../../store/generationStore', () => ({
  useGenerationStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ setUnityDialogueResponse }),
}))

import { useGenerationOptionsStore } from '../../store/generationOptionsStore'
import { GenerationOptionsComparison } from './GenerationOptionsComparison'

const REQUEST = { user_instructions: 'x' } as GenerateUnityDialogueRequest

function makeResult(line: string, choices = 2): GenerateUnityDialogueResponse {
  return {
    // Forme one-shot réelle : `node` singulier (cf. extractPreview).
    json_content: JSON.stringify({
      node: { id: 'START', speaker: 'PNJ', line, choices: Array(choices).fill({ text: 'c' }) },
    }),
    raw_prompt: '' as unknown as GenerateUnityDialogueResponse['raw_prompt'],
    prompt_hash: 'h',
    estimated_tokens: 10,
  }
}

/** EventSource factice minimal pour les relances Variante. */
class NoopEventSource {
  onmessage: unknown = null
  onerror: unknown = null
  readyState = 0
  close() {}
}

describe('GenerationOptionsComparison', () => {
  beforeEach(() => {
    vi.stubGlobal('EventSource', NoopEventSource as unknown as typeof EventSource)
    setUnityDialogueResponse.mockClear()
    useGenerationOptionsStore.setState({
      optionCount: 2,
      slots: [],
      lastRequest: REQUEST,
      keptIndex: null,
    })
  })

  it('ne rend rien hors run multi-options', () => {
    render(<GenerationOptionsComparison />)
    expect(screen.queryByTestId('generation-options-comparison')).toBeNull()
  })

  it('affiche la progression EN ÉCRITURE puis À COMPARER', () => {
    useGenerationOptionsStore.getState().startRun(2, REQUEST)
    useGenerationOptionsStore.getState().updateSlot(0, { status: 'running' })
    const { rerender } = render(<GenerationOptionsComparison />)
    expect(screen.getByTestId('options-progress-label')).toHaveTextContent(
      'OPTION 1 SUR 2 — EN ÉCRITURE'
    )

    useGenerationOptionsStore
      .getState()
      .updateSlot(0, { status: 'completed', result: makeResult('a') })
    useGenerationOptionsStore
      .getState()
      .updateSlot(1, { status: 'completed', result: makeResult('b') })
    rerender(<GenerationOptionsComparison />)
    expect(screen.getByTestId('options-progress-label')).toHaveTextContent(
      '2 OPTIONS SUR 2 — À COMPARER'
    )
  })

  it('Garder pousse le résultat de l’option dans le store de génération', () => {
    useGenerationOptionsStore.getState().startRun(2, REQUEST)
    const result = makeResult('« Réplique gardée »')
    useGenerationOptionsStore.getState().updateSlot(0, { status: 'completed', result: makeResult('a') })
    useGenerationOptionsStore.getState().updateSlot(1, { status: 'completed', result })
    render(<GenerationOptionsComparison />)

    fireEvent.click(screen.getByTestId('option-keep-1'))
    expect(setUnityDialogueResponse).toHaveBeenCalledWith(result)
    expect(useGenerationOptionsStore.getState().keptIndex).toBe(1)
  })

  it('Variante relance uniquement cette option (slot repasse pending/running)', async () => {
    useGenerationOptionsStore.getState().startRun(2, REQUEST)
    useGenerationOptionsStore.getState().updateSlot(0, { status: 'completed', result: makeResult('a') })
    useGenerationOptionsStore.getState().updateSlot(1, { status: 'completed', result: makeResult('b') })
    render(<GenerationOptionsComparison />)

    fireEvent.click(screen.getByTestId('option-variant-1'))
    // Slot 1 repart (pending immédiatement, running après création du job).
    expect(['pending', 'running']).toContain(useGenerationOptionsStore.getState().slots[1].status)
    // Slot 0 intact.
    expect(useGenerationOptionsStore.getState().slots[0].status).toBe('completed')
  })

  it('affiche l’aperçu serif de la réplique et le compteur de réponses', () => {
    useGenerationOptionsStore.getState().startRun(2, REQUEST)
    useGenerationOptionsStore
      .getState()
      .updateSlot(0, { status: 'completed', result: makeResult('Bonjour voyageur', 3) })
    useGenerationOptionsStore.getState().updateSlot(1, { status: 'error', error: 'boom' })
    render(<GenerationOptionsComparison />)

    expect(screen.getByText(/« Bonjour voyageur »/)).toBeInTheDocument()
    expect(screen.getByText('3 RÉPONSES')).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()
    expect(screen.getByTestId('option-retry-1')).toBeInTheDocument()
  })
})
