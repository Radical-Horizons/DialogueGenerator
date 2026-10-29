/**
 * Styles et libellés partagés par les deux vues des options (écran 2b) :
 * la liste à une option dépliée et la grille côte à côte.
 */
import type { CSSProperties } from 'react'
import { theme } from '../../theme'
import {
  redesignAccent,
  redesignControl,
  redesignFont,
  redesignRadius,
  redesignText,
} from '../../theme/redesignTokens'
import type { GenerationOptionSlot } from '../../store/generationOptionsStore'

export const STATUS_LABELS: Record<GenerationOptionSlot['status'], string> = {
  pending: 'EN ATTENTE',
  running: 'EN ÉCRITURE',
  completed: 'PRÊTE',
  error: 'ERREUR',
  cancelled: 'ANNULÉE',
}

export function statusColor(status: GenerationOptionSlot['status'], kept: boolean): string {
  if (kept) return redesignAccent.base
  switch (status) {
    case 'completed':
      return theme.state.accepted.border
    case 'error':
      return theme.state.error.color
    case 'running':
      return redesignAccent.light
    default:
      return redesignText.label
  }
}

export const ghostButtonStyle: CSSProperties = {
  height: 30,
  padding: '0 12px',
  borderRadius: redesignRadius.control,
  border: `1px solid ${redesignControl.border}`,
  background: 'transparent',
  color: redesignText.body,
  cursor: 'pointer',
  fontSize: '12.5px',
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

export const monoLabelStyle: CSSProperties = {
  fontFamily: redesignFont.mono,
  fontSize: '10px',
  letterSpacing: '0.12em',
  color: redesignText.label,
}

/** Bouton plein « Garder » : l'action primaire de l'option retenue (jamais l'accent `base`). */
export function keepButtonStyle(kept: boolean): CSSProperties {
  return {
    ...ghostButtonStyle,
    border: 'none',
    background: kept ? redesignAccent.selectedBg : redesignAccent.fill,
    color: kept ? redesignAccent.light : theme.button.primary.color,
    fontWeight: 600,
    padding: '0 14px',
  }
}
