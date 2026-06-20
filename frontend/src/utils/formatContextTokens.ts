/**
 * Formatage d'affichage des tokens contexte GDD (~1000 tokens de précision).
 */

/**
 * Arrondit au millier le plus proche pour l'affichage compact.
 */
export function roundContextTokensForDisplay(tokens: number): number {
  if (tokens < 1000) return tokens
  return Math.round(tokens / 1000) * 1000
}

/**
 * Chaîne localisée avec préfixe ~ quand l'arrondi s'applique.
 */
export function formatContextTokensApprox(tokens: number): string {
  if (tokens < 1000) return tokens.toLocaleString()
  const rounded = roundContextTokensForDisplay(tokens)
  return `~${rounded.toLocaleString()}`
}
