/**
 * Zone titre / retour / sélecteur dialogue du header graphe (Story 17.9).
 * Confort (écran 2e) : sélecteur + compteurs mono `N NŒUDS · M LIENS`,
 * séparateur vertical, undo/redo nus. La recherche vit dans la rangée outils.
 */
import { theme } from '../../theme'
import { redesignFont, redesignHairline, redesignText } from '../../theme/redesignTokens'
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
  nodeCount,
  edgeCount,
}: GraphToolbarTitleBlockProps) {
  const hasCounts = typeof nodeCount === 'number' && typeof edgeCount === 'number'

  return (
    <div
      data-testid="graph-toolbar-top-left"
      style={{
        gridArea: isNarrowToolbar ? 'header' : undefined,
        display: 'flex',
        flexDirection: isNarrowToolbar ? 'column' : 'row',
        alignItems: isNarrowToolbar ? 'stretch' : 'center',
        justifyContent: 'flex-start',
        gap: isNarrowToolbar ? `${chrome.groupGapRem}rem` : 14,
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
          {((isStandalone && onBack) || headerSelector || hasCounts) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                minWidth: 0,
                flexShrink: 0,
              }}
            >
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
              {hasCounts && (
                <span
                  data-testid="graph-toolbar-counts"
                  style={{
                    fontFamily: redesignFont.mono,
                    fontSize: '10.5px',
                    color: redesignText.label,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {nodeCount} {nodeCount === 1 ? 'NŒUD' : 'NŒUDS'} · {edgeCount}{' '}
                  {edgeCount === 1 ? 'LIEN' : 'LIENS'}
                </span>
              )}
            </div>
          )}

          {/* Séparateur vertical de la maquette 2e. */}
          <span
            aria-hidden
            style={{
              width: 1,
              height: 20,
              background: redesignHairline.strong,
              flexShrink: 0,
            }}
          />

          {canEditGraph && (
            <div style={{ display: 'flex', gap: 2, alignItems: 'center', flexShrink: 0 }}>
              <GraphToolbarUndoRedoButtons
                variant="comfort-icon"
                chrome={chrome}
                chromeStyles={chromeStyles}
                canUndoNow={canUndoNow}
                canRedoNow={canRedoNow}
                undo={undo}
                redo={redo}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
