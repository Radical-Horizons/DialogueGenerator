/**
 * Bandeau d'avertissement pour afficher des notifications non-bloquantes.
 */
import { theme } from '../../theme'
import {
  redesignHairline,
  redesignRadius,
  redesignSpacing,
  redesignText,
} from '../../theme/redesignTokens'

export interface WarningBannerProps {
  message: string
  onAction?: () => void
  actionLabel?: string
  onDismiss?: () => void
  style?: React.CSSProperties
}

export function WarningBanner({
  message,
  onAction,
  actionLabel,
  onDismiss,
  style,
}: WarningBannerProps) {
  return (
    <div
      style={{
        padding: `${redesignSpacing.sm}px ${redesignSpacing.md}px`,
        paddingRight: onDismiss ? `${redesignSpacing.xl}px` : `${redesignSpacing.md}px`,
        // Teinte de `theme.state.warning.color` à faible opacité : un voile, pas un bloc coloré.
        backgroundColor: 'rgba(255, 212, 59, 0.06)',
        border: '1px solid rgba(255, 212, 59, 0.25)',
        borderRadius: `${redesignRadius.control}px`,
        color: redesignText.body,
        fontSize: '13px',
        lineHeight: 1.5,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: `${redesignSpacing.sm}px`,
        marginBottom: `${redesignSpacing.md}px`,
        position: 'relative',
        ...style,
      }}
    >
      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{
            position: 'absolute',
            top: `${redesignSpacing.xs}px`,
            right: `${redesignSpacing.xs}px`,
            padding: `2px ${redesignSpacing.xs}px`,
            border: 'none',
            borderRadius: `${redesignRadius.control}px`,
            backgroundColor: 'transparent',
            color: redesignText.muted,
            cursor: 'pointer',
            fontSize: '16px',
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = redesignHairline.rowHover
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
          title="Fermer"
        >
          ×
        </button>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: `${redesignSpacing.sm}px`, width: '100%' }}>
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: theme.state.warning.color,
            flexShrink: 0,
            marginTop: 7,
          }}
        />
        <span style={{ flex: 1 }}>{message}</span>
      </div>
      {onAction && actionLabel && (
        <button
          onClick={onAction}
          style={{
            alignSelf: 'flex-start',
            height: 30,
            padding: `0 ${redesignSpacing.md}px`,
            border: `1px solid ${theme.button.default.border}`,
            borderRadius: `${redesignRadius.control}px`,
            backgroundColor: 'transparent',
            color: redesignText.body,
            cursor: 'pointer',
            fontSize: '12.5px',
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = redesignHairline.rowHover
            e.currentTarget.style.borderColor = theme.button.default.hover.border
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
            e.currentTarget.style.borderColor = theme.button.default.border
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
