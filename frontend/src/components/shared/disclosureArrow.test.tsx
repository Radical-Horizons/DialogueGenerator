/**
 * Garde-fou de taille des flèches de dépliage.
 *
 * Chaque appelant avait improvisé sa valeur entre 7,5 et 11 px — et les glyphes
 * *small* `▴ ▾ ▸` ne posent que ~3 px d'encre à cette taille, d'où des flèches
 * illisibles (« Réglages du modèle », « Outils du contexte », sections de prompt).
 * Ces tests échouent si un composant réintroduit une taille en dur.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { StyledSelect, SELECT_ARROW_FONT_SIZE } from './StyledSelect'
import { PromptBudgetBottomDrawer } from '../layout/PromptBudgetBottomDrawer'
import { Header } from '../layout/Header'
import { redesignDisclosureArrow } from '../../theme/redesignTokens'
import { useUnityBatchExportMenuStore } from '../../store/unityBatchExportMenuStore'
import { useGenerationActionsStore } from '../../store/generationActionsStore'
import { useAuthStore } from '../../store/authStore'

vi.mock('../../store/authStore')
vi.mock('../generation/GenerationOptionsModal', () => ({
  GenerationOptionsModal: () => null,
}))
vi.mock('../auth/ChangePasswordModal', () => ({
  ChangePasswordModal: () => null,
}))

const mockUseAuthStore = vi.mocked(useAuthStore)

/** Le seul glyphe descendant du conteneur, quelle que soit la profondeur. */
function arrowSpan(root: HTMLElement): HTMLElement {
  const found = [...root.querySelectorAll('span')].find((s) =>
    ['▴', '▾', '▸', '▲', '▼', '▶'].includes(s.textContent?.trim() ?? '')
  )
  expect(found, 'aucune flèche trouvée dans le conteneur').toBeTruthy()
  return found as HTMLElement
}

describe('Flèches de dépliage — taille lisible (token partagé)', () => {
  it('les deux tailles du token restent au-dessus du seuil illisible', () => {
    expect(parseFloat(redesignDisclosureArrow.solid)).toBeGreaterThanOrEqual(14)
    // Les glyphes *small* ▴▾▸ ont besoin d'être plus gros que les pleins à encre égale.
    expect(parseFloat(redesignDisclosureArrow.small)).toBeGreaterThan(
      parseFloat(redesignDisclosureArrow.solid)
    )
  })

  it('StyledSelect dimensionne son ▼ sur le token', () => {
    expect(SELECT_ARROW_FONT_SIZE).toBe(redesignDisclosureArrow.solid)

    const { container } = render(
      <StyledSelect aria-label="tri">
        <option value="a">A</option>
      </StyledSelect>
    )

    expect(arrowSpan(container).style.fontSize).toBe(redesignDisclosureArrow.solid)
  })

  it('StyledSelect réserve une gouttière plus large que la flèche', () => {
    const { container } = render(
      <StyledSelect aria-label="tri">
        <option value="a">A</option>
      </StyledSelect>
    )

    const select = container.querySelector('select') as HTMLSelectElement
    // Un ▼ de 16px pose ~14px d'encre : sans gouttière suffisante il se poserait
    // sur le texte de l'option (déjà vu sur le tri « RÉCENTS »).
    const gutterRem = parseFloat(select.style.paddingRight)
    expect(gutterRem * 14).toBeGreaterThan(parseFloat(redesignDisclosureArrow.solid))
  })

  it('PromptBudgetBottomDrawer dimensionne son ▴/▾ sur le token *small*', () => {
    render(<PromptBudgetBottomDrawer totalTokens={12000}>détail</PromptBudgetBottomDrawer>)

    const toggle = screen.getByTestId('prompt-budget-drawer-toggle')
    expect(arrowSpan(toggle).style.fontSize).toBe(redesignDisclosureArrow.small)
  })

  describe('Header — menu Actions', () => {
    beforeEach(() => {
      mockUseAuthStore.mockReturnValue({
        user: { id: 1, username: 'admin', role: 'admin', email: null },
        isAuthenticated: true,
        logout: vi.fn(),
      } as unknown as ReturnType<typeof useAuthStore>)

      // La barre d'actions ne se monte que pour un utilisateur non-invité
      // dont le panneau de génération a publié ses actions.
      useGenerationActionsStore.getState().setActions({
        handleGenerate: vi.fn(),
        handlePreview: vi.fn(),
        handleExportUnity: vi.fn(),
        handleReset: vi.fn(),
        estimateTokens: vi.fn(),
        isLoading: false,
        isDirty: false,
        saveStatus: 'saved',
        draftLastSavedAt: null,
      })

      useUnityBatchExportMenuStore.getState().registerMenu({
        filteredCount: 3,
        checkedCount: 1,
        isBatchExporting: false,
        batchProgressLabel: null,
        allSelected: false,
        showBatchOptionsPanel: false,
        showDownloadOptionsPanel: false,
        actions: {
          onToggleSelectAll: vi.fn(),
          onStartExport: vi.fn(),
          onStartPreview: vi.fn(),
          onCancelExport: vi.fn(),
          onToggleBatchOptions: vi.fn(),
          onOpenExportLogs: vi.fn(),
          onToggleDownloadOptions: vi.fn(),
        },
      })
    })

    afterEach(() => {
      useUnityBatchExportMenuStore.getState().unregisterMenu()
    })

    it('dimensionne son ▼ sur le token', () => {
      render(
        <BrowserRouter>
          <Header />
        </BrowserRouter>
      )

      const trigger = screen.getByTestId('header-actions-dropdown')
      expect(arrowSpan(trigger).style.fontSize).toBe(redesignDisclosureArrow.solid)
    })
  })
})
