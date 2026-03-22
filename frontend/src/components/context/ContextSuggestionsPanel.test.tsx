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

  it('ne rend rien si suggestions est vide', () => {
    mockUseContextStore.mockReturnValue({
      suggestions: [],
      acceptSuggestion: mockAcceptSuggestion,
      ignoreSuggestion: mockIgnoreSuggestion,
      acceptAllSuggestionsByType: mockAcceptAllByType,
      ignoreAllSuggestionsByType: mockIgnoreAllByType,
    } as ReturnType<typeof useContextStore>)

    const { container } = render(<ContextSuggestionsPanel />)
    expect(container.firstChild).toBeNull()
  })

  it('affiche les suggestions groupées par type', () => {
    render(<ContextSuggestionsPanel />)
    expect(screen.getByText(/akthar/i)).toBeInTheDocument()
    expect(screen.getByText(/tharr/i)).toBeInTheDocument()
    expect(screen.getByText(/nef centrale/i)).toBeInTheDocument()
    // 2 groupes
    expect(screen.getByText(/personnages/i)).toBeInTheDocument()
    expect(screen.getByText(/lieux/i)).toBeInTheDocument()
  })

  it('clic "Accepter" sur une suggestion → acceptSuggestion appelé', async () => {
    const user = userEvent.setup()
    render(<ContextSuggestionsPanel />)

    const acceptBtn = screen.getByRole('button', { name: /accepter akthar/i })
    await user.click(acceptBtn)

    expect(mockAcceptSuggestion).toHaveBeenCalledWith('character', 'Akthar')
  })

  it('clic "Ignorer" sur une suggestion → ignoreSuggestion appelé', async () => {
    const user = userEvent.setup()
    render(<ContextSuggestionsPanel />)

    const ignoreBtn = screen.getByRole('button', { name: /ignorer akthar/i })
    await user.click(ignoreBtn)

    expect(mockIgnoreSuggestion).toHaveBeenCalledWith('character', 'Akthar')
  })

  it('clic "Accepter tout" pour un groupe → acceptAllSuggestionsByType appelé', async () => {
    const user = userEvent.setup()
    render(<ContextSuggestionsPanel />)

    const acceptAllBtn = screen.getByRole('button', { name: /accepter tout personnages/i })
    await user.click(acceptAllBtn)

    expect(mockAcceptAllByType).toHaveBeenCalledWith('character')
  })

  it('clic "Ignorer tout" pour un groupe → ignoreAllSuggestionsByType appelé', async () => {
    const user = userEvent.setup()
    render(<ContextSuggestionsPanel />)

    const ignoreAllBtn = screen.getByRole('button', { name: /ignorer tout personnages/i })
    await user.click(ignoreAllBtn)

    expect(mockIgnoreAllByType).toHaveBeenCalledWith('character')
  })
})
