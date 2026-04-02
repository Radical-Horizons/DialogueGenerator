/** Seuil produit : en dessous, afficher l’avertissement « faible utilisation » (Story 3.6). */
export const LOW_CONTEXT_THRESHOLD_PERCENT = 30

export function formatContextScorePercent(score: number): string {
  if (Number.isNaN(score)) return '—'
  return `${Math.round(score)} %`
}
