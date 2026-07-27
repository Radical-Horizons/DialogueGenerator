/**
 * Styles et formatteurs partagés par le panneau de sync GDD et ses modales.
 */
import type { CSSProperties } from 'react'
import { theme } from '../../theme'

export function formatArchiveLabel(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) {
      return iso
    }
    return d.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

export function formatArchiveSizeBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) {
    return '—'
  }
  if (n === 0) {
    return '0 o'
  }
  const units = ['o', 'Ko', 'Mo', 'Go'] as const
  let i = 0
  let x = n
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024
    i += 1
  }
  const rounded = i === 0 || x >= 10 ? Math.round(x) : Math.round(x * 10) / 10
  return `${rounded} ${units[i]}`
}

export function apiErrorDetail(e: unknown): string {
  if (e && typeof e === 'object' && 'response' in e) {
    const data = (e as { response?: { data?: { detail?: unknown } } }).response?.data
    const d = data?.detail
    if (typeof d === 'string') {
      return d
    }
    if (Array.isArray(d)) {
      const first = d[0] as { msg?: string } | undefined
      if (first && typeof first.msg === 'string') {
        return first.msg
      }
    }
  }
  if (e instanceof Error) {
    return e.message
  }
  return 'Erreur lors de la restauration'
}

export const labelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
  color: theme.text.secondary,
  fontSize: '0.88rem',
}

export const inputStyle: CSSProperties = {
  padding: '0.45rem 0.6rem',
  borderRadius: '4px',
  border: `1px solid ${theme.border.primary}`,
  backgroundColor: theme.background.secondary,
  color: theme.text.primary,
}

export function buttonStyle(disabled: boolean, primary = false): CSSProperties {
  return {
    padding: '0.5rem 1rem',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: disabled
      ? theme.button.default.background
      : primary
        ? theme.button.primary.background
        : theme.button.default.background,
    color: primary ? theme.button.primary.color : theme.text.primary,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    fontWeight: primary ? 'bold' : 'normal',
  }
}
