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
  })
})
