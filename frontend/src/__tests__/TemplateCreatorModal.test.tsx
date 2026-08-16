/**
 * Tests du modal de création de template (4 champs + aperçu lecture seule).
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { TemplateCreatorModal } from '../components/generation/TemplateCreatorModal'
import { useTemplateStore } from '../store/templateStore'
import type { TemplateConfiguration } from '../types/template'

vi.mock('../store/templateStore')

const mockToast = vi.fn()

vi.mock('../components/shared', () => ({
  useToast: () => mockToast,
}))

vi.mock('../theme', () => ({
  theme: {
    background: { primary: '#000', secondary: '#111', panel: '#222' },
    text: { primary: '#fff', secondary: '#ccc' },
    border: { primary: '#444', secondary: '#333' },
    button: {
      default: { background: '#333', color: '#fff' },
      primary: { background: '#007bff', color: '#fff' },
    },
    state: {
      error: { color: '#dc3545' },
      success: { color: '#28a745' },
      info: { color: '#17a2b8' },
      warning: { color: '#ffc107' },
    },
  },
}))

const snapshot: TemplateConfiguration = {
  characters: ['char-alpha'],
  locations: ['loc-alpha'],
  region: 'loc-alpha',
  sceneType: 'Generic',
  instructions: 'Brief figé',
  llmModel: 'gpt-5.6-terra',
  llmProvider: 'openai',
}

describe('TemplateCreatorModal', () => {
  const mockCreateTemplate = vi.fn()
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateTemplate.mockResolvedValue({ warnings: [] })
    ;(useTemplateStore as unknown as Mock).mockImplementation(
      (selector: (state: { createTemplate: typeof mockCreateTemplate }) => unknown) =>
        selector({ createTemplate: mockCreateTemplate })
    )
  })

  it('affiche les 4 champs et l’aperçu lecture seule figé', () => {
    render(
      <TemplateCreatorModal isOpen snapshot={snapshot} onClose={mockOnClose} />
    )

    expect(screen.getByTestId('template-form-name')).toBeInTheDocument()
    expect(screen.getByTestId('template-form-description')).toBeInTheDocument()
    expect(screen.getByTestId('template-form-category')).toBeInTheDocument()
    expect(screen.getByTestId('template-form-icon')).toBeInTheDocument()

    const preview = screen.getByTestId('template-form-preview')
    expect(preview).toHaveTextContent('Brief figé')
    expect(preview).toHaveTextContent('char-alpha')
    expect(preview).toHaveTextContent('gpt-5.6-terra')
    expect(preview).toHaveTextContent('lecture seule')
  })

  it('n’édite pas le snapshot affiché quand on saisit les champs', () => {
    render(
      <TemplateCreatorModal isOpen snapshot={snapshot} onClose={mockOnClose} />
    )

    fireEvent.change(screen.getByTestId('template-form-name'), {
      target: { value: 'Nouveau nom' },
    })

    expect(screen.getByTestId('template-form-preview')).toHaveTextContent('Brief figé')
    expect(screen.getByTestId('template-form-preview')).toHaveTextContent('char-alpha')
  })

  it('envoie les 4 champs et le snapshot figé au store', async () => {
    render(
      <TemplateCreatorModal isOpen snapshot={snapshot} onClose={mockOnClose} />
    )

    fireEvent.change(screen.getByTestId('template-form-name'), {
      target: { value: 'Template combat' },
    })
    fireEvent.change(screen.getByTestId('template-form-description'), {
      target: { value: 'Une description' },
    })
    fireEvent.change(screen.getByTestId('template-form-category'), {
      target: { value: 'Confrontation' },
    })
    fireEvent.change(screen.getByTestId('template-form-icon'), {
      target: { value: '⚔️' },
    })
    fireEvent.click(screen.getByTestId('template-modal-create-btn'))

    await waitFor(() => {
      expect(mockCreateTemplate).toHaveBeenCalledWith({
        name: 'Template combat',
        description: 'Une description',
        category: 'Confrontation',
        icon: '⚔️',
        configuration: snapshot,
      })
    })
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('ignore le clic overlay pendant la création', async () => {
    let resolveCreate: ((value: { warnings: string[] }) => void) | undefined
    mockCreateTemplate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve
        })
    )

    render(
      <TemplateCreatorModal isOpen snapshot={snapshot} onClose={mockOnClose} />
    )

    fireEvent.change(screen.getByTestId('template-form-name'), {
      target: { value: 'En cours' },
    })
    fireEvent.click(screen.getByTestId('template-modal-create-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('template-modal-create-btn')).toHaveTextContent('Sauvegarde')
    })

    fireEvent.click(screen.getByTestId('template-creator-modal'))
    expect(mockOnClose).not.toHaveBeenCalled()

    await act(async () => {
      resolveCreate?.({ warnings: [] })
    })
  })

  it('affiche un toast d’erreur et garde le modal ouvert si create échoue', async () => {
    mockCreateTemplate.mockRejectedValueOnce(new Error('Échec de la création du template : 500'))

    render(
      <TemplateCreatorModal isOpen snapshot={snapshot} onClose={mockOnClose} />
    )

    fireEvent.change(screen.getByTestId('template-form-name'), {
      target: { value: 'Échec' },
    })
    fireEvent.click(screen.getByTestId('template-modal-create-btn'))

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith('Échec de la création du template : 500', 'error')
    })
    expect(mockOnClose).not.toHaveBeenCalled()
    expect(screen.getByTestId('template-creator-modal')).toBeInTheDocument()
  })

  it('affiche un toast warning si la création renvoie des warnings GDD', async () => {
    mockCreateTemplate.mockResolvedValueOnce({
      warnings: ["Character 'char-obsolete' not found in GDD"],
    })

    render(
      <TemplateCreatorModal isOpen snapshot={snapshot} onClose={mockOnClose} />
    )

    fireEvent.change(screen.getByTestId('template-form-name'), {
      target: { value: 'Avec warnings' },
    })
    fireEvent.click(screen.getByTestId('template-modal-create-btn'))

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        "Character 'char-obsolete' not found in GDD",
        'warning',
      )
    })
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('n’envoie qu’un seul POST si on double-clique Créer', async () => {
    let resolveCreate: ((value: { warnings: string[] }) => void) | undefined
    mockCreateTemplate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve
        })
    )

    render(
      <TemplateCreatorModal isOpen snapshot={snapshot} onClose={mockOnClose} />
    )

    fireEvent.change(screen.getByTestId('template-form-name'), {
      target: { value: 'Double clic' },
    })
    fireEvent.click(screen.getByTestId('template-modal-create-btn'))
    fireEvent.click(screen.getByTestId('template-modal-create-btn'))

    expect(mockCreateTemplate).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveCreate?.({ warnings: [] })
    })
  })

  it('ferme le modal sur Escape', () => {
    render(
      <TemplateCreatorModal isOpen snapshot={snapshot} onClose={mockOnClose} />
    )

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('ne rend rien quand le modal est fermé', () => {
    const { container } = render(
      <TemplateCreatorModal isOpen={false} snapshot={snapshot} onClose={mockOnClose} />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
