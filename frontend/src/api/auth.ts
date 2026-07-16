/**
 * API client pour l'authentification.
 */
import apiClient from './client'
import type { LoginRequest, TokenResponse, UserResponse } from '../types/api'

/**
 * Connexion utilisateur.
 */
export async function login(credentials: LoginRequest): Promise<TokenResponse> {
  const response = await apiClient.post<TokenResponse>('/api/v1/auth/login', credentials)
  const { access_token } = response.data
  
  // Stocker le token
  localStorage.setItem('access_token', access_token)
  
  return response.data
}

/**
 * Session invité (démo lecture seule, sans compte SQLite).
 */
export async function loginAsGuest(): Promise<TokenResponse> {
  const response = await apiClient.post<TokenResponse>('/api/v1/auth/guest')
  const { access_token } = response.data
  localStorage.setItem('access_token', access_token)
  return response.data
}

/**
 * Déconnexion utilisateur.
 */
export async function logout(): Promise<void> {
  await apiClient.post('/api/v1/auth/logout')
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
}

/**
 * Rafraîchir le token d'accès.
 * Note: Le refresh_token est maintenant dans un cookie httpOnly,
 * il n'est plus nécessaire de le passer en paramètre.
 * 
 * @deprecated Cette fonction n'est plus utilisée directement.
 * Le refresh est géré automatiquement par l'intercepteur axios.
 */
export async function refreshToken(): Promise<TokenResponse> {
  // Body vide, le cookie refresh_token est envoyé automatiquement avec withCredentials
  const response = await apiClient.post<TokenResponse>('/api/v1/auth/refresh', {})
  
  const { access_token } = response.data
  localStorage.setItem('access_token', access_token)
  
  return response.data
}

/**
 * Récupérer les informations de l'utilisateur courant.
 */
export async function getCurrentUser(): Promise<UserResponse> {
  const response = await apiClient.get<UserResponse>('/api/v1/auth/me')
  return response.data
}

