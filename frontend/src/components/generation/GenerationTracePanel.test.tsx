/**
 * Colonne TRACE (écran 2a) : lignes horodatées réelles, compteurs ENVOYÉ/REÇU.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useGenerationStore } from '../../store/generationStore'
import { GenerationTracePanel } from './GenerationTracePanel'

function setRunState(patch: Partial<ReturnType<typeof useGenerationStore.getState>>) {
  useGenerationStore.setState(patch as never)
}

describe('GenerationTracePanel', () => {
  beforeEach(() => {
    useGenerationStore.setState({
      isGenerating: false,
      isInterrupting: false,
      currentStep: 'Prompting',
      streamingContent: '',
      generationStartedAt: null,
      tokenCount: null,
    } as never)
  })

  it('journalise chaque étape atteinte, une seule fois', () => {
    setRunState({ isGenerating: true, generationStartedAt: Date.now(), currentStep: 'Prompting' })
    const { rerender } = render(<GenerationTracePanel />)
    expect(screen.getByText('Contexte assemblé, prompt envoyé.')).toBeInTheDocument()

    setRunState({ currentStep: 'Generating' })
    rerender(<GenerationTracePanel />)
    expect(screen.getByText('Écrit la réplique et les réponses.')).toBeInTheDocument()

    // Re-rendre sans changer d'étape ne duplique pas la ligne.
    rerender(<GenerationTracePanel />)
    expect(screen.getAllByText('Écrit la réplique et les réponses.')).toHaveLength(1)
  })

  it('affiche ENVOYÉ (prompt estimé) et REÇU (texte streamé)', () => {
    setRunState({
      isGenerating: true,
      generationStartedAt: Date.now(),
      tokenCount: 31240,
      streamingContent: 'a'.repeat(400),
    })
    render(<GenerationTracePanel />)
    // `toLocaleString('fr-FR')` sépare les milliers par une espace insécable étroite
    // (U+202F selon la version d'ICU) : matcher sur les chiffres, pas sur le séparateur.
    expect(
      screen.getByText((_, el) => /^31\s?240$/.test(el?.textContent?.trim() ?? ''))
    ).toBeInTheDocument()
    // 400 caractères ≈ 100 tokens.
    expect(screen.getByTestId('trace-received')).toHaveTextContent('100')
  })

  it('« masquer » rend la main à l’appelant', () => {
    const onHide = vi.fn()
    setRunState({ isGenerating: true, generationStartedAt: Date.now() })
    render(<GenerationTracePanel onHide={onHide} />)
    screen.getByTestId('trace-hide').click()
    expect(onHide).toHaveBeenCalledTimes(1)
  })

  it('hors run, aucune ligne « en cours » ne clignote', () => {
    render(<GenerationTracePanel />)
    expect(screen.queryByText('écrit la réplique…')).toBeNull()
  })
})
