/**
 * Style des entrées texte de la toolbar graphe une rangée (écran 2e).
 * Visuel : texte 12.5px sans bordure ni fond — mais la zone de clic conserve
 * le minimum tactile FR119 fourni par `touch` (44px confort / 32px narrow).
 */
import type { CSSProperties } from 'react'
import { redesignAccent, redesignText } from '../../theme/redesignTokens'

export interface GraphToolbarTextEntryOptions {
  /** Zone tactile minimale (graphChromeTouch / graphChromeTouchNarrow). */
  touch: CSSProperties
  disabled?: boolean
  /** Entrée active (dropdown ouvert, mode playthrough…) → accent. */
  active?: boolean
  /** Entrée secondaire (aide, recherche) → couleur étiquette. */
  muted?: boolean
}

export function graphToolbarTextEntryStyle({
  touch,
  disabled = false,
  active = false,
  muted = false,
}: GraphToolbarTextEntryOptions): CSSProperties {
  return {
    ...touch,
    padding: '0 2px',
    border: 'none',
    background: 'none',
    fontSize: '12.5px',
    fontWeight: 400,
    color: disabled
      ? redesignText.label
      : active
        ? redesignAccent.base
        : muted
          ? redesignText.secondary
          : redesignText.body,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    whiteSpace: 'nowrap',
  }
}

/** Chevron ▾ des déclencheurs de menu (couleur étiquette, comme la maquette). */
export const graphToolbarChevronStyle: CSSProperties = {
  fontSize: '1.4em',
  color: redesignText.label,
}
