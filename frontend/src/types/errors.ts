/**
 * Types pour la gestion des erreurs API.
 */
import type { AxiosError } from 'axios'

/**
 * Structure d'erreur API standard.
 */
export interface APIErrorResponse {
  error?: {
    message?: string
    details?: unknown
    code?: string
    request_id?: string
  }
}

/**
 * Type d'erreur API avec réponse.
 */
export type APIError = AxiosError<APIErrorResponse>

/**
 * Extrait le message d'erreur d'une erreur API avec détails si disponibles.
 * 
 * Améliore l'affichage des erreurs de validation backend (ValidationException)
 * et des erreurs réseau (backend inaccessible).
 */
export function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const maybe = error as { code?: string; message?: string }
    if (maybe.code === 'ECONNABORTED') {
      return 'Délai d’attente dépassé. La requête a pris trop de temps (sauvegarde volumineuse ou serveur occupé) — réessayez dans un instant.'
    }
    const rawMsg = typeof maybe.message === 'string' ? maybe.message : ''
    if (/timeout of \d+ms exceeded/i.test(rawMsg)) {
      return 'Délai d’attente dépassé. La requête a pris trop de temps (sauvegarde volumineuse ou serveur occupé) — réessayez dans un instant.'
    }
  }
  if (error && typeof error === 'object' && 'response' in error) {
    const axiosError = error as APIError & { code?: string }
    const errorData = axiosError.response?.data?.error
    
    // Gérer les erreurs réseau (backend inaccessible, timeout, etc.)
    if (axiosError.code === 'ERR_NETWORK' || axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ETIMEDOUT') {
      return 'Impossible de se connecter au serveur. Vérifiez que le backend est démarré et accessible.'
    }
    
    const rawData = axiosError.response?.data as Record<string, unknown> | undefined
    const detail = rawData?.detail
    if (detail !== undefined && detail !== null && !errorData) {
      if (typeof detail === 'string') {
        return detail
      }
      if (Array.isArray(detail)) {
        const parts = detail
          .map((item: unknown) =>
            typeof item === 'object' && item !== null && 'msg' in item
              ? String((item as { msg: unknown }).msg)
              : String(item)
          )
          .filter(Boolean)
        if (parts.length > 0) {
          return parts.join('\n')
        }
      }
    }
    const flatMessage = typeof rawData?.message === 'string' ? rawData.message : null
    const validationReport = rawData?.validationReport
    if (flatMessage && Array.isArray(validationReport)) {
      const lines = (validationReport as { message?: string }[])
        .map((row) => row.message)
        .filter((m): m is string => typeof m === 'string' && m.length > 0)
      if (lines.length > 0) {
        return `${flatMessage}\n\n${lines.slice(0, 5).join('\n')}`
      }
      return flatMessage
    }
    if (flatMessage && !errorData) {
      return flatMessage
    }

    if (errorData) {
      let message = errorData.message || axiosError.message || 'Une erreur est survenue'
      
      // Parser les erreurs de validation (ValidationException)
      if (errorData.details) {
        const details = errorData.details as Record<string, unknown>
        
        // Si c'est une erreur de validation Unity, afficher les erreurs de validation
        if (details.validation_errors && Array.isArray(details.validation_errors)) {
          const validationErrors = details.validation_errors as string[]
          if (validationErrors.length > 0) {
            // Prendre les 3 premières erreurs pour éviter un message trop long
            const errorsToShow = validationErrors.slice(0, 3)
            message += '\n\nErreurs de validation:'
            errorsToShow.forEach((err, i) => {
              message += `\n${i + 1}. ${err}`
            })
            if (validationErrors.length > 3) {
              message += `\n... et ${validationErrors.length - 3} autre(s) erreur(s)`
            }
          }
        }
        
        // En développement, ajouter des détails supplémentaires
        const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development'
        if (isDevelopment) {
          // Ajouter le type d'erreur si disponible
          if (details.error_type) {
            message += ` [Type: ${details.error_type}]`
          }
          
          // Ajouter le message d'erreur détaillé si disponible et différent
          if (details.error && typeof details.error === 'string' && details.error !== message) {
            const errorDetail = details.error
            // Limiter la longueur pour éviter des messages trop longs
            if (errorDetail.length < 300) {
              message += ` - ${errorDetail}`
            } else {
              message += ` - ${errorDetail.substring(0, 300)}...`
            }
          }
          
          // Ajouter le code d'erreur si disponible
          if (errorData.code) {
            message += ` [Code: ${errorData.code}]`
          }
        }
      }
      
      return message
    }
    
    // Si pas de réponse (erreur réseau sans code spécifique détecté)
    if (!axiosError.response) {
      // Vérifier si le message contient des indices d'erreur réseau
      const message = axiosError.message || ''
      if (message.toLowerCase().includes('network') || message.toLowerCase().includes('connection')) {
        return 'Erreur de connexion au serveur. Vérifiez que le backend est démarré et accessible.'
      }
    }
    
    return axiosError.message || 'Une erreur est survenue'
  }
  if (error instanceof Error) {
    // Vérifier aussi pour les erreurs Error simples
    const message = error.message || ''
    if (message.toLowerCase().includes('network') || message.toLowerCase().includes('connection')) {
      return 'Erreur de connexion au serveur. Vérifiez que le backend est démarré et accessible.'
    }
    return error.message
  }
  return 'Une erreur est survenue'
}



