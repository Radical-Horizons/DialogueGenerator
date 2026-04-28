import React from 'react'
import { theme } from '../../theme'

/**
 * Remplace le `<select>` natif du navigateur par un select stylisé :
 * - Flèche native masquée (`appearance: none`)
 * - Indicateur de liste remplacé par un ▼ triangle plein, visuellement distinct
 *   des chevrons ‹ › utilisés dans les rails latéraux du Dashboard.
 */
export function StyledSelect({
  style,
  wrapperStyle,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { wrapperStyle?: React.CSSProperties }) {
  return (
    <div style={{ position: 'relative', display: 'inline-flex', width: style?.width ?? '100%', ...wrapperStyle }}>
      <select
        {...props}
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          paddingRight: '1.6rem',
          width: '100%',
          ...style,
        }}
      >
        {children}
      </select>
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          right: '0.45rem',
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
          fontSize: '0.5rem',
          lineHeight: 1,
          color: theme.text.secondary,
          userSelect: 'none',
        }}
      >
        ▼
      </span>
    </div>
  )
}
