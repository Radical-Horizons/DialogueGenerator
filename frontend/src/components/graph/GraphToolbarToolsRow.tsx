/**
 * Outils layout, menus Actions/Qualités, raccourcis et rangée narrow actions (Story 17.9).
 */
import type React from 'react'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Badge } from '../shared'
import { theme } from '../../theme'
import { GraphActionsDropdown } from './GraphActionsDropdown'
import { NODE_DRAG_TOOLTIP } from './nodeDragTooltip'
import { GraphToolbarUndoRedoButtons } from './GraphToolbarUndoRedoButtons'
import { useGraphViewStore } from '../../store/graphViewStore'
import {
  GRAPH_SHORTCUTS_TOOLTIP_ESTIMATE_WIDTH_PX,
  GRAPH_SHORTCUTS_TOOLTIP_GAP_PX,
  GRAPH_SHORTCUTS_TOOLTIP_Z,
  GRAPH_TOOLBAR_DROPDOWN_Z_INDEX,
} from './graphToolbarConstants'
import type { GraphToolbarChromeStyles, GraphToolbarChromeTokens } from './graphToolbarTypes'

export interface GraphToolbarToolsRowProps {
  mode: 'comfort-tools' | 'narrow-actions'
  isNarrowToolbar: boolean
  chrome: GraphToolbarChromeTokens
  chromeStyles: GraphToolbarChromeStyles
  canEditGraph: boolean
  hasActiveDialogue: boolean
  isStandalone: boolean
  onBack?: () => void
  canUndoNow: boolean
  canRedoNow: boolean
  undo: () => void
  redo: () => void
  showSearchBar: boolean
  setShowSearchBar: React.Dispatch<React.SetStateAction<boolean>>
  setHighlightedNodes: (ids: string[]) => void
  showAutoLayoutDropdown: boolean
  setShowAutoLayoutDropdown: React.Dispatch<React.SetStateAction<boolean>>
  autoLayoutDropdownRef: React.RefObject<HTMLDivElement>
  layoutDirection: 'TB' | 'LR' | 'BT' | 'RL'
  layoutSpacingMode: 'compact' | 'normal' | 'large'
  setLayoutSpacingMode: (mode: 'compact' | 'normal' | 'large') => void
  handleAutoLayout: (direction: 'TB' | 'LR' | 'BT' | 'RL') => void | Promise<void>
  showActionsDropdown: boolean
  setShowActionsDropdown: React.Dispatch<React.SetStateAction<boolean>>
  actionsDropdownRef: React.RefObject<HTMLDivElement>
  actionsDropdownBtnRef: React.RefObject<HTMLButtonElement>
  showValidationToolsDropdown: boolean
  setShowValidationToolsDropdown: React.Dispatch<React.SetStateAction<boolean>>
  validationToolsDropdownRef: React.RefObject<HTMLDivElement>
  renderActionsMenuItems: () => React.ReactNode
  renderQualityMenuItems: () => React.ReactNode
  showShortcutsTooltip: boolean
  setShowShortcutsTooltip: React.Dispatch<React.SetStateAction<boolean>>
  selectedNodeId: string | null
}

function GraphToolbarFocusNodeButton({
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

function GraphToolbarShortcutsButton({
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

function GraphToolbarLayoutDropdown(props: GraphToolbarToolsRowProps) {
  const {
    isNarrowToolbar,
    chrome,
    chromeStyles,
    canEditGraph,
    showAutoLayoutDropdown,
    setShowAutoLayoutDropdown,
    autoLayoutDropdownRef,
    layoutDirection,
    layoutSpacingMode,
    setLayoutSpacingMode,
    handleAutoLayout,
  } = props
  const { graphChromeTouch, graphChromeTouchNarrow, effectiveButtonPadding, effectiveButtonFontSizeRem } =
    chromeStyles

  return (
    <div ref={autoLayoutDropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => canEditGraph && setShowAutoLayoutDropdown((v) => !v)}
        disabled={!canEditGraph}
        style={{
          ...(isNarrowToolbar ? graphChromeTouchNarrow : graphChromeTouch),
          padding: effectiveButtonPadding,
          border: `1px solid ${theme.border.primary}`,
          borderRadius: '6px',
          backgroundColor: theme.button.default.background,
          color: theme.button.default.color,
          cursor: canEditGraph ? 'pointer' : 'not-allowed',
          opacity: canEditGraph ? 1 : 0.6,
          fontSize: `${effectiveButtonFontSizeRem}rem`,
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          fontWeight: 600,
        }}
        title="Auto-layout (Dagre) — choisir la direction"
        aria-label="Auto-layout (Dagre) — choisir la direction"
      >
        <span aria-hidden>📐</span>
        {!isNarrowToolbar ? (
          <span style={{ textTransform: 'capitalize' }}>
            <Badge variant="neutral" size="sm">
              {layoutSpacingMode}
            </Badge>
          </span>
        ) : (
          <span style={{ textTransform: 'capitalize' }}>{layoutSpacingMode}</span>
        )}
        <span style={{ fontSize: '0.7em', opacity: 0.9 }}>▼</span>
      </button>
      {showAutoLayoutDropdown && (
        <div
          role="listbox"
          aria-label="Direction du layout"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '4px',
            minWidth: '100%',
            padding: '4px 0',
            border: `1px solid ${theme.input.border}`,
            borderRadius: '6px',
            backgroundColor: theme.input.background,
            color: theme.input.color,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            zIndex: GRAPH_TOOLBAR_DROPDOWN_Z_INDEX,
          }}
        >
          <div
            style={{
              padding: '0.4rem 0.75rem 0.25rem',
              fontSize: `${chrome.chipFontSizeRem}rem`,
              fontWeight: 700,
              color: theme.text.secondary,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Espacement
          </div>
          {(
            [
              { value: 'compact' as const, label: 'Compact' },
              { value: 'normal' as const, label: 'Normal' },
              { value: 'large' as const, label: 'Large' },
            ] as const
          ).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="option"
              aria-selected={layoutSpacingMode === value}
              onClick={() => {
                setLayoutSpacingMode(value)
                void handleAutoLayout(layoutDirection)
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: chrome.dropdownItemPadding,
                border: 'none',
                background:
                  layoutSpacingMode === value ? theme.button.default.background : 'transparent',
                color: theme.input.color,
                textAlign: 'left',
                fontSize: `${chrome.dropdownItemFontSizeRem}rem`,
                cursor: 'pointer',
              }}
            >
              {label}
              {layoutSpacingMode === value ? ' ✓' : ''}
            </button>
          ))}
          <div style={{ margin: '0.25rem 0', borderTop: `1px solid ${theme.border.primary}` }} />
          <div
            style={{
              padding: '0.15rem 0.75rem 0.25rem',
              fontSize: `${chrome.chipFontSizeRem}rem`,
              fontWeight: 700,
              color: theme.text.secondary,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Direction
          </div>
          {(
            [
              { value: 'TB' as const, label: 'TB (Haut-Bas)' },
              { value: 'LR' as const, label: 'LR (Gauche-Droite)' },
              { value: 'BT' as const, label: 'BT (Bas-Haut)' },
              { value: 'RL' as const, label: 'RL (Droite-Gauche)' },
            ] as const
          ).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="option"
              aria-selected={layoutDirection === value}
              onClick={() => {
                setShowAutoLayoutDropdown(false)
                void handleAutoLayout(value)
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: chrome.dropdownItemPadding,
                border: 'none',
                background:
                  layoutDirection === value ? theme.button.default.background : 'transparent',
                color: theme.input.color,
                textAlign: 'left',
                fontSize: `${chrome.dropdownItemFontSizeRem}rem`,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function GraphToolbarQualityDropdown(props: GraphToolbarToolsRowProps) {
  const {
    isNarrowToolbar: isNarrow,
    canEditGraph,
    chrome,
    chromeStyles,
    validationToolsDropdownRef,
    showValidationToolsDropdown,
    setShowValidationToolsDropdown,
    renderQualityMenuItems,
  } = props
  const { graphChromeTouch, graphChromeTouchNarrow, effectiveButtonPadding, effectiveButtonFontSizeRem } =
    chromeStyles

  return (
    <GraphActionsDropdown
      canEditGraph={canEditGraph}
      isNarrow={isNarrow}
      graphChromeTouch={isNarrow ? graphChromeTouchNarrow : graphChromeTouch}
      buttonPadding={isNarrow ? chrome.buttonPadding : effectiveButtonPadding}
      buttonFontSizeRem={isNarrow ? chrome.buttonFontSizeRem : effectiveButtonFontSizeRem}
      groupGapRem={chrome.groupGapRem}
      actionsDropdownRef={validationToolsDropdownRef}
      showActionsDropdown={showValidationToolsDropdown}
      setShowActionsDropdown={setShowValidationToolsDropdown}
      renderMenuItems={renderQualityMenuItems}
      dropdownLabel="Qualités"
      dropdownTestId="btn-quality-dropdown"
      dropdownTitle="Outils qualité et validation du dialogue"
    />
  )
}

/** Groupe layout + dropdowns + raccourcis (confort ou embarqué narrow status row). */
export function GraphToolbarToolsGroup(props: GraphToolbarToolsRowProps) {
  const {
    isNarrowToolbar,
    chrome,
    chromeStyles,
    canEditGraph,
    showActionsDropdown,
    setShowActionsDropdown,
    actionsDropdownRef,
    actionsDropdownBtnRef,
    renderActionsMenuItems,
    showShortcutsTooltip,
    setShowShortcutsTooltip,
    selectedNodeId,
    hasActiveDialogue,
  } = props
  const { graphChromeTouch, effectiveButtonPadding, effectiveButtonFontSizeRem } = chromeStyles

  return (
    <>
      <GraphToolbarLayoutDropdown {...props} />
      <GraphToolbarFocusNodeButton
        isNarrowToolbar={isNarrowToolbar}
        chromeStyles={chromeStyles}
        selectedNodeId={selectedNodeId}
        hasActiveDialogue={hasActiveDialogue}
      />
      {!isNarrowToolbar && (
        <GraphActionsDropdown
          canEditGraph={canEditGraph}
          isNarrow={false}
          graphChromeTouch={graphChromeTouch}
          buttonPadding={effectiveButtonPadding}
          buttonFontSizeRem={effectiveButtonFontSizeRem}
          groupGapRem={chrome.groupGapRem}
          actionsDropdownRef={actionsDropdownRef}
          actionsDropdownBtnRef={actionsDropdownBtnRef}
          showActionsDropdown={showActionsDropdown}
          setShowActionsDropdown={setShowActionsDropdown}
          renderMenuItems={renderActionsMenuItems}
        />
      )}
      {!isNarrowToolbar && <GraphToolbarQualityDropdown {...props} />}
      <GraphToolbarShortcutsButton
        isNarrowToolbar={isNarrowToolbar}
        chrome={chrome}
        chromeStyles={chromeStyles}
        showShortcutsTooltip={showShortcutsTooltip}
        setShowShortcutsTooltip={setShowShortcutsTooltip}
      />
    </>
  )
}

/** Rangée actions narrow ou groupe outils confort. */
export function GraphToolbarToolsRow(props: GraphToolbarToolsRowProps) {
  const {
    mode,
    chrome,
    chromeStyles,
    canEditGraph,
    hasActiveDialogue,
    isStandalone,
    onBack,
    canUndoNow,
    canRedoNow,
    undo,
    redo,
    showSearchBar,
    setShowSearchBar,
    setHighlightedNodes,
    showActionsDropdown,
    setShowActionsDropdown,
    actionsDropdownRef,
    actionsDropdownBtnRef,
    renderActionsMenuItems,
  } = props
  const { graphChromeTouchNarrow } = chromeStyles

  if (mode === 'narrow-actions') {
    return (
      <div
        data-testid="graph-toolbar-row-actions"
        style={{
          display: 'flex',
          gap: `${chrome.groupGapRem}rem`,
          alignItems: 'center',
          justifyContent: 'flex-start',
          flexWrap: 'wrap',
          minWidth: 0,
        }}
      >
        {isStandalone && onBack && (
          <button
            type="button"
            onClick={onBack}
            style={{
              ...graphChromeTouchNarrow,
              padding: chrome.buttonPadding,
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '6px',
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              cursor: 'pointer',
              fontSize: `${chrome.buttonFontSizeRem}rem`,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
            aria-label="Retour"
            title="Retour"
          >
            <span aria-hidden>←</span>
            Retour
          </button>
        )}
        {canEditGraph && (
          <GraphToolbarUndoRedoButtons
            variant="narrow-labeled"
            chrome={chrome}
            chromeStyles={chromeStyles}
            canUndoNow={canUndoNow}
            canRedoNow={canRedoNow}
            undo={undo}
            redo={redo}
          />
        )}
        {!showSearchBar && (
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
              ...graphChromeTouchNarrow,
              padding: chrome.buttonPadding,
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '6px',
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              cursor: !hasActiveDialogue ? 'not-allowed' : 'pointer',
              opacity: !hasActiveDialogue ? 0.6 : 1,
              fontSize: `${chrome.buttonFontSizeRem}rem`,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
            title="Rechercher dans le graphe (Ctrl+F)"
            aria-label="Rechercher"
          >
            <span aria-hidden>🔍</span>
            Recherche
          </button>
        )}
        <GraphToolbarFocusNodeButton
          isNarrowToolbar
          chromeStyles={chromeStyles}
          selectedNodeId={props.selectedNodeId}
          hasActiveDialogue={hasActiveDialogue}
        />
        <GraphActionsDropdown
          canEditGraph={canEditGraph}
          isNarrow={false}
          graphChromeTouch={graphChromeTouchNarrow}
          buttonPadding={chrome.buttonPadding}
          buttonFontSizeRem={chrome.buttonFontSizeRem}
          groupGapRem={chrome.groupGapRem}
          actionsDropdownRef={actionsDropdownRef}
          actionsDropdownBtnRef={actionsDropdownBtnRef}
          showActionsDropdown={showActionsDropdown}
          setShowActionsDropdown={setShowActionsDropdown}
          renderMenuItems={renderActionsMenuItems}
        />
        <GraphToolbarQualityDropdown {...props} />
      </div>
    )
  }

  return <GraphToolbarToolsGroup {...props} />
}
