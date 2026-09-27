/**
 * Barre d'actions sticky avec les CTA principaux.
 */
import { theme } from '../../theme'
import {
  redesignFont,
  redesignHairline,
  redesignRadius,
  redesignSpacing,
  redesignText,
} from '../../theme/redesignTokens'

export interface ActionButton {
  id: string
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  icon?: string
  shortcut?: string
}

interface ActionBarProps {
  actions: ActionButton[]
  isDirty?: boolean
  style?: React.CSSProperties
}

export function ActionBar({ actions, isDirty = false, style }: ActionBarProps) {
  const getButtonStyles = (variant: ActionButton['variant'] = 'secondary'): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      height: 30,
      padding: `0 ${redesignSpacing.md}px`,
      borderRadius: `${redesignRadius.control}px`,
      fontSize: '12.5px',
      display: 'inline-flex',
      alignItems: 'center',
      gap: `${redesignSpacing.xs}px`,
      whiteSpace: 'nowrap',
    }

    switch (variant) {
      case 'primary':
        return {
          ...baseStyles,
          border: `1px solid ${theme.button.primary.background}`,
          backgroundColor: theme.button.primary.background,
          color: theme.button.primary.color,
          fontWeight: 600,
        }
      // Destructif sans être l'action principale : contour et libellé d'erreur, pas de remplissage.
      case 'danger':
        return {
          ...baseStyles,
          border: `1px solid ${theme.state.error.border}`,
          backgroundColor: 'transparent',
          color: theme.state.error.color,
          fontWeight: 500,
        }
      case 'secondary':
      default:
        return {
          ...baseStyles,
          border: `1px solid ${theme.button.default.border}`,
          backgroundColor: 'transparent',
          color: redesignText.body,
          fontWeight: 500,
        }
    }
  }

  const setHover = (el: HTMLButtonElement, variant: ActionButton['variant'], hovered: boolean) => {
    if (variant === 'primary') {
      el.style.backgroundColor = hovered
        ? theme.button.primary.hover.background
        : theme.button.primary.background
      return
    }
    el.style.backgroundColor = hovered ? redesignHairline.rowHover : 'transparent'
    if (variant !== 'danger') {
      el.style.borderColor = hovered ? theme.button.default.hover.border : theme.button.default.border
    }
  }

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backgroundColor: theme.background.primary,
        borderBottom: `1px solid ${redesignHairline.standard}`,
        padding: `${redesignSpacing.sm}px ${redesignSpacing.md}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: `${redesignSpacing.sm}px`,
        ...style,
      }}
    >
      <div style={{ display: 'flex', gap: `${redesignSpacing.xs}px`, flexWrap: 'wrap', flex: 1 }}>
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={action.onClick}
            disabled={action.disabled}
            onMouseEnter={(e) => {
              if (!action.disabled) setHover(e.currentTarget, action.variant, true)
            }}
            onMouseLeave={(e) => {
              if (!action.disabled) setHover(e.currentTarget, action.variant, false)
            }}
            style={{
              ...getButtonStyles(action.variant),
              opacity: action.disabled ? 0.6 : 1,
              cursor: action.disabled ? 'not-allowed' : 'pointer',
            }}
            title={action.shortcut ? `${action.label} (${action.shortcut})` : action.label}
          >
            {action.icon && <span>{action.icon}</span>}
            <span>{action.label}</span>
            {action.shortcut && (
              <span
                style={{
                  fontFamily: redesignFont.mono,
                  fontSize: '10.5px',
                  color: action.variant === 'primary' ? 'inherit' : redesignText.muted,
                  opacity: action.variant === 'primary' ? 0.75 : 1,
                  marginLeft: `${redesignSpacing.xs}px`,
                }}
              >
                {action.shortcut}
              </span>
            )}
          </button>
        ))}
      </div>
      {isDirty && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            fontFamily: redesignFont.mono,
            fontSize: '10.5px',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: redesignText.secondary,
            whiteSpace: 'nowrap',
          }}
        >
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: theme.state.pending.border,
              flexShrink: 0,
            }}
          />
          Brouillon non sauvegardé
        </div>
      )}
    </div>
  )
}
