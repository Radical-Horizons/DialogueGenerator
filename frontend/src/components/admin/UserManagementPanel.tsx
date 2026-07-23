import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'

import * as usersApi from '../../api/users'
import type { UserResponse } from '../../types/api'
import { useAuthStore } from '../../store/authStore'
import { theme } from '../../theme'
import { PasswordInput } from '../shared/PasswordInput'

const fieldStyle: React.CSSProperties = {
  minHeight: 44,
  boxSizing: 'border-box',
  padding: '0.55rem 0.7rem',
  color: theme.input.color,
  background: theme.input.background,
  border: `1px solid ${theme.input.border}`,
  borderRadius: 4,
}

const fieldHelperStyle: React.CSSProperties = {
  display: 'block',
  minHeight: '1.25em',
  marginTop: '0.25rem',
  lineHeight: 1.25,
  fontSize: '0.8rem',
}

type UserField = 'username' | 'email' | 'password'
type FieldErrors = Partial<Record<UserField, string>>

interface ApiErrorInfo {
  message: string
  fieldErrors: FieldErrors
}

function apiErrorInfo(error: unknown): ApiErrorInfo {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.error?.message
    const details = error.response?.data?.error?.details
    const fieldErrors: FieldErrors = {}
    if (details && typeof details === 'object') {
      for (const field of ['username', 'email', 'password'] as const) {
        if (typeof details[field] === 'string') {
          fieldErrors[field] = details[field]
        }
      }
    }
    return {
      message: typeof message === 'string' ? message : 'Erreur de validation.',
      fieldErrors,
    }
  }
  return {
    message: 'Une erreur est survenue. Réessayez.',
    fieldErrors: {},
  }
}

function sortUsers(users: UserResponse[]): UserResponse[] {
  return [...users].sort((left, right) => (
    left.username.localeCompare(right.username, 'fr', { sensitivity: 'base' })
  ))
}

function mergeInitialUsers(
  serverUsers: UserResponse[],
  currentUsers: UserResponse[],
): UserResponse[] {
  const merged = new Map(serverUsers.map((user) => [user.id, user]))
  for (const user of currentUsers) {
    merged.set(user.id, user)
  }
  return sortUsers([...merged.values()])
}

export function UserManagementPanel() {
  const navigate = useNavigate()
  const { user: currentUser, fetchCurrentUser } = useAuthStore()
  const [users, setUsers] = useState<UserResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [isCreating, setIsCreating] = useState(false)
  const [mutatingUserIds, setMutatingUserIds] = useState<Set<string>>(new Set())
  const mutatingUserIdsRef = useRef<Set<string>>(new Set())
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const passwordBytes = new TextEncoder().encode(password).length

  const handleAdminForbidden = useCallback(async () => {
    try {
      await fetchCurrentUser()
    } catch {
      // fetchCurrentUser bascule déjà en guest si la session n'est plus admin.
    }
    navigate('/', { replace: true })
  }, [fetchCurrentUser, navigate])

  const loadUsers = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const loadedUsers = await usersApi.listUsers()
      setUsers((current) => mergeInitialUsers(loadedUsers, current))
    } catch (loadError) {
      const info = apiErrorInfo(loadError)
      const status = axios.isAxiosError(loadError) ? loadError.response?.status : undefined
      if (status === 403) {
        await handleAdminForbidden()
        return
      }
      setError(info.message)
    } finally {
      setIsLoading(false)
    }
  }, [handleAdminForbidden])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (passwordBytes > 72) {
      setFieldErrors({
        password: 'Le mot de passe dépasse la limite de 72 octets UTF-8 de bcrypt.',
      })
      return
    }
    setIsCreating(true)
    setError(null)
    setFieldErrors({})
    try {
      const created = await usersApi.createUser({ username, email, password })
      setUsers((current) => sortUsers([...current, created]))
      setUsername('')
      setEmail('')
      setPassword('')
    } catch (createError) {
      const info = apiErrorInfo(createError)
      const status = axios.isAxiosError(createError) ? createError.response?.status : undefined
      if (status === 403) {
        await handleAdminForbidden()
        return
      }
      setError(info.message)
      setFieldErrors(info.fieldErrors)
    } finally {
      setIsCreating(false)
    }
  }

  const handleRoleChange = async (
    user: UserResponse,
    role: 'admin' | 'writer',
  ) => {
    if (
      role === 'admin'
      && user.role !== 'admin'
      && !window.confirm(`Promouvoir ${user.username} administrateur ?`)
    ) {
      return
    }
    await mutateUser(user.id, { role })
  }

  const handleStatusChange = async (user: UserResponse) => {
    if (
      user.is_active
      && !window.confirm(`Désactiver le compte ${user.username} ?`)
    ) {
      return
    }
    await mutateUser(user.id, { is_active: !user.is_active })
  }

  const mutateUser = async (
    userId: string,
    patch: { role?: 'admin' | 'writer'; is_active?: boolean },
  ) => {
    if (mutatingUserIdsRef.current.has(userId)) {
      return
    }
    mutatingUserIdsRef.current.add(userId)
    setMutatingUserIds((current) => new Set(current).add(userId))
    setError(null)
    try {
      const updated = await usersApi.updateUser(userId, patch)
      setUsers((current) => sortUsers(current.map((user) => (
        user.id === updated.id ? updated : user
      ))))
      if (currentUser?.id === updated.id) {
        try {
          await fetchCurrentUser()
        } catch {
          // fetchCurrentUser nettoie déjà la session si le compte a été désactivé.
        }
      }
    } catch (mutationError) {
      const info = apiErrorInfo(mutationError)
      const status = axios.isAxiosError(mutationError) ? mutationError.response?.status : undefined
      if (status === 403) {
        await handleAdminForbidden()
        return
      }
      setError(info.message)
    } finally {
      mutatingUserIdsRef.current.delete(userId)
      setMutatingUserIds((current) => {
        const next = new Set(current)
        next.delete(userId)
        return next
      })
    }
  }

  return (
    <section
      aria-labelledby="user-management-title"
      style={{
        height: '100%',
        overflowY: 'auto',
        boxSizing: 'border-box',
        padding: 'clamp(1rem, 3vw, 2rem)',
        color: theme.text.primary,
        background: theme.background.primary,
      }}
    >
      <h2 id="user-management-title">Gestion des utilisateurs</h2>

      <form
        aria-label="Créer un compte"
        onSubmit={handleCreate}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: '0.75rem',
          alignItems: 'end',
          padding: '1rem',
          marginBottom: '1.5rem',
          background: theme.background.panel,
          border: `1px solid ${theme.border.primary}`,
          borderRadius: 8,
        }}
      >
        <label>
          Nom d’utilisateur
          <input
            required
            minLength={3}
            value={username}
            aria-describedby={fieldErrors.username ? 'username-error' : undefined}
            aria-invalid={Boolean(fieldErrors.username)}
            onChange={(event) => {
              setUsername(event.target.value)
              setFieldErrors((current) => ({ ...current, username: undefined }))
            }}
            style={{ ...fieldStyle, width: '100%', display: 'block' }}
          />
          <small
            id={fieldErrors.username ? 'username-error' : undefined}
            style={{
              ...fieldHelperStyle,
              color: fieldErrors.username ? theme.state.error.color : theme.text.secondary,
            }}
          >
            {fieldErrors.username ?? '\u00a0'}
          </small>
        </label>
        <label>
          Email
          <input
            required
            type="email"
            value={email}
            aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            aria-invalid={Boolean(fieldErrors.email)}
            onChange={(event) => {
              setEmail(event.target.value)
              setFieldErrors((current) => ({ ...current, email: undefined }))
            }}
            style={{ ...fieldStyle, width: '100%', display: 'block' }}
          />
          <small
            id={fieldErrors.email ? 'email-error' : undefined}
            style={{
              ...fieldHelperStyle,
              color: fieldErrors.email ? theme.state.error.color : theme.text.secondary,
            }}
          >
            {fieldErrors.email ?? '\u00a0'}
          </small>
        </label>
        <label>
          Mot de passe initial
          <PasswordInput
            required
            aria-label="Mot de passe initial"
            minLength={8}
            value={password}
            aria-describedby="password-byte-feedback"
            aria-invalid={Boolean(fieldErrors.password) || passwordBytes > 72}
            onChange={(event) => {
              setPassword(event.target.value)
              setFieldErrors((current) => ({ ...current, password: undefined }))
            }}
            style={{ ...fieldStyle, width: '100%', display: 'block' }}
          />
          <small
            id="password-byte-feedback"
            style={{
              ...fieldHelperStyle,
              color: passwordBytes > 72 || fieldErrors.password
                ? theme.state.error.color
                : theme.text.secondary,
            }}
          >
            {fieldErrors.password ?? `${passwordBytes}/72 octets UTF-8`}
          </small>
        </label>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span aria-hidden="true" style={{ visibility: 'hidden', userSelect: 'none' }}>
            Créer
          </span>
          <button
            type="submit"
            disabled={isCreating || isLoading}
            style={{
              ...fieldStyle,
              width: '100%',
              cursor: isCreating || isLoading ? 'wait' : 'pointer',
              background: theme.button.primary.background,
              color: theme.button.primary.color,
            }}
          >
            {isCreating ? 'Création…' : 'Créer le compte'}
          </button>
          <small style={{ ...fieldHelperStyle, color: theme.text.secondary }} aria-hidden="true">
            {'\u00a0'}
          </small>
        </div>
      </form>

      {error && (
        <div
          role="alert"
          style={{
            padding: '0.75rem',
            marginBottom: '1rem',
            color: theme.state.error.color,
            background: theme.state.error.background,
            border: `1px solid ${theme.state.error.border}`,
          }}
        >
          {error}
        </div>
      )}

      {isLoading ? (
        <p role="status">Chargement des utilisateurs…</p>
      ) : users.length === 0 ? (
        <p>Aucun utilisateur.</p>
      ) : (
        <div aria-label="Comptes utilisateurs" style={{ display: 'grid', gap: '0.75rem' }}>
          {users.map((user) => (
            <article
              key={user.id}
              aria-busy={mutatingUserIds.has(user.id)}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '0.75rem',
                alignItems: 'center',
                padding: '0.9rem',
                background: theme.background.panel,
                border: `1px solid ${theme.border.primary}`,
                borderRadius: 8,
              }}
            >
              <div>
                <strong>{user.username}</strong>
                <div style={{ color: theme.text.secondary }}>{user.email}</div>
              </div>
              <label>
                Rôle
                <select
                  aria-label={`Rôle de ${user.username}`}
                  value={user.role}
                  disabled={mutatingUserIds.has(user.id)}
                  onChange={(event) => {
                    void handleRoleChange(
                      user,
                      event.target.value as 'admin' | 'writer',
                    )
                  }}
                  style={{ ...fieldStyle, display: 'block', width: '100%' }}
                >
                  <option value="writer">Writer</option>
                  <option value="admin">Administrateur</option>
                </select>
              </label>
              <span>{user.is_active ? 'Actif' : 'Inactif'}</span>
              <button
                type="button"
                disabled={mutatingUserIds.has(user.id)}
                onClick={() => void handleStatusChange(user)}
                style={{ ...fieldStyle, cursor: 'pointer' }}
              >
                {user.is_active ? 'Désactiver' : 'Réactiver'}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
