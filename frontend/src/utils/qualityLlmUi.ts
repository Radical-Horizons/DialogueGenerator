/**
 * Seuils UX et libellés pour le panneau « Qualité LLM » (FR42).
 * Centralisé pour tests Vitest sans magie dans le JSX.
 */

/** Entrée critère pour dériver suggestions / points forts (AC #3 / #4). */
export interface QualityCriterionBrief {
  label: string
  score: number
  comment: string
}

/** Score global strictement inférieur → bandeau « qualité faible » (AC #3). */
export const QUALITY_LOW_THRESHOLD = 5

/** Score global strictement supérieur → bandeau « qualité excellente » (AC #4). */
export const QUALITY_HIGH_THRESHOLD = 8

/** Rappel variance entre passes (complète `score_variance_note` API si besoin). */
export const SCORE_VARIANCE_SESSION_REMINDER =
  'Entre deux évaluations, un écart de ±1 point sur le score global est normal.'

export type QualityBand = 'low' | 'mid' | 'high'

/**
 * Classe le score global pour l’affichage UX (seuils AC #3 / #4).
 *
 * @param overallScore - Score 0–10 renvoyé par l’API.
 * @returns Bande qualitative.
 */
export function qualityBandForOverallScore(overallScore: number): QualityBand {
  if (overallScore < QUALITY_LOW_THRESHOLD) return 'low'
  if (overallScore > QUALITY_HIGH_THRESHOLD) return 'high'
  return 'mid'
}

const MAX_DERIVED_BULLETS = 5

/**
 * Suggestions affichées en bandeau « qualité faible » : API d’abord, sinon extraits des commentaires critères (AC #3).
 */
export function mergeLowScoreSuggestions(
  apiSuggestions: readonly string[],
  criteria: readonly QualityCriterionBrief[],
): string[] {
  const cleaned = apiSuggestions.map((s) => s.trim()).filter(Boolean)
  if (cleaned.length > 0) return cleaned
  const fromComments = criteria
    .map((c) => {
      const t = c.comment.trim()
      if (!t) return null
      return `${c.label}: ${t}`
    })
    .filter((x): x is string => x != null)
    .slice(0, MAX_DERIVED_BULLETS)
  if (fromComments.length > 0) return fromComments
  return ['Consulter les commentaires par critère ci-dessous pour des pistes de révision.']
}

/**
 * Points forts en bandeau « excellent » : API d’abord, sinon extraits commentaires (scores décroissants) (AC #4).
 */
export function mergeHighScoreStrengths(
  apiStrengths: readonly string[],
  criteria: readonly QualityCriterionBrief[],
): string[] {
  const cleaned = apiStrengths.map((s) => s.trim()).filter(Boolean)
  if (cleaned.length > 0) return cleaned
  const sorted = [...criteria].sort((a, b) => b.score - a.score)
  const fromComments = sorted
    .map((c) => {
      const t = c.comment.trim()
      if (!t) return null
      return `${c.label}: ${t}`
    })
    .filter((x): x is string => x != null)
    .slice(0, MAX_DERIVED_BULLETS)
  if (fromComments.length > 0) return fromComments
  return ['Points forts détaillés dans les scores et commentaires par critère ci-dessous.']
}
