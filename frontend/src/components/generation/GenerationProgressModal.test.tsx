import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  GenerationProgressModal,
  type GenerationProgressModalProps,
} from './GenerationProgressModal'

function createDefaultProps(overrides: Partial<GenerationProgressModalProps> = {}): GenerationProgressModalProps {
  return {
    isOpen: true,
    content: '',
    currentStep: 'Generating',
    error: null,
    isInterrupting: false,
    isMinimized: false,
    onInterrupt: vi.fn(),
    onMinimize: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
}

describe('GenerationProgressModal', () => {
  const mockOnInterrupt = vi.fn()
  const mockOnMinimize = vi.fn()
  const mockOnClose = vi.fn()

  beforeEach(() => {
    mockOnInterrupt.mockClear()
    mockOnMinimize.mockClear()
    mockOnClose.mockClear()
  })

  it('neutralizes dangerous inline HTML while preserving markdown rendering', () => {
    const streamedContent = JSON.stringify({
      title: 'Titre',
      node: {
        speaker: 'NPC',
        line: 'Bonjour <img src=x onerror="alert(1)"> <script>alert("xss")</script>\\n**sécurisé** _italique_',
        choices: [],
      },
    })

    render(<GenerationProgressModal {...createDefaultProps({ content: streamedContent })} />)

    const lineElement = screen.getByTestId('streaming-line')

    expect(lineElement.innerHTML).not.toContain('<img')
    expect(lineElement.innerHTML).not.toContain('<script>')
    expect(lineElement.innerHTML).toContain('&lt;img src=x onerror="alert(1)"&gt;')
    expect(lineElement.innerHTML).toContain('&lt;script&gt;alert("xss")&lt;/script&gt;')
    expect(lineElement.innerHTML).toContain('<strong>sécurisé</strong>')
    expect(lineElement.innerHTML).toContain('<em>italique</em>')
    expect(lineElement.innerHTML).toContain('<br')
  })

  it('should render modal when isOpen is true', () => {
    render(
      <GenerationProgressModal
        {...createDefaultProps({
          isOpen: true,
          content: 'Test content streaming',
          onInterrupt: mockOnInterrupt,
          onMinimize: mockOnMinimize,
          onClose: mockOnClose,
        })}
      />
    )
    expect(screen.getByText('Génération en cours...')).toBeInTheDocument()
    expect(screen.getByText('Test content streaming')).toBeInTheDocument()
  })

  it('should not render modal when isOpen is false', () => {
    render(
      <GenerationProgressModal
        {...createDefaultProps({
          isOpen: false,
          content: 'Test content',
          onInterrupt: mockOnInterrupt,
          onMinimize: mockOnMinimize,
          onClose: mockOnClose,
        })}
      />
    )
    expect(screen.queryByText('Génération en cours...')).not.toBeInTheDocument()
  })

  it('should call onInterrupt when interrupt button is clicked', () => {
    render(
      <GenerationProgressModal
        {...createDefaultProps({
          onInterrupt: mockOnInterrupt,
          onMinimize: mockOnMinimize,
          onClose: mockOnClose,
        })}
      />
    )
    const interruptButton = screen.getByText('Interrompre')
    fireEvent.click(interruptButton)
    expect(mockOnInterrupt).toHaveBeenCalledTimes(1)
  })

  it('should call onMinimize when minimize button is clicked', () => {
    render(
      <GenerationProgressModal
        {...createDefaultProps({
          onInterrupt: mockOnInterrupt,
          onMinimize: mockOnMinimize,
          onClose: mockOnClose,
        })}
      />
    )
    const minimizeButton = screen.getByLabelText('Réduire')
    fireEvent.click(minimizeButton)
    expect(mockOnMinimize).toHaveBeenCalledTimes(1)
  })

  it('should display progress bar with current step', () => {
    render(
      <GenerationProgressModal
        {...createDefaultProps({
          content: 'Test content',
          currentStep: 'Validating',
          onInterrupt: mockOnInterrupt,
          onMinimize: mockOnMinimize,
          onClose: mockOnClose,
        })}
      />
    )
    expect(screen.getByText(/Validating/i)).toBeInTheDocument()
  })

  it('should display minimized badge when isMinimized is true', () => {
    render(
      <GenerationProgressModal
        {...createDefaultProps({
          isMinimized: true,
          onInterrupt: mockOnInterrupt,
          onMinimize: mockOnMinimize,
          onClose: mockOnClose,
        })}
      />
    )
    expect(screen.getByText(/Generating/i)).toBeInTheDocument()
  })

  it('should display complete state when currentStep is Complete', () => {
    render(
      <GenerationProgressModal
        {...createDefaultProps({
          content: 'Final content',
          currentStep: 'Complete',
          onInterrupt: mockOnInterrupt,
          onMinimize: mockOnMinimize,
          onClose: mockOnClose,
        })}
      />
    )
    expect(screen.getByText('Génération terminée')).toBeInTheDocument()
    expect(screen.getByText('Fermer')).toBeInTheDocument()
  })

  it('should call onClose when close button is clicked in complete state', () => {
    render(
      <GenerationProgressModal
        {...createDefaultProps({
          content: 'Final content',
          currentStep: 'Complete',
          onInterrupt: mockOnInterrupt,
          onMinimize: mockOnMinimize,
          onClose: mockOnClose,
        })}
      />
    )
    const closeButton = screen.getByText('Fermer')
    fireEvent.click(closeButton)
    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('should display error state when error is provided', () => {
    render(
      <GenerationProgressModal
        {...createDefaultProps({
          content: 'Test content',
          error: 'Test error message',
          onInterrupt: mockOnInterrupt,
          onMinimize: mockOnMinimize,
          onClose: mockOnClose,
        })}
      />
    )
    expect(screen.getByText('Test error message')).toBeInTheDocument()
  })
})
