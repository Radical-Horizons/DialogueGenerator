import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { LoginForm } from '../components/auth/LoginForm'
import { useAuthStore } from '../store/authStore'
import type { AuthState } from '../store/authStore'

// Mock du store
vi.mock('../store/authStore')

describe('LoginForm', () => {
  it('affiche le formulaire de connexion', () => {
    const mockLogin = vi.fn()
    vi.mocked(useAuthStore).mockReturnValue({
      login: mockLogin,
      loginAsGuest: vi.fn(),
      isLoading: false,
      isAuthenticated: false,
      user: null,
      bootError: null,
      clearBootError: vi.fn(),
    } as Partial<AuthState>)

    render(
      <BrowserRouter>
        <LoginForm />
      </BrowserRouter>
    )

    expect(screen.getByText('Connexion')).toBeInTheDocument()
    expect(screen.getByLabelText(/nom d'utilisateur/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/mot de passe/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /se connecter/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continuer en invité/i })).toBeInTheDocument()
  })

  it('appelle login avec les bonnes données au submit', async () => {
    const user = userEvent.setup()
    const mockLogin = vi.fn().mockResolvedValue(undefined)
    
    vi.mocked(useAuthStore).mockReturnValue({
      login: mockLogin,
      loginAsGuest: vi.fn(),
      isLoading: false,
      isAuthenticated: false,
      user: null,
      bootError: null,
      clearBootError: vi.fn(),
    } as Partial<AuthState>)

    render(
      <BrowserRouter>
        <LoginForm />
      </BrowserRouter>
    )

    const usernameInput = screen.getByLabelText(/nom d'utilisateur/i)
    const passwordInput = screen.getByLabelText(/mot de passe/i)
    const submitButton = screen.getByRole('button', { name: /se connecter/i })

    await user.type(usernameInput, 'admin')
    await user.type(passwordInput, 'admin123')
    await user.click(submitButton)

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('admin', 'admin123')
    })
  })

  it('appelle loginAsGuest au clic Continuer en invité', async () => {
    const user = userEvent.setup()
    const mockGuest = vi.fn().mockResolvedValue(undefined)

    vi.mocked(useAuthStore).mockReturnValue({
      login: vi.fn(),
      loginAsGuest: mockGuest,
      isLoading: false,
      isAuthenticated: false,
      user: null,
      bootError: null,
      clearBootError: vi.fn(),
    } as Partial<AuthState>)

    render(
      <BrowserRouter>
        <LoginForm />
      </BrowserRouter>
    )

    await user.click(screen.getByRole('button', { name: /continuer en invité/i }))

    await waitFor(() => {
      expect(mockGuest).toHaveBeenCalled()
    })
  })
})

