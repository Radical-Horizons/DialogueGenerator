/**
 * Tests unitaires pour PromptViewerModal (Story 1.14).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PromptViewerModal } from './PromptViewerModal'

const defaultData = {
  raw_prompt: 'Contexte précédent:\nPNJ: Bonjour.\n\nInstructions pour la suite:\nEcris...',
  prompt_tokens: 100,
  completion_tokens: 50,
  timestamp: '2026-03-06T12:00:00Z',
  is_historical: false,
  message: 'Prompt reconstruit (contexte actuel)',
}

describe('PromptViewerModal', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    mockOnClose.mockClear()
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it('renders nothing when isOpen is false', () => {
    render(
      <PromptViewerModal
        isOpen={false}
        data={defaultData}
        error={null}
        onClose={mockOnClose}
      />
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders modal with title and prompt content when open', () => {
    render(
      <PromptViewerModal
        isOpen
        data={defaultData}
        error={null}
        onClose={mockOnClose}
      />
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Prompt envoyé au LLM')).toBeInTheDocument()
    // Prompt affiché en sections ou en un seul bloc ; au moins un pre contient le texte
    const pres = document.querySelectorAll('pre')
    const allPreText = Array.from(pres).map((p) => p.textContent ?? '').join(' ')
    expect(allPreText).toContain('PNJ: Bonjour.')
  })

  it('displays message when data.message is set', () => {
    render(
      <PromptViewerModal
        isOpen
        data={defaultData}
        error={null}
        onClose={mockOnClose}
      />
    )
    expect(screen.getByText('Prompt reconstruit (contexte actuel)')).toBeInTheDocument()
  })

  it('displays tokens line when prompt_tokens and completion_tokens are present', () => {
    render(
      <PromptViewerModal
        isOpen
        data={defaultData}
        error={null}
        onClose={mockOnClose}
      />
    )
    expect(screen.getByText(/Tokens : prompt 100/)).toBeInTheDocument()
    expect(screen.getByText(/completion 50/)).toBeInTheDocument()
    expect(screen.getByText(/total 150/)).toBeInTheDocument()
  })

  it('shows Copier button and copies to clipboard on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(
      <PromptViewerModal
        isOpen
        data={defaultData}
        error={null}
        onClose={mockOnClose}
      />
    )
    const copyBtn = screen.getByText('Copier')
    expect(copyBtn).toBeInTheDocument()
    fireEvent.click(copyBtn)
    expect(writeText).toHaveBeenCalledWith(defaultData.raw_prompt)
    expect(await screen.findByText('Copié')).toBeInTheDocument()
  })

  it('displays error when error prop is set', () => {
    render(
      <PromptViewerModal
        isOpen
        data={null}
        error="Dialogue introuvable"
        onClose={mockOnClose}
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Dialogue introuvable')
  })

  it('displays loading state', () => {
    render(
      <PromptViewerModal
        isOpen
        data={null}
        error={null}
        isLoading
        onClose={mockOnClose}
      />
    )
    expect(screen.getByText('Chargement…')).toBeInTheDocument()
  })

  it('calls onClose when Fermer is clicked', () => {
    render(
      <PromptViewerModal
        isOpen
        data={defaultData}
        error={null}
        onClose={mockOnClose}
      />
    )
    fireEvent.click(screen.getByText('Fermer'))
    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('displays prompt in labeled sections when section headers are present', () => {
    const dataWithSections = {
      ...defaultData,
      raw_prompt:
        'Contexte précédent:\nPNJ: Bonjour.\n\nRéponse du joueur:\nAccepter.\n\nInstructions pour la suite:\nEcris la suite.',
    }
    render(
      <PromptViewerModal
        isOpen
        data={dataWithSections}
        error={null}
        onClose={mockOnClose}
      />
    )
    expect(screen.getByText('Contexte précédent')).toBeInTheDocument()
    expect(screen.getByText('Réponse du joueur')).toBeInTheDocument()
    expect(screen.getByText('Instructions pour la suite')).toBeInTheDocument()
    expect(screen.getByText(/PNJ: Bonjour\./)).toBeInTheDocument()
    expect(screen.getByText(/Accepter\./)).toBeInTheDocument()
  })
})
