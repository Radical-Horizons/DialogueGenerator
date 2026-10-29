/** Bouton bascule du mode playthrough VN (Story 17.9) — entrée texte « Jouer » en confort (2e). */
import { theme } from '../../theme'
import { graphToolbarTextEntryStyle } from './graphToolbarTextEntry'
import type { GraphToolbarChromeStyles } from './graphToolbarTypes'

export function GraphToolbarPlaythroughButton({
  isNarrowToolbar,
  chromeStyles,
  hasActiveDialogue,
  active,
  onToggle,
}: {
  isNarrowToolbar: boolean
  chromeStyles: GraphToolbarChromeStyles
  hasActiveDialogue: boolean
  active: boolean
  onToggle?: () => void
}) {
  const { graphChromeTouch, graphChromeTouchNarrow, effectiveButtonPadding, effectiveButtonFontSizeRem } =
    chromeStyles
  const disabled = !hasActiveDialogue || !onToggle

  return (
    <button
      type="button"
      data-testid="btn-scenario-playthrough"
      aria-pressed={active}
      disabled={disabled}
      onClick={() => onToggle?.()}
      style={
        isNarrowToolbar
          ? {
              ...graphChromeTouchNarrow,
              padding: effectiveButtonPadding,
              border: `2px solid ${active ? theme.border.focus : theme.button.primary.background}`,
              borderRadius: '6px',
              backgroundColor: active
                ? theme.button.selected.background
                : theme.button.primary.background,
              color: theme.button.primary.color,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.55 : 1,
              fontSize: `${effectiveButtonFontSizeRem}rem`,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }
          : graphToolbarTextEntryStyle({ touch: graphChromeTouch, disabled, active })
      }
      title="Jouer le dialogue — preview scénario (P)"
    >
      <span>Jouer</span>
    </button>
  )
}
