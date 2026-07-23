import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { Header } from './Header'
import { useAuthStore } from '../../store/authStore'

vi.mock('../../store/authStore', () => ({ useAuthStore: vi.fn() }))
vi.mock('../../hooks/useCommandPalette', () => ({
  useCommandPalette: () => ({ open: vi.fn() }),
}))
vi.mock('../../store/generationActionsStore', () => ({
  useGenerationActionsStore: () => ({ actions: {} }),
}))
vi.mock('../../store/graphStore', () => ({
  useGraphStore: () => ({ isGenerating: false }),
}))
vi.mock('../../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
}))
vi.mock('../../store/unityBatchExportMenuStore', () => ({
  useUnityBatchExportMenuStore: () => null,
}))
vi.mock('../generation/GenerationOptionsModal', () => ({
  GenerationOptionsModal: () => null,
}))
vi.mock('../auth/ChangePasswordModal', () => ({
  ChangePasswordModal: () => null,
}))

const mockedUseAuthStore = vi.mocked(useAuthStore)

describe('Header admin navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('affiche la gestion utilisateurs uniquement pour un admin', async () => {
    const interaction = userEvent.setup()
    mockedUseAuthStore.mockReturnValue({
      user: {
        id: 'admin-id',
        username: 'admin',
        role: 'admin',
        is_active: true,
      },
      isAuthenticated: true,
      logout: vi.fn(),
    } as ReturnType<typeof useAuthStore>)
    const { rerender } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    )

    await interaction.click(screen.getByRole('button', { name: 'Menu utilisateur admin' }))
    expect(screen.getByRole('button', { name: 'Gérer les utilisateurs' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Modèles LLM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Changer mon mot de passe' })).toBeInTheDocument()
    await interaction.click(screen.getByRole('button', { name: 'Menu utilisateur admin' }))

    mockedUseAuthStore.mockReturnValue({
      user: {
        id: 'writer-id',
        username: 'writer',
        role: 'writer',
        is_active: true,
      },
      isAuthenticated: true,
      logout: vi.fn(),
    } as ReturnType<typeof useAuthStore>)
    rerender(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    )
    const writerMenuButton = screen.getByRole('button', { name: 'Menu utilisateur writer' })
    await interaction.click(writerMenuButton)
    expect(writerMenuButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Connecté en tant que')).toBeInTheDocument()
    expect(screen.getByText('writer')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gérer les utilisateurs' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Changer mon mot de passe' })).toBeInTheDocument()
  })

  it('affiche Connexion pour un invité', () => {
    mockedUseAuthStore.mockReturnValue({
      user: {
        id: 'guest-id',
        username: 'guest',
        role: 'guest',
        is_active: true,
      },
      isAuthenticated: true,
      logout: vi.fn(),
    } as ReturnType<typeof useAuthStore>)
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('header-login-button')).toHaveTextContent('Connexion')
    expect(screen.getByTestId('guest-mode-banner')).toBeInTheDocument()
    expect(screen.queryByText('Non connecté')).not.toBeInTheDocument()
  })

  it('lie le titre DialogueGenerator vers la page d’accueil', () => {
    mockedUseAuthStore.mockReturnValue({
      user: null,
      isAuthenticated: false,
      logout: vi.fn(),
    } as ReturnType<typeof useAuthStore>)
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    )

    const homeLink = screen.getByTestId('header-home-link')
    expect(homeLink).toHaveAttribute('href', '/')
    expect(homeLink).toHaveTextContent('DialogueGenerator')
  })
})
