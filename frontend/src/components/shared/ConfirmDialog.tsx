/**
 * Composant de dialogue de confirmation réutilisable.
 */
import { theme } from '../../theme'
import {
  redesignHairline,
  redesignRadius,
  redesignSpacing,
  redesignText,
} from '../../theme/redesignTokens'

export interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  variant?: 'danger' | 'warning' | 'info'
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  onConfirm,
  onCancel,
  variant = 'warning',
}: ConfirmDialogProps) {
  if (!isOpen) return null

  // La confirmation est l'unique bouton plein du dialogue ; seule une action destructive
  // change sa teinte.
  const isDanger = variant === 'danger'
  const confirmBg = isDanger ? theme.state.error.border : theme.button.primary.background

  const buttonBase: React.CSSProperties = {
    height: 32,
    padding: `0 ${redesignSpacing.md}px`,
    borderRadius: `${redesignRadius.control}px`,
    fontSize: '13px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }

  return (
    <div
      data-testid="confirm-dialog"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10001,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: theme.background.elevated,
          border: `1px solid ${redesignHairline.strong}`,
          borderRadius: `${redesignRadius.frame}px`,
          padding: `${redesignSpacing.lg}px`,
          maxWidth: '500px',
          width: '90%',
          boxSizing: 'border-box',
          boxShadow: theme.shadow.card,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            margin: `0 0 ${redesignSpacing.sm}px`,
            fontSize: '15px',
            fontWeight: 600,
            color: redesignText.strong,
          }}
        >
          {title}
        </h2>
        <p
          style={{
            margin: `0 0 ${redesignSpacing.lg}px`,
            fontSize: '13px',
            lineHeight: 1.6,
            color: redesignText.body,
          }}
        >
          {message}
        </p>
        <div style={{ display: 'flex', gap: `${redesignSpacing.sm}px`, justifyContent: 'flex-end' }}>
          <button
            type="button"
            data-testid="confirm-dialog-cancel"
            onClick={onCancel}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = redesignHairline.rowHover
              e.currentTarget.style.borderColor = theme.button.default.hover.border
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.borderColor = theme.button.default.border
            }}
            style={{
              ...buttonBase,
              border: `1px solid ${theme.button.default.border}`,
              backgroundColor: 'transparent',
              color: redesignText.body,
              fontWeight: 500,
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            data-testid="confirm-dialog-confirm"
            onClick={onConfirm}
            onMouseEnter={(e) => {
              if (!isDanger) e.currentTarget.style.backgroundColor = theme.button.primary.hover.background
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = confirmBg
            }}
            style={{
              ...buttonBase,
              border: `1px solid ${confirmBg}`,
              backgroundColor: confirmBg,
              color: theme.button.primary.color,
              fontWeight: 600,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
