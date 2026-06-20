/**
 * Utilitaires partagés panneaux logs (génération + export).
 */
export type PeriodFilter = 'today' | 'week' | 'month'

export function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function getPeriodRange(period: PeriodFilter): { start_date: string; end_date: string } {
  const end = new Date()
  const end_date = toDateString(end)
  const start = new Date()
  if (period === 'today') {
    start.setHours(0, 0, 0, 0)
    return { start_date: toDateString(start), end_date }
  }
  if (period === 'week') {
    start.setDate(start.getDate() - 7)
    return { start_date: toDateString(start), end_date }
  }
  start.setDate(start.getDate() - 30)
  return { start_date: toDateString(start), end_date }
}

export function formatLogTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return iso
  }
}

/** Escape and quote CSV field per RFC 4180. */
export function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  const escaped = s.replace(/"/g, '""')
  return /[,"\n\r]/.test(escaped) ? `"${escaped}"` : escaped
}

export function downloadLogBlob(
  blob: Blob,
  basename: string,
  format: 'json' | 'csv',
): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${basename}-${new Date().toISOString().slice(0, 10)}.${format}`
  a.click()
  URL.revokeObjectURL(url)
}
