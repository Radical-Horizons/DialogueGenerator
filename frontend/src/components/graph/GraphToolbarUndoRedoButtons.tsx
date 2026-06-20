/**
 * Boutons undo/redo partagés confort (top-left) et narrow (row-actions) — Story 17.9.
 */
import { theme } from '../../theme'
import type { GraphToolbarChromeStyles, GraphToolbarChromeTokens } from './graphToolbarTypes'

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

  return (
    <>
      <button
        type="button"
        data-testid="btn-undo"
        onClick={() => undo()}
        disabled={!canUndoNow}
        style={{
          ...baseStyle,
          border: `1px solid ${theme.border.primary}`,
          borderRadius: '6px',
          backgroundColor: theme.button.default.background,
          color: !canUndoNow ? theme.text.secondary : theme.button.default.color,
          cursor: canUndoNow ? 'pointer' : 'not-allowed',
          opacity: canUndoNow ? 1 : 0.6,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title="Annuler (Ctrl+Z)"
        aria-label="Annuler"
      >
        <span aria-hidden>↩</span>
      </button>
      <button
        type="button"
        data-testid="btn-redo"
        onClick={() => redo()}
        disabled={!canRedoNow}
        style={{
          ...baseStyle,
          border: `1px solid ${theme.border.primary}`,
          borderRadius: '6px',
          backgroundColor: theme.button.default.background,
          color: !canRedoNow ? theme.text.secondary : theme.button.default.color,
          cursor: canRedoNow ? 'pointer' : 'not-allowed',
          opacity: canRedoNow ? 1 : 0.6,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title="Refaire (Ctrl+Y)"
        aria-label="Refaire"
      >
        <span aria-hidden>↪</span>
      </button>
    </>
  )
}
