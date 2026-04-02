/**
 * Tests unitaires pour GenerationProgressModal
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GenerationProgressModal } from '../../frontend/src/components/generation/GenerationProgressModal'

describe('GenerationProgressModal', () => {
  const mockOnInterrupt = vi.fn()
  const mockOnMinimize = vi.fn()
  const mockOnClose = vi.fn()

  beforeEach(() => {
    mockOnInterrupt.mockClear()
    mockOnMinimize.mockClear()
    mockOnClose.mockClear()
  })

  it('should render modal when isOpen is true', () => {
    render(
      <GenerationProgressModal
        isOpen={true}
        content="Test content streaming"
        currentStep="Generating"
        onInterrupt={mockOnInterrupt}
        onMinimize={mockOnMinimize}
        onClose={mockOnClose}
      />
    )

    expect(screen.getByText('Génération en cours...')).toBeInTheDocument()
    expect(screen.getByText('Test content streaming')).toBeInTheDocument()
  })

  it('should not render modal when isOpen is false', () => {
    render(
      <GenerationProgressModal
        isOpen={false}
        content="Test content"
        currentStep="Generating"
        onInterrupt={mockOnInterrupt}
        onMinimize={mockOnMinimize}
        onClose={mockOnClose}
      />
    )

    expect(screen.queryByText('Génération en cours...')).not.toBeInTheDocument()
  })

  it('should call onInterrupt when interrupt button is clicked', () => {
    render(
      <GenerationProgressModal
        isOpen={true}
        content="Test content"
        currentStep="Generating"
        onInterrupt={mockOnInterrupt}
        onMinimize={mockOnMinimize}
        onClose={mockOnClose}
      />
    )

    const interruptButton = screen.getByText('Interrompre')
    fireEvent.click(interruptButton)

    expect(mockOnInterrupt).toHaveBeenCalledTimes(1)
  })

  it('should call onMinimize when minimize button is clicked', () => {
    render(
      <GenerationProgressModal
        isOpen={true}
        content="Test content"
        currentStep="Generating"
        onInterrupt={mockOnInterrupt}
        onMinimize={mockOnMinimize}
        onClose={mockOnClose}
      />
    )

    const minimizeButton = screen.getByLabelText('Réduire')
    fireEvent.click(minimizeButton)

    expect(mockOnMinimize).toHaveBeenCalledTimes(1)
  })

  it('should display progress bar with current step', () => {
    render(
      <GenerationProgressModal
        isOpen={true}
        content="Test content"
        currentStep="Validating"
        onInterrupt={mockOnInterrupt}
        onMinimize={mockOnMinimize}
        onClose={mockOnClose}
      />
    )

    expect(screen.getByText(/Validating/i)).toBeInTheDocument()
  })

  it('should display minimized badge when isMinimized is true', () => {
    render(
      <GenerationProgressModal
        isOpen={true}
        content="Test content"
        currentStep="Generating"
        isMinimized={true}
        onInterrupt={mockOnInterrupt}
        onMinimize={mockOnMinimize}
        onClose={mockOnClose}
      />
    )

    // Badge minimisé affiche la progression de manière compacte
    expect(screen.getByText(/Generating/i)).toBeInTheDocument()
  })

  it('should display complete state when currentStep is Complete', () => {
    render(
      <GenerationProgressModal
        isOpen={true}
        content="Final content"
        currentStep="Complete"
        onInterrupt={mockOnInterrupt}
        onMinimize={mockOnMinimize}
        onClose={mockOnClose}
      />
    )

    expect(screen.getByText('Génération terminée')).toBeInTheDocument()
    expect(screen.getByText('Fermer')).toBeInTheDocument()
  })

  it('should call onClose when close button is clicked in complete state', () => {
    render(
      <GenerationProgressModal
        isOpen={true}
        content="Final content"
        currentStep="Complete"
        onInterrupt={mockOnInterrupt}
        onMinimize={mockOnMinimize}
        onClose={mockOnClose}
      />
    )

    const closeButton = screen.getByText('Fermer')
    fireEvent.click(closeButton)

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('should display error state when error is provided', () => {
    render(
      <GenerationProgressModal
        isOpen={true}
        content="Test content"
        currentStep="Generating"
        error="Test error message"
        onInterrupt={mockOnInterrupt}
        onMinimize={mockOnMinimize}
        onClose={mockOnClose}
      />
    )

    expect(screen.getByText('Test error message')).toBeInTheDocument()
  })

  it('should render streamed markdown safely without injecting HTML', () => {
    const maliciousLine = 'Bonjour <img src=x onerror="alert(1)"> **important** *note*'
    const content = JSON.stringify({
      title: 'Titre',
      node: {
        speaker: 'PNJ',
        line: maliciousLine,
      },
    })

    const { container } = render(
      <GenerationProgressModal
        isOpen={true}
        content={content}
        currentStep="Generating"
        onInterrupt={mockOnInterrupt}
        onMinimize={mockOnMinimize}
        onClose={mockOnClose}
      />
    )

    expect(container.querySelector('img')).not.toBeInTheDocument()
    expect(container.querySelector('script')).not.toBeInTheDocument()
    expect(screen.getByText('important', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByText('note', { selector: 'em' })).toBeInTheDocument()
    expect(screen.getByText(/<img src=x onerror="alert\(1\)">/)).toBeInTheDocument()
  })
})
