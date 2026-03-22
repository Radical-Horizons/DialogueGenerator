import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContextSuggestionsPanel } from './ContextSuggestionsPanel'
import { useContextStore } from '../../store/contextStore'
import type { SuggestionItem } from '../../types/api'

vi.mock('../../store/contextStore')

const mockUseContextStore = vi.mocked(useContextStore)

describe('ContextSuggestionsPanel', () => {
  const mockAcceptSuggestion = vi.fn()
  const mockIgnoreSuggestion = vi.fn()
  const mockAcceptAllByType = vi.fn()
  const mockIgnoreAllByType = vi.fn()

  const mixedSuggestions: SuggestionItem[] = [
    { type: 'character', name: 'Akthar' },
    { type: 'character', name: 'Tharr' },
    { type: 'location', name: 'Nef Centrale' },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseContextStore.mockReturnValue({
      suggestions: mixedSuggestions,
      acceptSuggestion: mockAcceptSuggestion,
      ignoreSuggestion: mockIgnoreSuggestion,
      acceptAllSuggestionsByType: mockAcceptAllByType,
      ignoreAllSuggestionsByType: mockIgnoreAllByType,
    } as ReturnType<typeof useContextStore>)
  })

  it('affiche le header avec compteur 0 si suggestions est vide', () => {
    mockUseContextStore.mockReturnValue({
      suggestions: [],
      acceptSuggestion: mockAcceptSuggestion,
      ignoreSuggestion: mockIgnoreSuggestion,
      acceptAllSuggestionsByType: mockAcceptAllByType,
      ignoreAllSuggestionsByType: mockIgnoreAllByType,
    } as ReturnType<typeof useContextStore>)

    render(<ContextSuggestionsPanel />)
    expect(screen.getByRole('button', { name: /suggestions \(0\)/i })).toBeInTheDocument()
  })

  it('suggestions vides et panneau ouvert → affiche message placeholder', async () => {
    const user = userEvent.setup()
    mockUseContextStore.mockReturnValue({
      suggestions: [],
      acceptSuggestion: mockAcceptSuggestion,
      ignoreSuggestion: mockIgnoreSuggestion,
      acceptAllSuggestionsByType: mockAcceptAllByType,
      ignoreAllSuggestionsByType: mockIgnoreAllByType,
    } as ReturnType<typeof useContextStore>)

    render(<ContextSuggestionsPanel />)
    await user.click(screen.getByRole('button', { name: /suggestions/i }))
    expect(screen.getByText(/sélectionnez une entité/i)).toBeInTheDocument()
  })

  it('affiche le header replié par défaut (contenu masqué)', () => {
    render(<ContextSuggestionsPanel />)
    expect(screen.getByRole('button', { name: /suggestions/i })).toBeInTheDocument()
    expect(screen.queryByText(/akthar/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/nef centrale/i)).not.toBeInTheDocument()
  })

  it('clic sur le header → déploie le panneau et affiche les suggestions groupées', async () => {
    const user = userEvent.setup()
    render(<ContextSuggestionsPanel />)

    await user.click(screen.getByRole('button', { name: /suggestions/i }))

    expect(screen.getByText(/akthar/i)).toBeInTheDocument()
    expect(screen.getByText(/tharr/i)).toBeInTheDocument()
    expect(screen.getByText(/nef centrale/i)).toBeInTheDocument()
    expect(screen.getByText(/personnages/i)).toBeInTheDocument()
    expect(screen.getByText(/lieux/i)).toBeInTheDocument()
  })

  it('clic "Accepter" sur une suggestion → acceptSuggestion appelé', async () => {
    const user = userEvent.setup()
    render(<ContextSuggestionsPanel />)
    await user.click(screen.getByRole('button', { name: /suggestions/i }))

    await user.click(screen.getByRole('button', { name: /accepter akthar/i }))

    expect(mockAcceptSuggestion).toHaveBeenCalledWith('character', 'Akthar')
  })

  it('clic "Ignorer" sur une suggestion → ignoreSuggestion appelé', async () => {
    const user = userEvent.setup()
    render(<ContextSuggestionsPanel />)
    await user.click(screen.getByRole('button', { name: /suggestions/i }))

    await user.click(screen.getByRole('button', { name: /ignorer akthar/i }))

    expect(mockIgnoreSuggestion).toHaveBeenCalledWith('character', 'Akthar')
  })

  it('clic "Accepter tout" pour un groupe → acceptAllSuggestionsByType appelé', async () => {
    const user = userEvent.setup()
    render(<ContextSuggestionsPanel />)
    await user.click(screen.getByRole('button', { name: /suggestions/i }))

    await user.click(screen.getByRole('button', { name: /accepter tout personnages/i }))

    expect(mockAcceptAllByType).toHaveBeenCalledWith('character')
  })

  it('clic "Ignorer tout" pour un groupe → ignoreAllSuggestionsByType appelé', async () => {
    const user = userEvent.setup()
    render(<ContextSuggestionsPanel />)
    await user.click(screen.getByRole('button', { name: /suggestions/i }))

    await user.click(screen.getByRole('button', { name: /ignorer tout personnages/i }))

    expect(mockIgnoreAllByType).toHaveBeenCalledWith('character')
  })

  it('second clic sur le header → replie le panneau', async () => {
    const user = userEvent.setup()
    render(<ContextSuggestionsPanel />)
    await user.click(screen.getByRole('button', { name: /suggestions/i }))
    expect(screen.getByText(/akthar/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /suggestions/i }))
    expect(screen.queryByText(/akthar/i)).not.toBeInTheDocument()
  })
})
