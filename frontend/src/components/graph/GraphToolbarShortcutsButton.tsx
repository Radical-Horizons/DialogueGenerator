/** Bouton d'aide et infobulle portée des raccourcis clavier du graphe (Story 17.9). */
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { theme } from '../../theme'
import { NODE_DRAG_TOOLTIP } from './nodeDragTooltip'
import {
  GRAPH_SHORTCUTS_TOOLTIP_ESTIMATE_WIDTH_PX,
  GRAPH_SHORTCUTS_TOOLTIP_GAP_PX,
  GRAPH_SHORTCUTS_TOOLTIP_Z,
} from './graphToolbarConstants'
import type { GraphToolbarToolsRowProps } from './graphToolbarTypes'

export function GraphToolbarShortcutsButton({
  isNarrowToolbar,
  chrome,
  chromeStyles,
  showShortcutsTooltip,
  setShowShortcutsTooltip,
}: Pick<
  GraphToolbarToolsRowProps,
  'isNarrowToolbar' | 'chrome' | 'chromeStyles' | 'showShortcutsTooltip' | 'setShowShortcutsTooltip'
>) {
  const { graphChromeTouch, graphChromeTouchNarrow } = chromeStyles
  const shortcutsButtonRef = useRef<HTMLButtonElement>(null)
  const hideShortcutsTooltipTimeoutRef = useRef<number | null>(null)
  const [shortcutsTooltipPos, setShortcutsTooltipPos] = useState<{
    top: number
    left: number
  } | null>(null)

  const clearHideShortcutsTooltip = useCallback(() => {
    if (hideShortcutsTooltipTimeoutRef.current != null) {
      window.clearTimeout(hideShortcutsTooltipTimeoutRef.current)
      hideShortcutsTooltipTimeoutRef.current = null
    }
  }, [])

  const scheduleHideShortcutsTooltip = useCallback(() => {
    clearHideShortcutsTooltip()
    hideShortcutsTooltipTimeoutRef.current = window.setTimeout(() => {
      setShowShortcutsTooltip(false)
      hideShortcutsTooltipTimeoutRef.current = null
    }, 200)
  }, [clearHideShortcutsTooltip, setShowShortcutsTooltip])

  const updateShortcutsTooltipPos = useCallback(() => {
    const el = shortcutsButtonRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth
    let left = r.right + GRAPH_SHORTCUTS_TOOLTIP_GAP_PX
    if (left + GRAPH_SHORTCUTS_TOOLTIP_ESTIMATE_WIDTH_PX > vw - 8) {
      left = Math.max(
        8,
        r.left - GRAPH_SHORTCUTS_TOOLTIP_ESTIMATE_WIDTH_PX - GRAPH_SHORTCUTS_TOOLTIP_GAP_PX
      )
    }
    setShortcutsTooltipPos({ top: r.top, left })
  }, [])

  useLayoutEffect(() => {
    if (!showShortcutsTooltip) {
      setShortcutsTooltipPos(null)
      return
    }
    updateShortcutsTooltipPos()
    const onReposition = () => {
      updateShortcutsTooltipPos()
    }
    window.addEventListener('scroll', onReposition, true)
    window.addEventListener('resize', onReposition)
    return () => {
      window.removeEventListener('scroll', onReposition, true)
      window.removeEventListener('resize', onReposition)
    }
  }, [showShortcutsTooltip, updateShortcutsTooltipPos])

  useLayoutEffect(() => {
    return () => clearHideShortcutsTooltip()
  }, [clearHideShortcutsTooltip])

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={shortcutsButtonRef}
        type="button"
        onMouseEnter={() => {
          clearHideShortcutsTooltip()
          setShowShortcutsTooltip(true)
        }}
        onMouseLeave={() => scheduleHideShortcutsTooltip()}
        style={{
          ...(isNarrowToolbar ? graphChromeTouchNarrow : graphChromeTouch),
          ...(isNarrowToolbar
            ? {
                padding: chrome.buttonPadding,
                borderRadius: '6px',
                fontSize: `${chrome.buttonFontSizeRem}rem`,
              }
            : {
                width: chrome.touchMinPx,
                height: chrome.touchMinPx,
                padding: 0,
                borderRadius: '50%',
                fontSize: '0.95rem',
              }),
          border: `1px solid ${theme.border.primary}`,
          backgroundColor: theme.button.default.background,
          color: theme.text.secondary,
          cursor: 'pointer',
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title="Raccourcis du graphe"
        aria-describedby={showShortcutsTooltip ? 'graph-shortcuts-tooltip' : undefined}
      >
        {isNarrowToolbar ? 'Aide' : '?'}
      </button>
      {showShortcutsTooltip &&
        shortcutsTooltipPos &&
        createPortal(
          <div
            id="graph-shortcuts-tooltip"
            role="tooltip"
            style={{
              position: 'fixed',
              top: shortcutsTooltipPos.top,
              left: shortcutsTooltipPos.left,
              padding: '0.75rem 1rem',
              minWidth: '240px',
              maxWidth: 'min(320px, 90vw)',
              backgroundColor: theme.background.tertiary,
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '8px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
              fontSize: '0.8rem',
              color: theme.text.primary,
              zIndex: GRAPH_SHORTCUTS_TOOLTIP_Z,
              lineHeight: 1.6,
              pointerEvents: 'auto',
            }}
            onMouseEnter={() => {
              clearHideShortcutsTooltip()
              setShowShortcutsTooltip(true)
            }}
            onMouseLeave={() => scheduleHideShortcutsTooltip()}
          >
            <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Raccourcis graphe</div>
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              <li>
                <kbd
                  style={{
                    padding: '0.1rem 0.35rem',
                    background: theme.background.panel,
                    borderRadius: 4,
                  }}
                >
                  Clic droit
                </kbd>{' '}
                sur un nœud : menu (Générer, Voir le prompt, Dupliquer, Supprimer)
              </li>
              <li style={{ whiteSpace: 'normal' }}>{NODE_DRAG_TOOLTIP}</li>
              <li>
                <kbd style={{ padding: '0.1rem 0.35rem', background: theme.background.panel, borderRadius: 4 }}>
                  Ctrl+F
                </kbd>{' '}
                : rechercher dans le graphe
              </li>
              <li>
                <kbd style={{ padding: '0.1rem 0.35rem', background: theme.background.panel, borderRadius: 4 }}>
                  Ctrl+Shift+F
                </kbd>{' '}
                : filtres du graphe (types, speakers)
              </li>
              <li>
                <kbd style={{ padding: '0.1rem 0.35rem', background: theme.background.panel, borderRadius: 4 }}>
                  Ctrl+J
                </kbd>{' '}
                : aller à un nœud (Jump to Node)
              </li>
              <li>
                <kbd style={{ padding: '0.1rem 0.35rem', background: theme.background.panel, borderRadius: 4 }}>
                  Ctrl+G
                </kbd>{' '}
                : ouvrir la génération IA
              </li>
              <li>
                <kbd style={{ padding: '0.1rem 0.35rem', background: theme.background.panel, borderRadius: 4 }}>
                  Ctrl+S
                </kbd>{' '}
                : sauvegarder
              </li>
              <li>
                <kbd style={{ padding: '0.1rem 0.35rem', background: theme.background.panel, borderRadius: 4 }}>
                  Suppr
                </kbd>{' '}
                : supprimer le nœud sélectionné ; sur une connexion (edge) : confirmation puis suppression
              </li>
              <li>
                <kbd style={{ padding: '0.1rem 0.35rem', background: theme.background.panel, borderRadius: 4 }}>
                  Ctrl+0
                </kbd>{' '}
                : Fit View (tout le graphe visible)
              </li>
              <li>
                <kbd style={{ padding: '0.1rem 0.35rem', background: theme.background.panel, borderRadius: 4 }}>
                  Flèches
                </kbd>{' '}
                ou{' '}
                <kbd style={{ padding: '0.1rem 0.35rem', background: theme.background.panel, borderRadius: 4 }}>
                  WASD
                </kbd>{' '}
                : pan du graphe
              </li>
              <li>
                <kbd style={{ padding: '0.1rem 0.35rem', background: theme.background.panel, borderRadius: 4 }}>
                  Double-clic
                </kbd>{' '}
                sur un nœud : focus (centrage + zoom)
              </li>
            </ul>
          </div>,
          document.body
        )}
    </div>
  )
}
