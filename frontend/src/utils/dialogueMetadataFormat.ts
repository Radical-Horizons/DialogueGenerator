/** Formate un coût LLM en euros avec une précision adaptée aux petits montants. */
export function formatCostEur(costEur: number): string {
  if (costEur < 0.001) return `${(costEur * 100).toFixed(4)}¢`
  return `${costEur.toFixed(2)}€`
}

/** Formate un horodatage ISO en durée relative compacte française. */
export function formatRelativeTime(isoTimestamp: string, now = Date.now()): string {
  const timestamp = new Date(isoTimestamp).getTime()
  if (!Number.isFinite(timestamp)) return 'à une date inconnue'
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (seconds < 5) return "à l'instant"
  if (seconds < 60) return `il y a ${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `il y a ${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours}h`
  return `il y a ${Math.floor(hours / 24)}j`
}
