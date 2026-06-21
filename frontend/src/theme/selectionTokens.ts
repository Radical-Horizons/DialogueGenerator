/**
 * Motif visuel unifié pour la sélection dans les listes (GDD, dialogues Unity).
 * Pas d’accent latéral — fond + contraste texte / opacité uniquement.
 */
import type { CSSProperties } from 'react'
import { theme } from '../theme'

/**
 * Styles de liste pour état sélectionné vs non sélectionné.
 *
 * @param isSelected - Élément actif dans le flux courant.
 */
export function listItemSelectionStyle(isSelected: boolean): CSSProperties {
  if (isSelected) {
    return {
      backgroundColor: theme.state.selected.background,
      color: theme.text.primary,
      opacity: 1,
    }
  }
  return {
    backgroundColor: 'transparent',
    color: theme.text.secondary,
    opacity: 0.82,
  }
}
