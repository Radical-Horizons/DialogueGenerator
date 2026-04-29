import { theme } from '../theme'
import { uiFontRem } from './uiTypography'

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'error' | 'info'
export type BadgeSize = 'sm' | 'md'

export const badgeTypography = {
  sm: {
    fontSizeRem: uiFontRem.small,
    fontWeight: 600,
    lineHeight: 1.1,
  },
  md: {
    fontSizeRem: uiFontRem.body,
    fontWeight: 600,
    lineHeight: 1.15,
  },
} as const

export const badgeSpacing = {
  sm: {
    padding: '0.28rem 0.5rem',
    radius: '6px',
    gapRem: 0.4,
  },
  md: {
    padding: '0.35rem 0.65rem',
    radius: '8px',
    gapRem: 0.45,
  },
} as const

export const badgeVariantStyles: Record<
  BadgeVariant,
  { backgroundColor: string; color: string; border: string }
> = {
  neutral: {
    backgroundColor: theme.background.panel,
    color: theme.text.secondary,
    border: theme.border.primary,
  },
  success: {
    backgroundColor: theme.state.success.background,
    color: theme.state.success.color,
    border: theme.state.success.color,
  },
  warning: {
    backgroundColor: theme.state.warning.background,
    color: theme.state.warning.color,
    border: theme.state.warning.border ?? theme.state.warning.color,
  },
  error: {
    backgroundColor: theme.state.error.background,
    color: theme.state.error.color,
    border: theme.state.error.border ?? theme.state.error.color,
  },
  info: {
    backgroundColor: theme.state.info.background,
    color: theme.state.info.color,
    border: theme.state.info.color,
  },
} as const

