/** Bouton de recentrage sur le nœud sélectionné (Story 17.9). */
import { theme } from '../../theme'
import { useGraphViewStore } from '../../store/graphViewStore'
import type { GraphToolbarToolsRowProps } from './graphToolbarTypes'

export function GraphToolbarFocusNodeButton({
  isNarrowToolbar,
  chromeStyles,
  selectedNodeId,
  hasActiveDialogue,
}: Pick<
  GraphToolbarToolsRowProps,
  'isNarrowToolbar' | 'chromeStyles' | 'selectedNodeId' | 'hasActiveDialogue'
>) {
  const { graphChromeTouch, graphChromeTouchNarrow, effectiveButtonPadding, effectiveButtonFontSizeRem } =
    chromeStyles
  const disabled = !selectedNodeId || !hasActiveDialogue

  return (
    <button
      type="button"
      data-testid="btn-focus-selected-node"
      disabled={disabled}
      onClick={() => {
        if (selectedNodeId) {
          useGraphViewStore.getState().focusNode(selectedNodeId)
        }
      }}
      style={{
        ...(isNarrowToolbar ? graphChromeTouchNarrow : graphChromeTouch),
        padding: effectiveButtonPadding,
        border: `1px solid ${theme.border.primary}`,
        borderRadius: '6px',
        backgroundColor: theme.button.default.background,
        color: theme.button.default.color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        fontSize: `${effectiveButtonFontSizeRem}rem`,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
      title="Recentrer sur le nœud sélectionné (double-clic sur un nœud)"
      aria-label="Recentrer sur le nœud sélectionné"
    >
      <span aria-hidden>◎</span>
      {!isNarrowToolbar && <span>Nœud</span>}
    </button>
  )
}
