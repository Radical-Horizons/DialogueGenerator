/**
 * Composant de dialogue de confirmation réutilisable.
 */
import { theme } from '../../theme'

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

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          confirmBg: theme.state.error.background,
          confirmColor: theme.state.error.color,
          borderColor: theme.state.error.border,
        }
      case 'warning':
        return {
          confirmBg: '#3a3a1a',
          confirmColor: '#ffd43b',
          borderColor: '#ffd43b',
        }
      case 'info':
      default:
        return {
          confirmBg: theme.button.primary.background,
          confirmColor: theme.button.primary.color,
          borderColor: theme.border.focus,
        }
    }
  }

  const variantStyles = getVariantStyles()

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
          backgroundColor: theme.background.panel,
          borderRadius: '8px',
          padding: '1.5rem',
          maxWidth: '500px',
          width: '90%',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          border: `1px solid ${variantStyles.borderColor}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, marginBottom: '1rem', color: theme.text.primary }}>
          {title}
        </h2>
        <p style={{ marginBottom: '1.5rem', color: theme.text.secondary, lineHeight: 1.6 }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            data-testid="confirm-dialog-cancel"
            onClick={onCancel}
            style={{
              padding: '0.5rem 1rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '4px',
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              cursor: 'pointer',
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            data-testid="confirm-dialog-confirm"
            onClick={onConfirm}
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: variantStyles.confirmBg,
              color: variantStyles.confirmColor,
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
