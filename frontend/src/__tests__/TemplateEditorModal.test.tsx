/**
 * Tests du modal d'édition de template.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { TemplateEditorModal } from '../components/generation/TemplateEditorModal'
import { useTemplateStore } from '../store/templateStore'
import type { Template } from '../types/template'
import * as graphAPI from '../api/graph'

vi.mock('../store/templateStore')

const mockGetContextDroppingRules = vi.fn()

vi.mock('../api/graph', () => ({
  getContextDroppingRules: (...args: unknown[]) => mockGetContextDroppingRules(...args),
  putContextDroppingRules: vi.fn(),
}))

vi.mock('../api/templates', () => ({
  listTemplateVersionsApi: vi.fn().mockResolvedValue([]),
  restoreTemplateVersionApi: vi.fn(),
}))

vi.mock('../components/graph/ContextDroppingRulesEditor', () => ({
  ContextDroppingRulesEditor: () => <div data-testid="context-dropping-rules-form" />,
}))

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
      error: { color: '#dc3545', background: '#3a1a1a', border: '#ff4444' },
      success: { color: '#28a745' },
      info: { color: '#17a2b8' },
      warning: { color: '#ffc107' },
    },
  },
}))

const sampleTemplate: Template = {
  id: 'tpl-001',
  name: 'Template test',
  description: 'Desc',
  category: 'Confrontation',
  icon: '⚔️',
  metadata: { created: '2026-08-16T10:00:00Z', modified: '2026-08-16T11:00:00Z' },
  history: [
    { at: '2026-08-16T10:00:00Z', action: 'created' },
    { at: '2026-08-16T11:00:00Z', action: 'updated' },
  ],
  configuration: {
    characters: ['char-alpha'],
    locations: ['loc-alpha'],
    region: 'loc-alpha',
    sceneType: 'Generic',
    instructions: 'Brief figé',
    llmModel: 'gpt-5.6-terra',
    llmProvider: 'openai',
  },
}

describe('TemplateEditorModal', () => {
  const mockUpdateTemplate = vi.fn()
  const mockOnClose = vi.fn()
  const mockCaptureSnapshot = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateTemplate.mockResolvedValue({ warnings: [] })
    mockGetContextDroppingRules.mockResolvedValue({
      rules_profile: 'strict',
      tolerance: null,
      mandatory_info: [],
      dialogue_type_overrides: {},
      schema_version: '1.0',
    })
    mockCaptureSnapshot.mockReturnValue({
      ...sampleTemplate.configuration,
      instructions: 'Nouveau brief',
      characters: ['char-beta'],
    })
    ;(useTemplateStore as unknown as Mock).mockImplementation(
      (selector: (state: { updateTemplate: typeof mockUpdateTemplate }) => unknown) =>
        selector({ updateTemplate: mockUpdateTemplate })
    )
  })

  it('préremplit les champs et affiche la timeline', () => {
    render(
      <TemplateEditorModal
        isOpen
        template={sampleTemplate}
        captureSnapshot={mockCaptureSnapshot}
        onClose={mockOnClose}
      />
    )

    expect(screen.getByTestId('template-edit-name')).toHaveValue('Template test')
    expect(screen.getByTestId('template-edit-description')).toHaveValue('Desc')
    expect(screen.getByTestId('template-edit-category')).toHaveValue('Confrontation')
    expect(screen.getByTestId('template-edit-icon')).toHaveValue('⚔️')
    expect(screen.getByTestId('template-edit-instructions')).toHaveValue('Brief figé')
    expect(screen.getAllByTestId('template-history-entry')).toHaveLength(2)
    expect(screen.getByTestId('template-editor-history')).toHaveTextContent(/Modifié le/)
  })

  it('envoie le PUT avec le même id', async () => {
    render(
      <TemplateEditorModal
        isOpen
        template={sampleTemplate}
        captureSnapshot={mockCaptureSnapshot}
        onClose={mockOnClose}
      />
    )

    fireEvent.change(screen.getByTestId('template-edit-name'), {
      target: { value: 'Renommé' },
    })
    fireEvent.click(screen.getByTestId('template-editor-save-btn'))

    await waitFor(() => {
      expect(mockUpdateTemplate).toHaveBeenCalledWith(
        'tpl-001',
        expect.objectContaining({
          name: 'Renommé',
          configuration: expect.objectContaining({ instructions: 'Brief figé' }),
        })
      )
    })
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('remplace le snapshot par la config actuelle', async () => {
    render(
      <TemplateEditorModal
        isOpen
        template={sampleTemplate}
        captureSnapshot={mockCaptureSnapshot}
        onClose={mockOnClose}
      />
    )

    fireEvent.click(screen.getByTestId('template-editor-replace-snapshot-btn'))
    expect(screen.getByTestId('template-edit-instructions')).toHaveValue('Nouveau brief')
    expect(screen.getByTestId('template-edit-preview')).toHaveTextContent('char-beta')

    fireEvent.click(screen.getByTestId('template-editor-save-btn'))
    await waitFor(() => {
      expect(mockUpdateTemplate).toHaveBeenCalledWith(
        'tpl-001',
        expect.objectContaining({
          configuration: expect.objectContaining({
            instructions: 'Nouveau brief',
            characters: ['char-beta'],
          }),
        }),
      )
    })
  })

  it('n’envoie qu’un seul PUT si on double-clique Enregistrer', async () => {
    let resolveUpdate: ((value: { warnings: string[] }) => void) | undefined
    mockUpdateTemplate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve
        })
    )

    render(
      <TemplateEditorModal
        isOpen
        template={sampleTemplate}
        captureSnapshot={mockCaptureSnapshot}
        onClose={mockOnClose}
      />
    )

    fireEvent.click(screen.getByTestId('template-editor-save-btn'))
    fireEvent.click(screen.getByTestId('template-editor-save-btn'))
    expect(mockUpdateTemplate).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveUpdate?.({ warnings: [] })
    })
  })

  it('ferme le modal sur Escape', () => {
    render(
      <TemplateEditorModal
        isOpen
        template={sampleTemplate}
        captureSnapshot={mockCaptureSnapshot}
        onClose={mockOnClose}
      />
    )

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('hérite 4.10 et n’ajoute pas la clé tant qu’on ne personnalise pas', async () => {
    render(
      <TemplateEditorModal
        isOpen
        template={sampleTemplate}
        captureSnapshot={mockCaptureSnapshot}
        onClose={mockOnClose}
      />
    )

    expect(screen.getByTestId('template-editor-rules-inherit')).toBeInTheDocument()
    expect(screen.queryByTestId('context-dropping-rules-form')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('template-editor-save-btn'))
    await waitFor(() => {
      expect(mockUpdateTemplate).toHaveBeenCalledWith(
        'tpl-001',
        expect.objectContaining({
          configuration: expect.not.objectContaining({
            contextDroppingRules: expect.anything(),
          }),
        }),
      )
    })
    expect(mockGetContextDroppingRules).not.toHaveBeenCalled()
    expect(graphAPI.putContextDroppingRules).not.toHaveBeenCalled()
  })

  it('Personnaliser charge une copie GET 4.10 sans PUT global', async () => {
    render(
      <TemplateEditorModal
        isOpen
        template={sampleTemplate}
        captureSnapshot={mockCaptureSnapshot}
        onClose={mockOnClose}
      />
    )

    fireEvent.click(screen.getByTestId('template-editor-customize-rules-btn'))
    expect(await screen.findByTestId('context-dropping-rules-form')).toBeInTheDocument()
    expect(mockGetContextDroppingRules).toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('template-editor-save-btn'))
    await waitFor(() => {
      expect(mockUpdateTemplate).toHaveBeenCalledWith(
        'tpl-001',
        expect.objectContaining({
          configuration: expect.objectContaining({
            contextDroppingRules: expect.objectContaining({ rules_profile: 'strict' }),
          }),
        }),
      )
    })
  })
})
