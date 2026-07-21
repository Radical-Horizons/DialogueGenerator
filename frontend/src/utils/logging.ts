/**
 * Service de logging frontend pour envoyer les logs au backend.
 */
import apiClient from '../api/client'

export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'

export interface LogContext {
  [key: string]: unknown
}

export interface LogOptions {
  level?: LogLevel
  logger?: string
  context?: LogContext
  error?: Error | unknown
}

/**
 * Envoie un log au backend.
 */
async function sendLogToBackend(
  level: LogLevel,
  message: string,
  options: LogOptions = {}
): Promise<void> {
  // Endpoint protégé : sans JWT (boot /login) un POST ne ferait que du bruit 401
  if (!localStorage.getItem('access_token')) {
    return
  }

  try {
    const errorData = options.error
      ? {
          name: options.error instanceof Error ? options.error.name : 'Error',
          message: options.error instanceof Error ? options.error.message : String(options.error),
          stack: options.error instanceof Error ? options.error.stack : undefined,
        }
      : undefined

    await apiClient.post('/api/v1/logs/frontend', {
      level,
      message,
      timestamp: new Date().toISOString(),
      logger: options.logger || 'frontend',
      error: errorData,
      context: options.context,
    })
  } catch (err) {
    // Ne pas logger les erreurs de logging pour éviter les boucles infinies
    // Juste afficher dans la console en développement
    if (import.meta.env.DEV) {
      console.error('[Logging] Erreur lors de l\'envoi du log au backend:', err)
    }
  }
}

/**
 * Logger de base pour le frontend.
 */
class FrontendLogger {
  private loggerName: string

  constructor(loggerName: string = 'frontend') {
    this.loggerName = loggerName
  }

  /**
   * Log un message de niveau DEBUG.
   */
  debug(message: string, options?: LogOptions): void {
    if (import.meta.env.DEV) {
      console.debug(`[${this.loggerName}]`, message, options?.context || '')
    }
    // En production, on n'envoie que les logs importants
    if (!import.meta.env.DEV) {
      sendLogToBackend('DEBUG', message, { ...options, logger: this.loggerName }).catch(() => {
        // Ignorer les erreurs silencieusement
      })
    }
  }

  /**
   * Log un message de niveau INFO.
   */
  info(message: string, options?: LogOptions): void {
    console.info(`[${this.loggerName}]`, message, options?.context || '')
    sendLogToBackend('INFO', message, { ...options, logger: this.loggerName }).catch(() => {
      // Ignorer les erreurs silencieusement
    })
  }

  /**
   * Log un message de niveau WARNING.
   */
  warn(message: string, options?: LogOptions): void {
    console.warn(`[${this.loggerName}]`, message, options?.context || '')
    sendLogToBackend('WARNING', message, { ...options, logger: this.loggerName }).catch(() => {
      // Ignorer les erreurs silencieusement
    })
  }

  /**
   * Log un message de niveau ERROR.
   */
  error(message: string, error?: Error | unknown, options?: LogOptions): void {
    console.error(`[${this.loggerName}]`, message, error, options?.context || '')
    sendLogToBackend('ERROR', message, { ...options, error, logger: this.loggerName }).catch(() => {
      // Ignorer les erreurs silencieusement
    })
  }

  /**
   * Log un message de niveau CRITICAL.
   */
  critical(message: string, error?: Error | unknown, options?: LogOptions): void {
    console.error(`[${this.loggerName}] CRITICAL:`, message, error, options?.context || '')
    sendLogToBackend('CRITICAL', message, { ...options, error, logger: this.loggerName }).catch(() => {
      // Ignorer les erreurs silencieusement
    })
  }
}

/**
 * Logger par défaut pour le frontend.
 */
export const logger = new FrontendLogger('frontend')

/**
 * Crée un logger avec un nom spécifique.
 */
export function createLogger(name: string): FrontendLogger {
  return new FrontendLogger(name)
}

/**
 * Configure le gestionnaire d'erreurs global pour capturer les erreurs non gérées.
 */
export function setupGlobalErrorHandling(): void {
  // Gestionnaire d'erreurs non capturées
  window.addEventListener('error', (event) => {
    logger.error('Erreur JavaScript non capturée', event.error, {
      context: {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        url: window.location.href,
      },
    })
  })

  // Gestionnaire de promesses rejetées non capturées
  window.addEventListener('unhandledrejection', (event) => {
    logger.error('Promesse rejetée non capturée', event.reason, {
      context: {
        url: window.location.href,
      },
    })
  })
}

/**
 * Initialise le système de logging frontend.
 * À appeler au démarrage de l'application.
 */
export function initLogging(): void {
  if (import.meta.env.PROD) {
    setupGlobalErrorHandling()
    logger.info('Système de logging frontend initialisé')
  }
}


