import React from 'react'
import { theme } from '../../theme'

/**
 * Remplace le `<select>` natif du navigateur par un select stylisé :
 * - Flèche native masquée (`appearance: none`)
 * - Indicateur de liste remplacé par un ▼ triangle plein, visuellement distinct
 *   des chevrons ‹ › utilisés dans les rails latéraux du Dashboard.
 */
/** Gouttière réservée au ▼ : `right: 0.45rem` + la glyphe + une respiration. */
const ARROW_GUTTER = '1.6rem'

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
          width: '100%',
          ...style,
          // Après le spread, sinon un `padding: 0` de l'appelant écrase la gouttière
          // et le ▼ se pose sur le texte (vu sur le tri « RÉCENTS » de la liste de
          // dialogues). Un `paddingRight` explicite de l'appelant reste prioritaire.
          paddingRight: style?.paddingRight ?? ARROW_GUTTER,
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
