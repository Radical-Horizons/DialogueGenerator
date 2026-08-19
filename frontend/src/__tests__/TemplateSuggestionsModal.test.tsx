/**
 * Tests du modal Suggestions (empty, liste, Charger).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TemplateSuggestionsModal } from '../components/generation/TemplateSuggestionsModal'
import type { TemplateSuggestion } from '../types/template'

const mockSuggest = vi.fn()

vi.mock('../api/templates', () => ({
  suggestTemplatesApi: (...args: unknown[]) => mockSuggest(...args),
}))

function item(overrides: Partial<TemplateSuggestion> = {}): TemplateSuggestion {
  return {
    source: 'prebuilt',
    id: 'confrontation',
    name: 'Confrontation',
    description: 'Desc',
    category: 'Confrontation',
    icon: '⚔️',
    score: 40,
    reasons: ['Correspond aux mots-clés du brief'],
    configuration: {
      characters: [],
      locations: [],
      region: '',
      sceneType: 'Generic',
      instructions: 'Brief',
    },
    sceneTypeHint: 'confrontation',
    ...overrides,
  }
}

const emptyRequest = {
  instructions: '',
  sceneType: '',
  characters: [] as string[],
  locations: [] as string[],
  rencontreInitialeByCharacter: {},
}

describe('TemplateSuggestionsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSuggest.mockResolvedValue([])
  })

  it('affiche l’empty state sans suggestion', async () => {
    render(
      <TemplateSuggestionsModal
        isOpen
        onClose={vi.fn()}
        request={emptyRequest}
        onLoad={vi.fn()}
      />,
    )
    expect(await screen.findByTestId('suggestions-empty')).toBeInTheDocument()
  })

  it('affiche score, raisons et charge au clic', async () => {
    mockSuggest.mockResolvedValue([item()])
    const onLoad = vi.fn()
    const onClose = vi.fn()
    render(
      <TemplateSuggestionsModal
        isOpen
        onClose={onClose}
        request={{ ...emptyRequest, instructions: 'confrontation' }}
        onLoad={onLoad}
      />,
    )
    expect(await screen.findByTestId('suggestion-item')).toBeInTheDocument()
    expect(screen.getByTestId('suggestion-badge')).toHaveTextContent('Suggéré pour votre contexte')
    expect(screen.getByTestId('suggestion-score')).toHaveTextContent('40%')
    expect(screen.getByTestId('suggestion-reasons')).toHaveTextContent(
      'Correspond aux mots-clés du brief',
    )
    fireEvent.click(screen.getByTestId('suggestion-load-btn'))
    await waitFor(() => {
      expect(onLoad).toHaveBeenCalled()
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('reste ouvert si Charger échoue', async () => {
    mockSuggest.mockResolvedValue([item()])
    const onLoad = vi.fn().mockRejectedValue(new Error('load-failed'))
    const onClose = vi.fn()
    render(
      <TemplateSuggestionsModal
        isOpen
        onClose={onClose}
        request={{ ...emptyRequest, instructions: 'confrontation' }}
        onLoad={onLoad}
      />,
    )
    expect(await screen.findByTestId('suggestion-load-btn')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('suggestion-load-btn'))
    await waitFor(() => {
      expect(onLoad).toHaveBeenCalled()
    })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByTestId('template-suggestions-modal')).toBeInTheDocument()
  })

  it('ferme avec Escape et libelle un custom partagé', async () => {
    mockSuggest.mockResolvedValue([
      item({ source: 'custom', relation: 'granted', name: 'Partagé A' }),
    ])
    const onClose = vi.fn()
    render(
      <TemplateSuggestionsModal
        isOpen
        onClose={onClose}
        request={{ ...emptyRequest, instructions: 'confrontation' }}
        onLoad={vi.fn()}
      />,
    )
    expect(await screen.findByTestId('suggestion-source')).toHaveTextContent('Partagé')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
