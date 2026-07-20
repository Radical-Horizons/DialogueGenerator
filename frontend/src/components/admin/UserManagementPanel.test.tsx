import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axios from 'axios'

import { UserManagementPanel } from './UserManagementPanel'
import * as usersApi from '../../api/users'

const navigateMock = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

vi.mock('../../api/users')
const authMocks = vi.hoisted(() => ({
  state: {
    user: {
      id: 'admin-id',
      username: 'admin',
      role: 'admin' as 'admin' | 'writer',
      is_active: true,
    } as {
      id: string
      username: string
      role: 'admin' | 'writer'
      is_active: boolean
    } | null,
    fetchCurrentUser: vi.fn().mockResolvedValue(undefined),
  },
}))
vi.mock('../../store/authStore', () => ({
  useAuthStore: () => authMocks.state,
}))

const writer = {
  id: 'writer-id',
  username: 'writer',
  email: 'writer@example.com',
  role: 'writer' as const,
  is_active: true,
  created_at: '2026-07-15T00:00:00Z',
  updated_at: '2026-07-15T00:00:00Z',
}

describe('UserManagementPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    navigateMock.mockReset()
    authMocks.state.user = {
      id: 'admin-id',
      username: 'admin',
      role: 'admin',
      is_active: true,
    }
    authMocks.state.fetchCurrentUser.mockResolvedValue(undefined)
    vi.mocked(usersApi.listUsers).mockResolvedValue([writer])
  })

  it('liste les comptes et crée un writer', async () => {
    const interaction = userEvent.setup()
    vi.mocked(usersApi.createUser).mockResolvedValue({
      ...writer,
      id: 'new-id',
      username: 'new-writer',
      email: 'new@example.com',
    })
    render(<UserManagementPanel />)

    expect(await screen.findByText('writer')).toBeInTheDocument()
    await interaction.type(screen.getByLabelText('Nom d’utilisateur'), 'new-writer')
    await interaction.type(screen.getByLabelText('Email'), 'new@example.com')
    await interaction.type(screen.getByLabelText('Mot de passe initial'), 'strong-pass-123')
    await interaction.click(screen.getByRole('button', { name: 'Créer le compte' }))

    await waitFor(() => {
      expect(usersApi.createUser).toHaveBeenCalledWith({
        username: 'new-writer',
        email: 'new@example.com',
        password: 'strong-pass-123',
      })
    })
    expect(await screen.findByText('new-writer')).toBeInTheDocument()
  })

  it('confirme promotion admin et désactivation avant mutation', async () => {
    const interaction = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(usersApi.updateUser)
      .mockResolvedValueOnce({ ...writer, role: 'admin' })
      .mockResolvedValueOnce({ ...writer, role: 'admin', is_active: false })
    render(<UserManagementPanel />)

    await interaction.selectOptions(
      await screen.findByLabelText('Rôle de writer'),
      'admin',
    )
    await waitFor(() => {
      expect(usersApi.updateUser).toHaveBeenCalledWith('writer-id', { role: 'admin' })
    })
    await interaction.click(screen.getByRole('button', { name: 'Désactiver' }))

    expect(confirmSpy).toHaveBeenCalledTimes(2)
    await waitFor(() => {
      expect(usersApi.updateUser).toHaveBeenLastCalledWith(
        'writer-id',
        { is_active: false },
      )
    })
  })

  it('affiche les états vide et erreur', async () => {
    vi.mocked(usersApi.listUsers).mockResolvedValueOnce([])
    const { rerender } = render(<UserManagementPanel />)
    expect(await screen.findByText('Aucun utilisateur.')).toBeInTheDocument()

    vi.mocked(usersApi.listUsers).mockRejectedValueOnce(new Error('offline'))
    rerender(<UserManagementPanel key="error" />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Une erreur est survenue. Réessayez.',
    )
  })

  it('redirige hors de la page admin sur 403', async () => {
    const forbidden = new axios.AxiosError(
      'Admin role required',
      'ERR_BAD_REQUEST',
      undefined,
      undefined,
      {
        status: 403,
        statusText: 'Forbidden',
        headers: {},
        config: {} as never,
        data: { detail: 'Admin role required' },
      },
    )
    vi.mocked(usersApi.listUsers).mockRejectedValueOnce(forbidden)
    render(<UserManagementPanel />)
    await waitFor(() => {
      expect(authMocks.state.fetchCurrentUser).toHaveBeenCalled()
      expect(navigateMock).toHaveBeenCalledWith('/', { replace: true })
    })
  })

  it('annule promotion et désactivation sans appeler l’API', async () => {
    const interaction = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<UserManagementPanel />)

    const roleSelect = await screen.findByLabelText('Rôle de writer')
    await interaction.selectOptions(roleSelect, 'admin')
    await interaction.click(screen.getByRole('button', { name: 'Désactiver' }))

    expect(confirmSpy).toHaveBeenCalledTimes(2)
    expect(usersApi.updateUser).not.toHaveBeenCalled()
    expect(roleSelect).toHaveValue('writer')
  })

  it('sérialise les mutations d’un compte et désactive ses contrôles', async () => {
    const interaction = userEvent.setup()
    let resolveUpdate: ((value: typeof writer) => void) | undefined
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(usersApi.updateUser).mockImplementation(() => (
      new Promise((resolve) => {
        resolveUpdate = resolve
      })
    ))
    render(<UserManagementPanel />)

    const roleSelect = await screen.findByLabelText('Rôle de writer')
    await interaction.selectOptions(roleSelect, 'admin')

    await waitFor(() => expect(roleSelect).toBeDisabled())
    expect(screen.getByRole('button', { name: 'Désactiver' })).toBeDisabled()
    expect(usersApi.updateUser).toHaveBeenCalledTimes(1)

    resolveUpdate?.({ ...writer, role: 'admin' })
    await waitFor(() => expect(roleSelect).not.toBeDisabled())
    expect(roleSelect).toHaveValue('admin')
  })

  it('préserve le tri username et bloque la création pendant la liste initiale', async () => {
    const interaction = userEvent.setup()
    let resolveList: ((value: (typeof writer)[]) => void) | undefined
    vi.mocked(usersApi.listUsers).mockImplementation(() => (
      new Promise((resolve) => {
        resolveList = resolve
      })
    ))
    vi.mocked(usersApi.createUser).mockResolvedValue({
      ...writer,
      id: 'alpha-id',
      username: 'Alpha',
      email: 'alpha@example.com',
    })
    render(<UserManagementPanel />)

    expect(screen.getByRole('button', { name: 'Créer le compte' })).toBeDisabled()
    resolveList?.([{ ...writer, username: 'Zulu' }])
    await screen.findByText('Zulu')

    await interaction.type(screen.getByLabelText('Nom d’utilisateur'), 'Alpha')
    await interaction.type(screen.getByLabelText('Email'), 'alpha@example.com')
    await interaction.type(screen.getByLabelText('Mot de passe initial'), 'strong-pass-123')
    await interaction.click(screen.getByRole('button', { name: 'Créer le compte' }))

    const list = screen.getByLabelText('Comptes utilisateurs')
    const names = [...list.querySelectorAll('strong')]
    expect(names.map((node) => node.textContent)).toEqual(['Alpha', 'Zulu'])
  })

  it('affiche les détails de validation backend et la limite bcrypt en octets', async () => {
    const interaction = userEvent.setup()
    vi.mocked(usersApi.createUser).mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        data: {
          error: {
            message: 'Erreur de validation des données',
            details: {
              username: 'Username invalide',
              email: 'Email invalide',
              password: 'Mot de passe invalide',
            },
          },
        },
      },
    })
    render(<UserManagementPanel />)
    await screen.findByText('writer')

    await interaction.type(screen.getByLabelText('Nom d’utilisateur'), 'bad')
    await interaction.type(screen.getByLabelText('Email'), 'bad@example.com')
    await interaction.type(screen.getByLabelText('Mot de passe initial'), 'strong-pass-123')
    await interaction.click(screen.getByRole('button', { name: 'Créer le compte' }))

    expect(await screen.findByText('Username invalide')).toBeInTheDocument()
    expect(screen.getByText('Email invalide')).toBeInTheDocument()
    expect(screen.getByText('Mot de passe invalide')).toBeInTheDocument()

    await interaction.clear(screen.getByLabelText('Mot de passe initial'))
    await interaction.type(screen.getByLabelText('Mot de passe initial'), 'é'.repeat(40))
    await interaction.click(screen.getByRole('button', { name: 'Créer le compte' }))
    expect(screen.getByText(/dépasse la limite de 72 octets/)).toBeInTheDocument()
    expect(usersApi.createUser).toHaveBeenCalledTimes(1)
  })

  it('rafraîchit immédiatement l’identité après auto-rétrogradation', async () => {
    const interaction = userEvent.setup()
    authMocks.state.user = {
      id: 'writer-id',
      username: 'admin',
      role: 'admin',
      is_active: true,
    }
    vi.mocked(usersApi.listUsers).mockResolvedValue([
      { ...writer, role: 'admin' },
      {
        ...writer,
        id: 'other-admin',
        username: 'other-admin',
        role: 'admin',
      },
    ])
    authMocks.state.fetchCurrentUser.mockImplementationOnce(async () => {
      authMocks.state.user = {
        id: 'writer-id',
        username: 'admin',
        role: 'writer',
        is_active: true,
      }
    })
    vi.mocked(usersApi.updateUser).mockResolvedValue({ ...writer, role: 'writer' })
    render(<UserManagementPanel />)

    await interaction.selectOptions(
      await screen.findByLabelText('Rôle de writer'),
      'writer',
    )

    await waitFor(() => expect(authMocks.state.fetchCurrentUser).toHaveBeenCalledOnce())
    expect(authMocks.state.user?.role).toBe('writer')
  })

  it('nettoie immédiatement l’identité après auto-désactivation', async () => {
    const interaction = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    authMocks.state.user = {
      id: 'writer-id',
      username: 'admin',
      role: 'admin',
      is_active: true,
    }
    authMocks.state.fetchCurrentUser.mockImplementationOnce(async () => {
      authMocks.state.user = null
      throw new Error('inactive')
    })
    vi.mocked(usersApi.listUsers).mockResolvedValue([
      { ...writer, role: 'admin' },
      {
        ...writer,
        id: 'other-admin',
        username: 'other-admin',
        role: 'admin',
      },
    ])
    vi.mocked(usersApi.updateUser).mockResolvedValue({
      ...writer,
      role: 'admin',
      is_active: false,
    })
    render(<UserManagementPanel />)

    const targetCard = (await screen.findByText('writer')).closest('article')
    expect(targetCard).not.toBeNull()
    await interaction.click(
      within(targetCard as HTMLElement).getByRole('button', { name: 'Désactiver' }),
    )

    await waitFor(() => expect(authMocks.state.fetchCurrentUser).toHaveBeenCalledOnce())
    expect(authMocks.state.user).toBeNull()
  })
})
