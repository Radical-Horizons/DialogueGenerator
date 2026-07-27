/**
 * Champ mot de passe avec bascule afficher / masquer (icône œil).
 */
import {
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
  type MouseEvent,
} from 'react'
import { theme } from '../../theme'
import { TOUCH_TARGET_MIN_PX } from '../../constants'

export type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Styles du conteneur relatif (autour de l’input + bouton). */
  containerStyle?: CSSProperties
  /** Libellé du bouton quand la valeur est masquée. */
  showLabel?: string
  /** Libellé du bouton quand la valeur est visible. */
  hideLabel?: string
}

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
      {crossed ? <path d="M3 3l18 18" /> : null}
    </svg>
  )
}

/**
 * Input `password` / `text` avec bouton œil pour révéler la valeur.
 */
export function PasswordInput({
  containerStyle,
  style,
  disabled,
  showLabel = 'Afficher en clair',
  hideLabel = 'Masquer',
  ...inputProps
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  const handleToggle = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setVisible((current) => !current)
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        ...containerStyle,
      }}
    >
      <input
        {...inputProps}
        type={visible ? 'text' : 'password'}
        disabled={disabled}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '0.5rem',
          paddingRight: `calc(${TOUCH_TARGET_MIN_PX}px + 0.35rem)`,
          backgroundColor: theme.input.background,
          border: `1px solid ${theme.input.border}`,
          color: theme.input.color,
          ...style,
        }}
      />
      <button
        type="button"
        data-testid="password-visibility-toggle"
        aria-label={visible ? hideLabel : showLabel}
        aria-pressed={visible}
        disabled={disabled}
        onClick={handleToggle}
        tabIndex={0}
        style={{
          position: 'absolute',
          top: '50%',
          right: 0,
          transform: 'translateY(-50%)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: TOUCH_TARGET_MIN_PX,
          height: TOUCH_TARGET_MIN_PX,
          margin: 0,
          padding: 0,
          border: 'none',
          background: 'transparent',
          color: theme.text.secondary,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <EyeIcon crossed={visible} />
      </button>
    </div>
  )
}
