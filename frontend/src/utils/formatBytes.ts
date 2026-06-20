/**
 * Formate une taille en octets en libellé lisible (Story 5.5 / FR53).
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `~${bytes} o`
  }
  if (bytes < 1024 * 1024) {
    const ko = bytes / 1024
    const rounded = ko >= 10 ? Math.round(ko) : Math.round(ko * 10) / 10
    return `~${rounded} Ko`
  }
  const mo = bytes / (1024 * 1024)
  const rounded = mo >= 10 ? Math.round(mo) : Math.round(mo * 10) / 10
  return `~${rounded} Mo`
}
