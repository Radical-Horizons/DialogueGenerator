/**
 * Helpers de période pour le filtre date de la bibliothèque (Story 8.3 / FR82).
 *
 * Distinct de `PeriodFilter` des panneaux de logs : ajoute `all` et `year`
 * (année civile) et renvoie un seuil Date plutôt qu'une plage ISO.
 */

export type DialogueDatePeriod = 'all' | 'today' | 'week' | 'month' | 'year'

export const DIALOGUE_DATE_PERIOD_LABELS: Record<DialogueDatePeriod, string> = {
  all: 'Toutes les dates',
  today: "Aujourd'hui",
  week: '7 derniers jours',
  month: '30 derniers jours',
  year: 'Cette année',
}

/**
 * Retourne le seuil inclusif de création pour un preset, ou `null` si aucun
 * filtre date (`all`).
 *
 * - `today` : début de la journée locale
 * - `week` / `month` : maintenant − 7 / 30 jours
 * - `year` : 1er janvier de l'année civile locale
 */
export function dialogueCreatedAfter(period: DialogueDatePeriod): Date | null {
  if (period === 'all') return null
  const now = new Date()
  if (period === 'today') {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    return start
  }
  if (period === 'week') {
    const start = new Date(now)
    start.setDate(start.getDate() - 7)
    return start
  }
  if (period === 'month') {
    const start = new Date(now)
    start.setDate(start.getDate() - 30)
    return start
  }
  return new Date(now.getFullYear(), 0, 1)
}

/**
 * Indique si un ISO de création/modification est ≥ au seuil de période.
 * ISO invalide → exclu (ne passe pas le filtre).
 */
export function matchesDialogueDatePeriod(
  iso: string | undefined,
  period: DialogueDatePeriod
): boolean {
  const threshold = dialogueCreatedAfter(period)
  if (threshold === null) return true
  if (!iso) return false
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return false
  return ts >= threshold.getTime()
}
