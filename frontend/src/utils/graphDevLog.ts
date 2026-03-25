/**
 * Logs graphe réservés au développement (évite le bruit console en prod).
 */
export function graphDevWarn(message: string, details?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return
  if (details !== undefined) {
    console.warn(message, details)
    return
  }
  console.warn(message)
}
