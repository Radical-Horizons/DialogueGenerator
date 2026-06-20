/**
 * Zone titre / retour / sélecteur dialogue du header graphe (Story 17.9).
 */
import { theme } from '../../theme'
import type { GraphToolbarTitleBlockProps } from './graphToolbarTypes'
import { GraphToolbarUndoRedoButtons } from './GraphToolbarUndoRedoButtons'

export type { GraphToolbarTitleBlockProps }

export function GraphToolbarTitleBlock({
  isNarrowToolbar,
  headerSelector,
  isStandalone,
  onBack,
  chrome,
  chromeStyles,
  canEditGraph,
  canUndoNow,
  canRedoNow,
  undo,
  redo,
  hasActiveDialogue,
  showSearchBar,
  setShowSearchBar,
  setHighlightedNodes,
}: GraphToolbarTitleBlockProps) {
  const { effectiveButtonPadding, effectiveButtonFontSizeRem } = chromeStyles

  return (
    <div
      data-testid="graph-toolbar-top-left"
      style={{
        gridArea: isNarrowToolbar ? 'header' : undefined,
        display: 'flex',
        flexDirection: isNarrowToolbar ? 'column' : 'row',
        alignItems: isNarrowToolbar ? 'stretch' : 'center',
        justifyContent: isNarrowToolbar ? 'flex-start' : 'space-between',
        gap: `${chrome.groupGapRem}rem`,
        minWidth: 0,
      }}
    >
      {isNarrowToolbar ? (
        <>
          {headerSelector && (
            <div data-testid="graph-editor-header-selector" style={{ width: '100%', minWidth: 0 }}>
              {headerSelector}
            </div>
          )}
        </>
      ) : (
        <>
          {((isStandalone && onBack) || headerSelector) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
              {isStandalone && onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  style={{
                    padding: '0.45rem 0.8rem',
                    border: `1px solid ${theme.border.primary}`,
                    borderRadius: '6px',
                    backgroundColor: theme.button.default.background,
                    color: theme.button.default.color,
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ← Retour
                </button>
              )}
              {headerSelector && (
                <div data-testid="graph-editor-header-selector" style={{ minWidth: 0 }}>
                  {headerSelector}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: `${chrome.groupGapRem}rem`, alignItems: 'center' }}>
            {canEditGraph && (
              <GraphToolbarUndoRedoButtons
                variant="comfort-icon"
                chrome={chrome}
                chromeStyles={chromeStyles}
                canUndoNow={canUndoNow}
                canRedoNow={canRedoNow}
                undo={undo}
                redo={redo}
              />
            )}
            <button
                type="button"
                data-testid="btn-search-graph"
                onClick={() =>
                  setShowSearchBar((v) => {
                    if (v) setHighlightedNodes([])
                    return !v
                  })
                }
                disabled={!hasActiveDialogue}
                style={{
                  ...chromeStyles.graphChromeTouch,
                  padding: effectiveButtonPadding,
                  border: `1px solid ${
                    showSearchBar ? theme.button.primary.background : theme.border.primary
                  }`,
                  borderRadius: '6px',
                  backgroundColor: showSearchBar
                    ? theme.button.primary.background
                    : theme.button.default.background,
                  color: showSearchBar ? theme.button.primary.color : theme.button.default.color,
                  cursor: !hasActiveDialogue ? 'not-allowed' : 'pointer',
                  opacity: !hasActiveDialogue ? 0.6 : 1,
                  fontSize: `${effectiveButtonFontSizeRem}rem`,
                }}
                title="Rechercher dans le graphe (Ctrl+F)"
                aria-label="Rechercher"
              >
                🔍
              </button>
          </div>
        </>
      )}
    </div>
  )
}
