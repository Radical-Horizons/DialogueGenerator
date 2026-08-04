import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  GenerationStreamingInline,
  type GenerationStreamingInlineProps,
} from './GenerationStreamingInline'

function createDefaultProps(overrides: Partial<GenerationStreamingInlineProps> = {}): GenerationStreamingInlineProps {
  return {
    isActive: true,
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

describe('GenerationStreamingInline', () => {
  const mockOnInterrupt = vi.fn()
  const mockOnMinimize = vi.fn()
  const mockOnClose = vi.fn()

  beforeEach(() => {
    mockOnInterrupt.mockClear()
    mockOnMinimize.mockClear()
    mockOnClose.mockClear()
  })

  it('ÉCHAP interrompt la génération en cours (écran 2a)', () => {
    render(
      <GenerationStreamingInline
        {...createDefaultProps({ onInterrupt: mockOnInterrupt })}
      />
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(mockOnInterrupt).toHaveBeenCalledTimes(1)
  })

  it('ÉCHAP est inerte une fois la génération terminée', () => {
    render(
      <GenerationStreamingInline
        {...createDefaultProps({ currentStep: 'Complete', onInterrupt: mockOnInterrupt })}
      />
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(mockOnInterrupt).not.toHaveBeenCalled()
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

    render(<GenerationStreamingInline {...createDefaultProps({ content: streamedContent })} />)

    const lineElement = screen.getByTestId('streaming-line')

    expect(lineElement.innerHTML).not.toContain('<img')
    expect(lineElement.innerHTML).not.toContain('<script>')
    expect(lineElement.innerHTML).toContain('&lt;img src=x onerror="alert(1)"&gt;')
    expect(lineElement.innerHTML).toContain('&lt;script&gt;alert("xss")&lt;/script&gt;')
    expect(lineElement.innerHTML).toContain('<strong>sécurisé</strong>')
    expect(lineElement.innerHTML).toContain('<em>italique</em>')
    expect(lineElement.innerHTML).toContain('<br')
  })

  it('should render the inline block when isActive is true', () => {
    render(
      <GenerationStreamingInline
        {...createDefaultProps({
          isActive: true,
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

  it('should not render the inline block when isActive is false', () => {
    render(
      <GenerationStreamingInline
        {...createDefaultProps({
          isActive: false,
          content: 'Test content',
          onInterrupt: mockOnInterrupt,
          onMinimize: mockOnMinimize,
          onClose: mockOnClose,
        })}
      />
    )
    expect(screen.queryByText('Génération en cours...')).not.toBeInTheDocument()
  })

  it('renders in the document flow, without backdrop or fixed positioning', () => {
    render(
      <GenerationStreamingInline
        {...createDefaultProps({
          content: 'Test content streaming',
        })}
      />
    )

    const block = screen.getByTestId('generation-streaming-inline')
    expect(block).toBeInTheDocument()
    expect(block.style.position).not.toBe('fixed')

    // Aucun ancêtre ne doit installer d'overlay plein écran.
    let ancestor: HTMLElement | null = block.parentElement
    while (ancestor && ancestor !== document.body) {
      expect(ancestor.style.position).not.toBe('fixed')
      ancestor = ancestor.parentElement
    }
  })

  it('shows a blinking accent cursor while text is still streaming', () => {
    const { rerender } = render(
      <GenerationStreamingInline {...createDefaultProps({ content: 'Contenu partiel' })} />
    )

    const cursor = screen.getByTestId('streaming-cursor')
    expect(cursor.style.animation).toContain('1s steps(1, end) infinite')
    expect(cursor.style.height).toBe('18px')

    rerender(
      <GenerationStreamingInline
        {...createDefaultProps({ content: 'Contenu partiel', currentStep: 'Complete' })}
      />
    )
    expect(screen.queryByTestId('streaming-cursor')).not.toBeInTheDocument()
  })

  it('should call onInterrupt when interrupt button is clicked', () => {
    render(
      <GenerationStreamingInline
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
      <GenerationStreamingInline
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
      <GenerationStreamingInline
        {...createDefaultProps({
          content: 'Test content',
          currentStep: 'Validating',
          onInterrupt: mockOnInterrupt,
          onMinimize: mockOnMinimize,
          onClose: mockOnClose,
        })}
      />
    )
    // Écran 2a : libellés mono FR — l'étape `Validating` s'affiche `VALIDATION`.
    expect(screen.getByText(/VALIDATION/)).toBeInTheDocument()
  })

  // Matrice I/O, ligne 4 : le mode réduit est repris **tel quel** depuis la modale
  // (badge de coin, bloc déployé masqué). Aucun repli inventé — décision produit en attente.
  it('should display minimized badge when isMinimized is true', () => {
    render(
      <GenerationStreamingInline
        {...createDefaultProps({
          isMinimized: true,
          content: 'Contenu partiel',
          onInterrupt: mockOnInterrupt,
          onMinimize: mockOnMinimize,
          onClose: mockOnClose,
        })}
      />
    )
    expect(screen.getByText(/Generating/i)).toBeInTheDocument()
    expect(screen.queryByTestId('generation-streaming-inline')).not.toBeInTheDocument()

    const badge = screen.getByText(/Generating/i).closest('div')?.parentElement as HTMLElement
    expect(badge.style.position).toBe('fixed')
    fireEvent.click(badge)
    expect(mockOnMinimize).toHaveBeenCalledTimes(1)
  })

  it('should display complete state when currentStep is Complete', () => {
    render(
      <GenerationStreamingInline
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
      <GenerationStreamingInline
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
      <GenerationStreamingInline
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

  // Matrice I/O, ligne 2 : génération en erreur → l'erreur remplace le résultat streamé.
  it('replaces the streamed result with the error message when generation fails', () => {
    render(
      <GenerationStreamingInline
        {...createDefaultProps({
          content: 'Contenu partiel déjà streamé',
          error: 'Erreur LLM: 500',
        })}
      />
    )

    expect(screen.getByText('Erreur LLM: 500')).toBeInTheDocument()
    expect(screen.queryByText('Contenu partiel déjà streamé')).not.toBeInTheDocument()
    expect(screen.queryByTestId('streaming-partial-content')).not.toBeInTheDocument()
    // Le bloc reste monté pour afficher l'erreur.
    expect(screen.getByTestId('generation-streaming-inline')).toBeInTheDocument()
  })

  // Matrice I/O, ligne 1 : interruption pendant le streaming → le texte écrit est conservé.
  it('keeps the already streamed text while interrupting', () => {
    render(
      <GenerationStreamingInline
        {...createDefaultProps({
          content: 'Contenu partiel déjà streamé',
          isInterrupting: true,
        })}
      />
    )

    expect(screen.getByTestId('generation-streaming-inline')).toBeInTheDocument()
    expect(screen.getByTestId('streaming-partial-content')).toHaveTextContent(
      'Contenu partiel déjà streamé'
    )
  })

  // Matrice I/O, ligne 1 (suite) : le message final d'interruption ne jette pas le texte écrit.
  it('keeps the already streamed text once the interruption notice is set', () => {
    render(
      <GenerationStreamingInline
        {...createDefaultProps({
          content: 'Contenu partiel déjà streamé',
          isInterrupting: true,
          error: 'Génération interrompue',
        })}
      />
    )

    expect(screen.getByText('Génération interrompue')).toBeInTheDocument()
    expect(screen.getByTestId('streaming-partial-content')).toHaveTextContent(
      'Contenu partiel déjà streamé'
    )
    expect(screen.getByTestId('generation-streaming-inline')).toBeInTheDocument()
  })
})
