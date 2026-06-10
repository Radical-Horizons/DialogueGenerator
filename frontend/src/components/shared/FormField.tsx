/**
 * Wrapper pour champs de formulaire avec label/error.
 */
import { ReactNode } from 'react'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'

export interface FormFieldProps {
  label: string
  error?: string
  required?: boolean
  children: ReactNode
  style?: React.CSSProperties
  htmlFor?: string
  labelStyle?: React.CSSProperties
}

export function FormField({
  label,
  error,
  required = false,
  children,
  style,
  htmlFor,
  labelStyle,
}: FormFieldProps) {
  return (
    <div
      style={{
        marginBottom: '1rem',
        ...style,
      }}
    >
      <label
        htmlFor={htmlFor}
        style={{
          display: 'block',
          marginBottom: '0.5rem',
          color: theme.text.primary,
          fontSize: remSize('label'),
          fontWeight: 500,
          ...labelStyle,
        }}
      >
        {label}
        {required && (
          <span style={{ color: theme.state.error.color, marginLeft: '0.25rem' }}>
            *
          </span>
        )}
      </label>
      {children}
      {error && (
        <div
          style={{
            marginTop: '0.25rem',
            fontSize: remSize('accent'),
            color: theme.state.error.color,
          }}
        >
          {error}
        </div>
      )}
    </div>
  )
}



