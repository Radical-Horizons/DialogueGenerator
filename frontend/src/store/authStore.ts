/**
 * Store Zustand pour l'authentification avec persistance de session.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserResponse } from '../types/api'
import * as authAPI from '../api/auth'

export interface AuthState {
  user: UserResponse | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  fetchCurrentUser: () => Promise<void>
  initialize: () => Promise<void>
}

export type UseAuthStoreReturn = ReturnType<typeof useAuthStore>

const STORAGE_KEY = 'auth-storage'

// Flag pour éviter les appels multiples simultanés à initialize()
let isInitializing = false
let hasInitialized = false

interface JwtPayload {
  exp?: number
}

const decodeBase64 = (value: string): string | null => {
  try {
    if (typeof globalThis.atob === 'function') {
      return globalThis.atob(value)
    }
    const bufferCtor = (globalThis as unknown as { Buffer?: { from: (input: string, encoding: string) => { toString: (encoding: string) => string } } }).Buffer
    if (bufferCtor) {
      return bufferCtor.from(value, 'base64').toString('binary')
    }
  } catch {
    return null
  }
  return null
}

const parseJwtPayload = (token: string): JwtPayload | null => {
  const parts = token.split('.')
  if (parts.length < 2) {
    return null
  }
  const payload = parts[1]
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const decoded = decodeBase64(padded)
  if (!decoded) {
    return null
  }
  try {
    return JSON.parse(decoded) as JwtPayload
  } catch {
    return null
  }
}

const isTokenExpired = (token: string): boolean => {
  const payload = parseJwtPayload(token)
  if (!payload || typeof payload.exp !== 'number') {
    return true
  }
  const nowSeconds = Math.floor(Date.now() / 1000)
  return payload.exp <= nowSeconds
}

const clearStoredTokens = () => {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (username: string, password: string) => {
        set({ isLoading: true })
        try {
          await authAPI.login({ username, password })
          const user = await authAPI.getCurrentUser()
          set({ user, isAuthenticated: true, isLoading: false })
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      logout: async () => {
        try {
          await authAPI.logout()
        } catch (error) {
          // Ignorer les erreurs de déconnexion
        } finally {
          clearStoredTokens()
          set({ user: null, isAuthenticated: false })
        }
      },

      fetchCurrentUser: async () => {
        set({ isLoading: true })
        try {
          const user = await authAPI.getCurrentUser()
          set({ user, isAuthenticated: true, isLoading: false })
        } catch (error: unknown) {
          // Si le token est invalide ou utilisateur non connecté, nettoyer la session
          // Ne pas logger les erreurs 401 normales (utilisateur non connecté)
          const status = (error as { response?: { status?: number } } | null)?.response?.status
          if (status !== 401) {
            // Logger seulement les erreurs non-401
            console.error('Erreur lors de la récupération de l\'utilisateur:', error)
          }
          clearStoredTokens()
          set({ user: null, isAuthenticated: false, isLoading: false })
          // Rejeter l'erreur pour que l'appelant puisse la gérer
          throw error
        }
      },

      // Initialise la session depuis le localStorage
      initialize: async () => {
        // En développement, auto-login avec un utilisateur mock
        if (import.meta.env.DEV) {
          set({
            user: {
              id: '1',
              username: 'admin',
              email: 'admin@example.com',
              role: 'admin',
              is_active: true,
            },
            isAuthenticated: true,
            isLoading: false
          })
          return
        }
        
        // Éviter les appels multiples (StrictMode en dev)
        if (hasInitialized || isInitializing) {
          return
        }
        
        isInitializing = true
        hasInitialized = true
        set({ isLoading: true })
        try {
          const token = localStorage.getItem('access_token')
          if (token) {
            if (isTokenExpired(token)) {
              clearStoredTokens()
              set({ isLoading: false, isAuthenticated: false, user: null })
              return
            }
            // Vérifier que le token est encore valide
            try {
              const user = await authAPI.getCurrentUser()
              set({ user, isAuthenticated: true, isLoading: false })
              return // Sortir immédiatement, isLoading déjà à false
            } catch (error: unknown) {
              // Erreur 401 attendue si token invalide, nettoyer et continuer
              // Ne pas logger les erreurs 401 normales (utilisateur non connecté)
              const status = (error as { response?: { status?: number } } | null)?.response?.status
              if (status !== 401) {
                console.error('Erreur lors de la récupération de l\'utilisateur:', error)
              }
              clearStoredTokens()
              set({ user: null, isAuthenticated: false, isLoading: false })
              return // Sortir immédiatement, isLoading déjà à false
            }
          } else {
            // Pas de token, utilisateur non connecté
            set({ isLoading: false, isAuthenticated: false, user: null })
            return // Sortir immédiatement, isLoading déjà à false
          }
        } catch (error) {
          // En cas d'erreur inattendue, s'assurer que isLoading est false
          console.error('Erreur lors de l\'initialisation:', error)
          set({ isLoading: false, isAuthenticated: false, user: null })
        } finally {
          // Double sécurité : s'assurer que isLoading est toujours false à la fin
          const stateInFinally = useAuthStore.getState()
          // S'assurer que isLoading est toujours false, mais seulement si ce n'est pas déjà le cas
          // (pour éviter d'écraser un state déjà correct)
          if (stateInFinally.isLoading) {
            set({ isLoading: false })
          }
          // Libérer le flag d'initialisation
          isInitializing = false
        }
      },
    }),
    {
      name: STORAGE_KEY,
      version: 2,
      migrate: (persistedState, version) => {
        if (version < 2) {
          return {
            ...(persistedState as Partial<AuthState>),
            user: null,
            isAuthenticated: false,
          }
        }
        return persistedState as AuthState
      },
      partialize: (state) => ({
        // Ne persister que l'user et l'état d'authentification
        // Les tokens restent dans localStorage via le client API
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

