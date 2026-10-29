/**
 * Motif visuel unifié pour la sélection dans les listes (GDD, dialogues Unity).
 * Refonte UI : rangée filet + accent latéral au lieu de carte/fond plein.
 */
import type { CSSProperties } from 'react'
import { theme } from '../theme'
import { redesignAccent, redesignHairline } from './redesignTokens'

/**
 * Styles de liste pour état sélectionné vs non sélectionné.
 *
 * @param isSelected - Élément actif dans le flux courant.
 */
export function listItemSelectionStyle(isSelected: boolean): CSSProperties {
  if (isSelected) {
    return {
      backgroundColor: redesignAccent.selectedBg,
      boxShadow: `inset 2px 0 0 ${redesignAccent.base}`,
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

/** Filet séparateur de rangée (remplace `theme.border.primary` sur les listes redessinées). */
export const listRowHairlineBorder = `1px solid ${redesignHairline.standard}`

/** Fond de survol de rangée (remplace `theme.state.hover.background`). */
export const listRowHoverBackground = redesignHairline.rowHover
