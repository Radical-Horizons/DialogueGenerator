import React from 'react'
import { theme } from '../../theme'

/**
 * Remplace le `<select>` natif du navigateur par un select stylisé :
 * - Flèche native masquée (`appearance: none`)
 * - Indicateur de liste remplacé par un ▼ triangle plein, visuellement distinct
 *   des chevrons ‹ › utilisés dans les rails latéraux du Dashboard.
 */
/** Gouttière réservée au ▼ : `right: 0.45rem` + la glyphe + une respiration. */
const ARROW_GUTTER = '1rem'

/**
 * Taille de la flèche ▼, exportée pour que les triggers non-`<select>`
 * (ex. le disclosure « Filtres ▾ » de la liste de dialogues) affichent une
 * flèche de la même taille plutôt que d'improviser leur propre valeur.
 */
export const SELECT_ARROW_FONT_SIZE = '0.54rem'

export function StyledSelect({
  style,
  wrapperStyle,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { wrapperStyle?: React.CSSProperties }) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        width: style?.width ?? '100%',
        // Un enfant flex a `min-width: auto` par défaut : sans ce 0, le
        // wrapper refuse de rétrécir sous la largeur intrinsèque du select
        // (voir plus bas) et peut pousser un sibling (bouton « + » collection…)
        // hors de son conteneur au lieu de passer à la ligne.
        minWidth: 0,
        ...wrapperStyle,
      }}
    >
      <select
        {...props}
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          width: '100%',
          // Même piège flexbox que le wrapper ci-dessus, sur le `<select>`
          // lui-même : sans ce 0, un `<select>` refuse de rétrécir sous la
          // largeur de sa plus longue `<option>` (ex. « Tous les dialogues »).
          minWidth: 0,
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
          fontSize: SELECT_ARROW_FONT_SIZE,
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
