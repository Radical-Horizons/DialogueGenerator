/** Bouton de recentrage sur le nœud sélectionné (Story 17.9) — entrée texte « Nœud » en confort (2e). */
import { useGraphViewStore } from '../../store/graphViewStore'
import { graphToolbarTextEntryStyle } from './graphToolbarTextEntry'
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
  const { graphChromeTouch, graphChromeTouchNarrow } = chromeStyles
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
      style={graphToolbarTextEntryStyle({
        touch: isNarrowToolbar ? graphChromeTouchNarrow : graphChromeTouch,
        disabled,
      })}
      title="Recentrer sur le nœud sélectionné (double-clic sur un nœud)"
      aria-label="Recentrer sur le nœud sélectionné"
    >
      {isNarrowToolbar ? <span aria-hidden>◎</span> : <span>Nœud</span>}
    </button>
  )
}
