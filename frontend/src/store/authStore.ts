/**
 * Store Zustand pour l'authentification avec persistance de session.
 *
 * Entrée guest-first : sans session JWT valide, `initialize` appelle `loginAsGuest`.
 * Pas de mock admin Vite ni de bypass DEV.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserResponse } from '../types/api'
import * as authAPI from '../api/auth'
import {
  resetUserSettingsSync,
  synchronizeUserSettings,
} from '../hooks/useUserSettingsSync'

export interface AuthState {
  user: UserResponse | null
  isAuthenticated: boolean
  isLoading: boolean
  /** Raison d’échec boot guest (affichée sur /login). */
  bootError: string | null
  login: (username: string, password: string) => Promise<void>
  loginAsGuest: () => Promise<void>
  logout: () => Promise<void>
  fetchCurrentUser: () => Promise<void>
  initialize: () => Promise<void>
  clearBootError: () => void
}

export type UseAuthStoreReturn = ReturnType<typeof useAuthStore>

const STORAGE_KEY = 'auth-storage'

/** Promise partagée pour StrictMode / appels concurrents à initialize(). */
let initializePromise: Promise<void> | null = null

/** Incrémente à chaque logout / login pour ignorer les résultats initialize obsolètes. */
let authEpoch = 0

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

const SETTINGS_SYNC_TIMEOUT_MS = 10_000

async function syncUserSettingsNonBlocking(user: UserResponse): Promise<void> {
  try {
    await Promise.race([
      synchronizeUserSettings(user),
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, SETTINGS_SYNC_TIMEOUT_MS)
      }),
    ])
  } catch (error) {
    console.warn('Synchronisation des préférences utilisateur impossible:', error)
  }
}

/**
 * Établit une session invité (JWT guest) et met à jour le store.
 *
 * @returns Utilisateur guest, ou null si l'API guest échoue.
 */
async function establishGuestSession(
  set: (partial: Partial<AuthState>) => void,
  epoch: number,
): Promise<UserResponse | null> {
  try {
    await authAPI.loginAsGuest()
    if (epoch !== authEpoch) {
      return null
    }
    const user = await authAPI.getCurrentUser()
    if (epoch !== authEpoch) {
      return null
    }
    set({ user, isAuthenticated: true, isLoading: false, bootError: null })
    await syncUserSettingsNonBlocking(user)
    return user
  } catch (error) {
    console.error('Impossible d’établir une session invité:', error)
    if (epoch !== authEpoch) {
      return null
    }
    resetUserSettingsSync()
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      bootError: 'Session invité indisponible. Connectez-vous avec un compte.',
    })
    return null
  }
}

/**
 * Réinitialise le verrou d'initialize pour les tests Vitest.
 */
export function resetAuthInitializeLock(): void {
  initializePromise = null
  authEpoch = 0
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      // true jusqu’au premier initialize — évite Navigate /login avant guest
      isLoading: true,
      bootError: null,

      clearBootError: () => set({ bootError: null }),

      login: async (username: string, password: string) => {
        authEpoch += 1
        const epoch = authEpoch
        set({ isLoading: true, bootError: null })
        try {
          await authAPI.login({ username, password })
          if (epoch !== authEpoch) return
          const user = await authAPI.getCurrentUser()
          if (epoch !== authEpoch) return
          set({ user, isAuthenticated: true })
          await syncUserSettingsNonBlocking(user)
        } catch (error) {
          throw error
        } finally {
          // Toujours libérer le bouton même si un login concurrent a incrémenté authEpoch
          if (epoch === authEpoch) {
            set({ isLoading: false })
          }
        }
      },

      loginAsGuest: async () => {
        authEpoch += 1
        const epoch = authEpoch
        set({ isLoading: true, bootError: null })
        const user = await establishGuestSession(set, epoch)
        if (!user && epoch === authEpoch) {
          throw new Error('Session invité indisponible')
        }
      },

      logout: async () => {
        authEpoch += 1
        const epoch = authEpoch
        try {
          await authAPI.logout()
        } catch {
          // Ignorer les erreurs de déconnexion API
        }
        clearStoredTokens()
        resetUserSettingsSync()
        // Évite menu writer sans JWT pendant le re-guest
        set({ user: null, isAuthenticated: false, isLoading: true, bootError: null })
        await establishGuestSession(set, epoch)
      },

      fetchCurrentUser: async () => {
        const epoch = authEpoch
        set({ isLoading: true })
        try {
          const user = await authAPI.getCurrentUser()
          if (epoch !== authEpoch) return
          set({ user, isAuthenticated: true })
          await syncUserSettingsNonBlocking(user)
          if (epoch === authEpoch) {
            set({ isLoading: false })
          }
        } catch (error: unknown) {
          const status = (error as { response?: { status?: number } } | null)?.response?.status
          if (status !== 401) {
            console.error('Erreur lors de la récupération de l\'utilisateur:', error)
          }
          clearStoredTokens()
          resetUserSettingsSync()
          const guest = await establishGuestSession(set, epoch)
          // Guest OK = récupération réussie ; ne pas faire échouer l’appelant
          if (guest) {
            return
          }
          throw error
        }
      },

      initialize: async () => {
        if (initializePromise) {
          return initializePromise
        }

        const epochAtStart = authEpoch
        initializePromise = (async () => {
          set({ isLoading: true })
          try {
            const restoreSession = async (user: UserResponse): Promise<void> => {
              if (epochAtStart !== authEpoch) return
              set({ user, isAuthenticated: true, isLoading: false, bootError: null })
              await syncUserSettingsNonBlocking(user)
            }

            /** Access expiré / absent : cookie refresh (7j) avant bascule guest. */
            const restoreViaRefreshCookie = async (): Promise<boolean> => {
              try {
                await authAPI.refreshToken()
                if (epochAtStart !== authEpoch) return true
                const user = await authAPI.getCurrentUser()
                await restoreSession(user)
                return true
              } catch {
                clearStoredTokens()
                resetUserSettingsSync()
                return false
              }
            }

            const token = localStorage.getItem('access_token')
            if (token && !isTokenExpired(token)) {
              try {
                const user = await authAPI.getCurrentUser()
                await restoreSession(user)
                return
              } catch (error: unknown) {
                const status = (error as { response?: { status?: number } } | null)?.response?.status
                if (status === 401) {
                  clearStoredTokens()
                  resetUserSettingsSync()
                  if (await restoreViaRefreshCookie()) return
                } else {
                  // Erreur transitoire : ne pas détruire une session potentiellement valide
                  console.error('Erreur lors de la récupération de l\'utilisateur:', error)
                  if (epochAtStart === authEpoch) {
                    set({ isLoading: false })
                  }
                  return
                }
              }
            } else {
              // Token expiré ou absent : tenter le refresh cookie avant guest
              if (await restoreViaRefreshCookie()) return
            }

            if (get().isAuthenticated && !localStorage.getItem('access_token')) {
              set({ user: null, isAuthenticated: false })
            }

            if (epochAtStart !== authEpoch) return
            await establishGuestSession(set, epochAtStart)
          } catch (error) {
            console.error('Erreur lors de l\'initialisation:', error)
            resetUserSettingsSync()
            if (epochAtStart === authEpoch) {
              set({
                isLoading: false,
                isAuthenticated: false,
                user: null,
                bootError: 'Initialisation de session impossible. Connectez-vous.',
              })
            }
          } finally {
            if (epochAtStart === authEpoch && get().isLoading) {
              set({ isLoading: false })
            }
            // Échec guest → permettre un nouvel initialize (remount / retry)
            if (epochAtStart === authEpoch && !get().isAuthenticated) {
              initializePromise = null
            }
          }
        })()

        return initializePromise
      },
    }),
    {
      name: STORAGE_KEY,
      version: 3,
      migrate: (persistedState, version) => {
        if (version < 3) {
          return {
            ...(persistedState as Partial<AuthState>),
            user: null,
            isAuthenticated: false,
            bootError: null,
          }
        }
        return persistedState as AuthState
      },
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        // Persist sans token = identité fantôme (ex. ancien mock admin Vite)
        if (state && !localStorage.getItem('access_token')) {
          state.user = null
          state.isAuthenticated = false
        }
      },
    }
  )
)
