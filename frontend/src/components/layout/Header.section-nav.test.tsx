/**
 * Écran 1c : la navigation applicative vit dans la barre supérieure, à côté du
 * logo — plus au-dessus de la colonne de lecture. Cette suite couvre ce que
 * `Dashboard.test.tsx` ne peut plus vérifier depuis qu'elle a changé de maison :
 * les trois sections sont atteignables, et un clic change bien de section.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { Header } from './Header'
import { useUiLayoutStore } from '../../store/uiLayoutStore'
import { useAuthStore } from '../../store/authStore'

vi.mock('../../store/authStore')
vi.mock('../generation/GenerationOptionsModal', () => ({
  GenerationOptionsModal: () => null,
}))
vi.mock('../auth/ChangePasswordModal', () => ({
  ChangePasswordModal: () => null,
}))

const mockUseAuthStore = vi.mocked(useAuthStore)

function renderHeader() {
  return render(
    <BrowserRouter>
      <Header />
    </BrowserRouter>
  )
}

describe('Header — navigation de sections (écran 1c)', () => {
  beforeEach(() => {
    useUiLayoutStore.getState().setCenterPanelTab('generation')
    useUiLayoutStore.getState().setWritingMode(false)
    mockUseAuthStore.mockReturnValue({
      user: { id: 1, username: 'admin', role: 'admin', email: null },
      isAuthenticated: true,
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuthStore>)
  })

  it('expose les trois sections dans la barre supérieure', () => {
    renderHeader()

    expect(screen.getByTestId('header-section-generation')).toHaveTextContent('Générer')
    expect(screen.getByTestId('header-section-edition')).toHaveTextContent('Éditer')
    expect(screen.getByTestId('header-section-graph')).toHaveTextContent('Graphe')
  })

  it('marque la section active et la change au clic', async () => {
    const user = userEvent.setup()
    renderHeader()

    expect(screen.getByTestId('header-section-generation')).toHaveAttribute('aria-current', 'page')

    await user.click(screen.getByTestId('header-section-graph'))

    expect(useUiLayoutStore.getState().centerPanelTab).toBe('graph')
    expect(screen.getByTestId('header-section-graph')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('header-section-generation')).not.toHaveAttribute('aria-current')
  })

  it('2c : la navigation s’efface en mode écriture', () => {
    useUiLayoutStore.getState().setWritingMode(true)
    renderHeader()

    expect(screen.queryByTestId('header-section-nav')).toBeNull()
  })
})
