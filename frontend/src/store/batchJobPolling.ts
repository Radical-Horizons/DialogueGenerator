/**
 * Polling des jobs batch FR87/FR88 qui survit à un redémarrage serveur.
 *
 * Pendant un déploiement, le backend ne répond plus quelques secondes : sans
 * tolérance, le premier échec réseau arrêtait le polling sur une erreur et le
 * client ne voyait jamais le statut `interrupted` que le serveur relu expose.
 */

/** Échecs consécutifs tolérés (~45 s avec le délai ci-dessous). */
export const MAX_TRANSIENT_POLL_FAILURES = 30
export const TRANSIENT_POLL_DELAY_MS = 1500

/** Panne passagère (serveur absent, 5xx) : on repoll ; 4xx (404 inclus) est définitif. */
export function isTransientPollError(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status
  return status === undefined || status >= 500
}

export function pollErrorMessage(err: unknown, fallback: string): string {
  const status = (err as { response?: { status?: number } })?.response?.status
  if (status === 404) {
    return 'Lot introuvable : expiré ou supprimé côté serveur'
  }
  return err instanceof Error ? err.message : fallback
}
