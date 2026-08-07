/**
 * Boutons undo/redo partagés confort (top-left) et narrow (row-actions) — Story 17.9.
 * Confort (écran 2e) : glyphes ↶/↷ nus, sans bordure — zone tactile FR119 conservée.
 */
import { theme } from '../../theme'
import { redesignText } from '../../theme/redesignTokens'
import type { GraphToolbarChromeStyles, GraphToolbarChromeTokens } from './graphToolbarTypes'

/** Glyphe désactivé de la maquette 2e (plus sombre que l'étiquette standard). */
const DISABLED_GLYPH_COLOR = '#3f3f47'

export interface GraphToolbarUndoRedoButtonsProps {
  variant: 'comfort-icon' | 'narrow-labeled'
  chrome: GraphToolbarChromeTokens
  chromeStyles: GraphToolbarChromeStyles
  canUndoNow: boolean
  canRedoNow: boolean
  undo: () => void
  redo: () => void
}

export function GraphToolbarUndoRedoButtons({
  variant,
  chrome,
  chromeStyles,
  canUndoNow,
  canRedoNow,
  undo,
  redo,
}: GraphToolbarUndoRedoButtonsProps) {
  const { graphChromeTouch, graphChromeTouchNarrow, effectiveButtonFontSizeRem } = chromeStyles
  const isNarrow = variant === 'narrow-labeled'
  const touchStyle = isNarrow ? graphChromeTouchNarrow : graphChromeTouch

  const baseStyle = isNarrow
    ? {
        ...touchStyle,
        padding: chrome.buttonPadding,
        fontSize: `${chrome.buttonFontSizeRem}rem`,
      }
    : {
        ...touchStyle,
        width: chrome.touchMinPx,
        height: chrome.touchMinPx,
        padding: 0,
        fontSize: `${effectiveButtonFontSizeRem}rem`,
      }

  // Chrome par variante : narrow garde ses boutons bordés ; confort passe au glyphe nu (2e).
  const chromeByEnabled = (enabled: boolean) =>
    isNarrow
      ? {
          border: `1px solid ${theme.border.primary}`,
          borderRadius: '6px',
          backgroundColor: theme.button.default.background,
          color: !enabled ? theme.text.secondary : theme.button.default.color,
          opacity: enabled ? 1 : 0.6,
        }
      : {
          border: 'none',
          borderRadius: '5px',
          backgroundColor: 'transparent',
          color: enabled ? redesignText.secondary : DISABLED_GLYPH_COLOR,
          fontSize: '13px',
        }

  return (
    <>
      <button
        type="button"
        data-testid="btn-undo"
        onClick={() => undo()}
        disabled={!canUndoNow}
        style={{
          ...baseStyle,
          ...chromeByEnabled(canUndoNow),
          cursor: canUndoNow ? 'pointer' : 'not-allowed',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title="Annuler (Ctrl+Z)"
        aria-label="Annuler"
      >
        <span aria-hidden>↶</span>
      </button>
      <button
        type="button"
        data-testid="btn-redo"
        onClick={() => redo()}
        disabled={!canRedoNow}
        style={{
          ...baseStyle,
          ...chromeByEnabled(canRedoNow),
          cursor: canRedoNow ? 'pointer' : 'not-allowed',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title="Refaire (Ctrl+Y)"
        aria-label="Refaire"
      >
        <span aria-hidden>↷</span>
      </button>
    </>
  )
}
