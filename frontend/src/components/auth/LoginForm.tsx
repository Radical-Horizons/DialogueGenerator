/**
 * Formulaire de connexion.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { getErrorMessage } from '../../types/errors'
import { theme } from '../../theme'

export function LoginForm() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const {
    login,
    loginAsGuest,
    isLoading,
    isAuthenticated,
    user,
    bootError,
    clearBootError,
    initialize,
  } = useAuthStore()
  const navigate = useNavigate()

  // /login est hors ProtectedRoute : garantir le boot guest / clear isLoading
  useEffect(() => {
    void initialize().catch((err) => {
      console.error('[LoginForm] Erreur initialisation auth:', err)
    })
  }, [initialize])

  // Rediriger seulement si compte writer/admin (guest doit pouvoir ouvrir /login)
  useEffect(() => {
    if (isAuthenticated && user && user.role !== 'guest') {
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, user, navigate])

  useEffect(() => {
    return () => {
      clearBootError()
    }
  }, [clearBootError])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    try {
      await login(username, password)
      // Redirection après connexion réussie
      navigate('/', { replace: true })
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const handleGuest = async () => {
    setError(null)
    try {
      await loginAsGuest()
      navigate('/', { replace: true })
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '400px', margin: '0 auto' }}>
      <h2 style={{ color: theme.text.primary }}>Connexion</h2>
      {(error || bootError) && (
        <div style={{ color: theme.state.error.color, marginBottom: '1rem' }}>
          {error || bootError}
        </div>
      )}
      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="username" style={{ color: theme.text.primary }}>
          Nom d'utilisateur:
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            style={{ 
              width: '100%', 
              padding: '0.5rem', 
              marginTop: '0.5rem',
              backgroundColor: theme.input.background,
              border: `1px solid ${theme.input.border}`,
              color: theme.input.color,
            }}
          />
        </label>
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="password" style={{ color: theme.text.primary }}>
          Mot de passe:
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ 
              width: '100%', 
              padding: '0.5rem', 
              marginTop: '0.5rem',
              backgroundColor: theme.input.background,
              border: `1px solid ${theme.input.border}`,
              color: theme.input.color,
            }}
          />
        </label>
      </div>
      <button 
        type="submit" 
        disabled={isLoading} 
        style={{ 
          width: '100%', 
          padding: '0.75rem',
          backgroundColor: theme.button.primary.background,
          color: theme.button.primary.color,
        }}
      >
        {isLoading ? 'Connexion...' : 'Se connecter'}
      </button>
      <button
        type="button"
        data-testid="continue-as-guest"
        disabled={isLoading}
        onClick={() => void handleGuest()}
        style={{
          width: '100%',
          marginTop: '0.75rem',
          padding: '0.75rem',
          backgroundColor: theme.button.default.background,
          color: theme.button.default.color,
          border: `1px solid ${theme.border.primary}`,
          cursor: isLoading ? 'wait' : 'pointer',
        }}
      >
        Continuer en invité
      </button>
      <p
        style={{
          marginTop: '0.75rem',
          color: theme.text.secondary,
          fontSize: '0.85rem',
          textAlign: 'center',
        }}
      >
        Mode lecture seule — idéal pour découvrir l&apos;appli sans compte.
      </p>
    </form>
  )
}

