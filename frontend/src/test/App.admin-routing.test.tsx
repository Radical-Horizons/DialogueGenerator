import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AdminRoute } from '../App'

const mocks = vi.hoisted(() => ({
  authState: {
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
    isAuthenticated: true,
    isLoading: false,
    initialize: vi.fn().mockResolvedValue(undefined),
    fetchCurrentUser: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../store/authStore', () => ({
  useAuthStore: (selector?: (state: typeof mocks.authState) => unknown) => (
    selector ? selector(mocks.authState) : mocks.authState
  ),
}))

describe('AdminRoute', () => {
  beforeEach(() => {
    mocks.authState = {
      ...mocks.authState,
      user: {
        id: 'admin-id',
        username: 'admin',
        role: 'admin',
        is_active: true,
      },
      isAuthenticated: true,
      isLoading: false,
      initialize: vi.fn().mockResolvedValue(undefined),
      fetchCurrentUser: vi.fn().mockResolvedValue(undefined),
    }
  })

  it('autorise un admin actif après initialisation', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/users']}>
        <Routes>
          <Route
            path="/admin/users"
            element={(
              <AdminRoute>
                <div>Administration</div>
              </AdminRoute>
            )}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Administration')).toBeInTheDocument()
    expect(mocks.authState.initialize).toHaveBeenCalledOnce()
    expect(mocks.authState.fetchCurrentUser).toHaveBeenCalledOnce()
  })

  it('redirige si /me ne confirme plus le rôle admin', async () => {
    mocks.authState.fetchCurrentUser = vi.fn().mockImplementation(async () => {
      mocks.authState.user = {
        id: 'writer-id',
        username: 'writer',
        role: 'writer',
        is_active: true,
      }
    })
    render(
      <MemoryRouter initialEntries={['/admin/users']}>
        <Routes>
          <Route path="/" element={<div>Accueil</div>} />
          <Route
            path="/admin/users"
            element={(
              <AdminRoute>
                <div>Administration</div>
              </AdminRoute>
            )}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Accueil')).toBeInTheDocument()
    expect(screen.queryByText('Administration')).not.toBeInTheDocument()
  })

  it('redirige un writer', async () => {
    if (mocks.authState.user === null) {
      throw new Error('État utilisateur de test absent')
    }
    mocks.authState = {
      ...mocks.authState,
      user: { ...mocks.authState.user, role: 'writer' },
    }
    render(
      <MemoryRouter initialEntries={['/admin/users']}>
        <Routes>
          <Route path="/" element={<div>Accueil</div>} />
          <Route
            path="/admin/users"
            element={(
              <AdminRoute>
                <div>Administration</div>
              </AdminRoute>
            )}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Accueil')).toBeInTheDocument()
    expect(screen.queryByText('Administration')).not.toBeInTheDocument()
  })

  it('initialise une navigation directe avec user null avant le rôle', async () => {
    const initialize = vi.fn().mockImplementation(async () => {
      mocks.authState.user = {
        id: 'admin-id',
        username: 'admin',
        role: 'admin',
        is_active: true,
      }
      mocks.authState.isAuthenticated = true
    })
    mocks.authState = {
      ...mocks.authState,
      user: null,
      isAuthenticated: false,
      initialize,
      fetchCurrentUser: vi.fn().mockResolvedValue(undefined),
    }

    render(
      <MemoryRouter initialEntries={['/admin/users']}>
        <Routes>
          <Route
            path="/admin/users"
            element={(
              <AdminRoute>
                <div>Administration</div>
              </AdminRoute>
            )}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Chargement de la session')
    expect(await screen.findByText('Administration')).toBeInTheDocument()
    expect(initialize).toHaveBeenCalledOnce()
  })

  it('redirige un administrateur inactif', async () => {
    if (mocks.authState.user === null) {
      throw new Error('État utilisateur de test absent')
    }
    mocks.authState = {
      ...mocks.authState,
      user: { ...mocks.authState.user, is_active: false },
    }

    render(
      <MemoryRouter initialEntries={['/admin/users']}>
        <Routes>
          <Route path="/" element={<div>Accueil</div>} />
          <Route
            path="/admin/users"
            element={(
              <AdminRoute>
                <div>Administration</div>
              </AdminRoute>
            )}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Accueil')).toBeInTheDocument()
    expect(screen.queryByText('Administration')).not.toBeInTheDocument()
  })
})
