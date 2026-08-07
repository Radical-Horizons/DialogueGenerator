/**
 * Régression prod 2026-07-21 : /login hors ProtectedRoute + isLoading=true
 * au boot → bouton coincé sur « Connexion... » si initialize() n'est jamais appelé.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

import * as authAPI from '../api/auth'
import { LoginForm } from '../components/auth/LoginForm'
import { resetAuthInitializeLock, useAuthStore } from '../store/authStore'

vi.mock('../api/auth')
vi.mock('../hooks/useUserSettingsSync', () => ({
  resetUserSettingsSync: vi.fn(),
  synchronizeUserSettings: vi.fn().mockResolvedValue(undefined),
}))

const mockedAuth = vi.mocked(authAPI)

const guestUser = {
  id: 'guest-id',
  username: 'guest',
  email: '',
  role: 'guest' as const,
  is_active: true,
}

describe('LoginForm cold boot (store réel)', () => {
  beforeEach(() => {
    localStorage.clear()
    resetAuthInitializeLock()
    vi.clearAllMocks()
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      bootError: null,
    })
    mockedAuth.loginAsGuest.mockResolvedValue({
      access_token: 'guest-token',
      token_type: 'bearer',
      expires_in: 900,
    })
    mockedAuth.refreshToken.mockRejectedValue({ response: { status: 401 } })
    mockedAuth.getCurrentUser.mockResolvedValue(guestUser)
  })

  it('appelle initialize et libère « Se connecter » (pas bloqué sur Connexion...)', async () => {
    render(
      <BrowserRouter>
        <LoginForm />
      </BrowserRouter>,
    )

    expect(screen.getByRole('button', { name: /connexion\.\.\./i })).toBeDisabled()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /se connecter/i })).toBeEnabled()
    })

    expect(mockedAuth.loginAsGuest).toHaveBeenCalled()
    expect(useAuthStore.getState().isLoading).toBe(false)
    expect(screen.queryByRole('button', { name: /connexion\.\.\./i })).not.toBeInTheDocument()
  })
})
