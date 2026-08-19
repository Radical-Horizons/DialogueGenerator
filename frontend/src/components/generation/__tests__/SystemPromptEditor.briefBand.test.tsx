/**
 * Régressions du bandeau de brief relevées en revue UI (août 2026).
 *
 * Trois symptômes rapportés par l'utilisateur, un même bandeau :
 *  - le lien « templates » n'ouvrait pas le panneau templates (Epic 6) mais les
 *    briefs enregistrés — deux objets portaient le même mot ;
 *  - entrer en mode écriture depuis un onglet secondaire enfermait l'utilisateur,
 *    le bandeau qui porte le seul lien de retour étant masqué par `!writingMode`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SystemPromptEditor } from '../SystemPromptEditor'
import { useUiLayoutStore } from '../../../store/uiLayoutStore'

vi.mock('../../../api/config', () => ({
  getSceneInstructionTemplates: vi.fn().mockResolvedValue({ templates: [] }),
  getAuthorProfileTemplates: vi.fn().mockResolvedValue({ templates: [] }),
}))

vi.mock('../../../hooks/useSystemPrompt', () => ({
  useSystemPrompt: () => ({
    systemPrompt: 'prompt système de test',
    isLoading: false,
    savePrompt: vi.fn(),
    restore: vi.fn(),
    updatePrompt: vi.fn(),
  }),
}))

vi.mock('../../../hooks/useAuthorProfile', () => ({
  useAuthorProfile: () => ({
    authorProfile: '',
    saveProfile: vi.fn(),
    restore: vi.fn(),
    updateProfile: vi.fn(),
  }),
}))

const BRIEF_PLACEHOLDER = /^Ex: Bob doit annoncer/

function renderEditor(overrides: Record<string, unknown> = {}) {
  const onToggleTemplatesPanel = vi.fn()
  const props = {
    userInstructions: '',
    authorProfile: '',
    gameRules: '',
    systemPromptOverride: null,
    onUserInstructionsChange: vi.fn(),
    onAuthorProfileChange: vi.fn(),
    onGameRulesChange: vi.fn(),
    onSystemPromptChange: vi.fn(),
    templatesPanelOpen: false,
    onToggleTemplatesPanel,
    ...overrides,
  }
  render(<SystemPromptEditor {...props} />)
  return { onToggleTemplatesPanel }
}

describe('SystemPromptEditor — bandeau de brief', () => {
  beforeEach(() => {
    useUiLayoutStore.setState({ writingMode: false })
  })

  it('le lien « templates » délègue au parent et n’ouvre pas les briefs enregistrés', async () => {
    const user = userEvent.setup()
    const { onToggleTemplatesPanel } = renderEditor()

    await user.click(screen.getByTestId('brief-link-templates'))

    expect(onToggleTemplatesPanel).toHaveBeenCalledTimes(1)
    // `toBeVisible` est inutilisable ici : jest-dom déclare invisible tout
    // `<details>` sans `open`, donc l'assertion passerait quel que soit le
    // `display`. C'est ce dernier que la bascule pilote — on l'assertit.
    expect(screen.getByTestId('brief-saved-briefs')).toHaveStyle({ display: 'none' })
  })

  it('le lien « briefs » ouvre les briefs enregistrés sans toucher au panneau templates', async () => {
    const user = userEvent.setup()
    const { onToggleTemplatesPanel } = renderEditor()

    const savedBriefs = screen.getByTestId('brief-saved-briefs')
    expect(savedBriefs).toHaveStyle({ display: 'none' })

    await user.click(screen.getByTestId('brief-link-briefs'))

    expect(savedBriefs).toHaveStyle({ display: 'block' })
    expect(onToggleTemplatesPanel).not.toHaveBeenCalled()
  })

  it('sans callback templates, le lien n’est pas rendu', () => {
    renderEditor({ onToggleTemplatesPanel: undefined })
    expect(screen.queryByTestId('brief-link-templates')).not.toBeInTheDocument()
  })

  it('un onglet secondaire remplace le brief, et le lien de retour le ramène', async () => {
    const user = userEvent.setup()
    renderEditor()

    expect(screen.getByPlaceholderText(BRIEF_PLACEHOLDER)).toBeInTheDocument()

    await user.click(screen.getByTestId('brief-link-system-prompt'))
    expect(screen.queryByPlaceholderText(BRIEF_PLACEHOLDER)).not.toBeInTheDocument()

    await user.click(screen.getByTestId('brief-link-back'))
    expect(screen.getByPlaceholderText(BRIEF_PLACEHOLDER)).toBeInTheDocument()
  })

  it('entrer en mode écriture depuis un onglet secondaire ramène au brief', async () => {
    const user = userEvent.setup()
    renderEditor()

    await user.click(screen.getByTestId('brief-link-system-prompt'))
    expect(screen.queryByPlaceholderText(BRIEF_PLACEHOLDER)).not.toBeInTheDocument()

    useUiLayoutStore.setState({ writingMode: true })

    // Le bandeau — donc le lien de retour — disparaît en mode écriture : sans
    // remise au brief, l'utilisateur restait bloqué sur le prompt système.
    await waitFor(() => {
      expect(screen.queryByTestId('brief-section-header')).not.toBeInTheDocument()
      expect(screen.getByPlaceholderText(BRIEF_PLACEHOLDER)).toBeInTheDocument()
    })
  })
})
