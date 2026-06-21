/**
 * Variantes visuelles champs formulaire (lecture seule vs éditable).
 */
import type { CSSProperties } from 'react'
import { theme } from '../theme'
import { remSize } from './uiTypography'

const baseFieldStyle: CSSProperties = {
  width: '100%',
  padding: '0.5rem',
  borderRadius: 4,
  fontSize: remSize('body'),
  boxSizing: 'border-box',
}

/** Label d'un champ modifiable. */
export function editableFieldLabelStyle(): CSSProperties {
  return {
    display: 'block',
    marginBottom: '0.5rem',
    fontSize: remSize('accent'),
    fontWeight: 600,
    color: theme.text.primary,
  }
}

/** Label d'un champ informatif (lecture seule). */
export function readonlyFieldLabelStyle(): CSSProperties {
  return {
    display: 'block',
    marginBottom: '0.5rem',
    fontSize: remSize('accent'),
    fontWeight: 500,
    color: theme.text.tertiary,
  }
}

/** Input / textarea éditable. */
export function editableFieldInputStyle(): CSSProperties {
  return {
    ...baseFieldStyle,
    border: `1px solid ${theme.border.secondary}`,
    backgroundColor: theme.input.background,
    color: theme.text.primary,
    boxShadow: theme.shadow.cardInset,
  }
}

/** Input lecture seule (métadonnée stable). */
export function readonlyFieldInputStyle(): CSSProperties {
  return {
    ...baseFieldStyle,
    border: `1px dashed ${theme.border.primary}`,
    backgroundColor: theme.background.secondary,
    color: theme.text.tertiary,
    cursor: 'default',
  }
}

/** Zone de texte longue éditable. */
export function editableFieldTextareaStyle(minHeight = '6rem'): CSSProperties {
  return {
    ...editableFieldInputStyle(),
    minHeight,
    resize: 'vertical',
    lineHeight: 1.45,
  }
}
