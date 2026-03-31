/**
 * Client HTTP pour l'API REST.
 */
import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'

// En développement, utiliser le proxy Vite (/api) au lieu de l'URL directe
// En production, utiliser VITE_API_BASE_URL ou des URLs relatives (/api)
// Note: Le proxy Vite redirige /api vers http://localhost:4243 en dev
// En production, Nginx sert le frontend et l'API sur le même domaine, donc on utilise des URLs relatives
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

/**
 * Instance axios configurée pour l'API.
 */
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 secondes par défaut (sera surchargé pour les requêtes LLM)
  withCredentials: true, // Nécessaire pour envoyer/recevoir les cookies (refresh_token)
})

/**
 * Intercepteur pour ajouter le token d'authentification.
 * Si un access_token est présent (login), il est toujours envoyé — y compris en dev,
 * pour le cas où DISABLE_AUTH=false en local. Sans token, le backend avec DISABLE_AUTH=true
 * accepte quand même les routes protégées (utilisateur mock).
 */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('access_token')
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error: AxiosError) => {
    return Promise.reject(error)
  }
)

/**
 * Verrou anti-tempête pour le refresh token.
 * Si plusieurs requêtes partent simultanément avec token expiré,
 * une seule Promise de refresh est créée et partagée.
 */
let refreshTokenPromise: Promise<string> | null = null

/**
 * Intercepteur pour gérer les erreurs et le rafraîchissement de token.
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // En développement, ignorer les erreurs 401 (auth désactivée)
    if (import.meta.env.DEV) {
      return Promise.reject(error)
    }

    // Si erreur 401 et pas déjà retenté
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      // Si pas de token dans localStorage, c'est normal (utilisateur non connecté)
      // Ne pas essayer de refresh, rejeter silencieusement
      const token = localStorage.getItem('access_token')
      if (!token) {
        // Pas de token, erreur 401 normale - ne pas logger
        return Promise.reject(error)
      }

      try {
        // Si un refresh est déjà en cours, attendre cette Promise
        if (refreshTokenPromise) {
          const newAccessToken = await refreshTokenPromise
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
          }
          return apiClient(originalRequest)
        }

        // Sinon, créer une nouvelle Promise de refresh
        refreshTokenPromise = (async () => {
          try {
            // Le refresh token est maintenant dans un cookie httpOnly, pas besoin de le passer dans le body
            // IMPORTANT: Utiliser axios directement pour éviter que l'intercepteur ne déclenche un autre refresh
            // (ce qui créerait une boucle infinie si le refresh échoue)
            const axiosInstance = axios.create({
              baseURL: API_BASE_URL,
              headers: {
                'Content-Type': 'application/json',
              },
              timeout: 30000,
              withCredentials: true,
            })
            const response = await axiosInstance.post(
              '/api/v1/auth/refresh',
              {} // Body vide, le cookie est envoyé automatiquement avec withCredentials
            )

            const { access_token } = response.data
            localStorage.setItem('access_token', access_token)
            return access_token
          } finally {
            // Nettoyer la Promise après utilisation (succès ou échec)
            refreshTokenPromise = null
          }
        })()

        const newAccessToken = await refreshTokenPromise

        // Réessayer la requête originale avec le nouveau token
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
        }
        return apiClient(originalRequest)
      } catch (refreshError) {
        // Échec du rafraîchissement, nettoyer et déconnexion
        refreshTokenPromise = null
        localStorage.removeItem('access_token')
        // Le refresh_token est dans un cookie, on ne peut pas le supprimer côté client
        // Le serveur le supprimera lors de la redirection vers /login
        // Ne pas rediriger automatiquement, laisser l'app gérer
        return Promise.reject(refreshError)
      }
    }

    // Pour les erreurs de connexion (ERR_CONNECTION_REFUSED), logger seulement en dev
    if (error.code === 'ERR_NETWORK' || error.code === 'ECONNREFUSED') {
      if (import.meta.env.DEV) {
        console.warn('[API Client] Erreur de connexion:', error.message)
      }
    }

    return Promise.reject(error)
  }
)

export default apiClient

