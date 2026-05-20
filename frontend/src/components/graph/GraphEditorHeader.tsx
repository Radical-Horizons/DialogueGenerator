/**
 * En-tête de l'éditeur de graphe : barre d'outils complète.
 * Extrait de GraphEditor pour isoler le bloc JSX de la toolbar (~778L).
 * Appelle useGraphStore() en interne pour éviter le prop drilling sur les données du store.
 */
import type React from 'react'
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useGraphStore } from '../../store/graphStore'
import { Badge, SaveStatusIndicator } from '../shared'
import { theme } from '../../theme'
import type { UseGraphToolbarReturn } from '../../hooks/useGraphToolbar'
import { useNarrowInlineSize } from '../../hooks/useNarrowInlineSize'
import { BatchOperationsMenu } from './BatchOperationsMenu'
import { NODE_DRAG_TOOLTIP } from './nodeDragTooltip'
import { GraphSearchBar } from './GraphSearchBar'
import { GraphActionsDropdown } from './GraphActionsDropdown'
import {
  formatGraphWarningBadgeLabel,
  summarizeGraphValidationWarnings,
} from '../../utils/graphValidationSummary'
import {
  GRAPH_TOOLBAR_COMFORT_MIN_WIDTH_PX,
  GRAPH_TOOLBAR_DESKTOP_COMPACT_MAX_WIDTH_PX,
  graphToolbarChrome,
} from '../../theme/responsiveChrome'

/** Offsets pour positionner les nœuds créés manuellement sans chevauchement (Story 1.6). */
const MANUAL_NODE_OFFSET_X = 150
const MANUAL_NODE_OFFSET_Y = 100
const MANUAL_NODE_STEP = 40
/** Pas vertical entre nœuds manuels successifs (plus serré que l’axe X). */
const MANUAL_NODE_STEP_Y = MANUAL_NODE_STEP / 2

/** Au-dessus des modales graphe (10001) : le tooltip est rendu en portail pour éviter le clip du panneau redimensionnable. */
const GRAPH_SHORTCUTS_TOOLTIP_Z = 10050

const GRAPH_SHORTCUTS_TOOLTIP_GAP_PX = 6
const GRAPH_SHORTCUTS_TOOLTIP_ESTIMATE_WIDTH_PX = 320

interface GraphEditorHeaderProps {
  toolbar: UseGraphToolbarReturn
  isLoadingDialogue: boolean
  hasActiveDialogue: boolean
  activeDialogueTitle: string | null
  activeDialogueFilename: string | null
  handleSave: () => Promise<void>
  onBatchTagApply: (tag: string) => void
  handleBatchValidateSelection: () => void
  handleBatchDeleteSelection: () => void
  canEditGraph: boolean
  isStandalone: boolean
  onBack?: () => void
  /**
   * Slot facultatif rendu dans la zone titre du header (Story 17.7).
   * Utilisé en mode narrow pour injecter le sélecteur de dialogue
   * (combobox) à la place de la colonne liste retirée.
   */
  headerSelector?: ReactNode
}

export function GraphEditorHeader({
  toolbar,
  hasActiveDialogue,
  activeDialogueTitle,
  activeDialogueFilename,
  onBatchTagApply,
  handleBatchValidateSelection,
  handleBatchDeleteSelection,
  canEditGraph,
  isStandalone,
  onBack,
  headerSelector,
}: GraphEditorHeaderProps) {
  const {
    nodes,
    edges,
    selectedNodeId,
    selectedNodeIds,
    validationErrors: graphValidationErrors,
    intentionalCycles,
    isSaving: isGraphSaving,
    hasUnsavedChanges,
    lastSaveError,
    lastSavedAt,
    syncStatus,
    lastAckSeq,
    dialogueMetadata,
    createEmptyNode,
    addNode,
    setSelectedNode,
    setHighlightedNodes,
    exportToUnity,
  } = useGraphStore()
  const canUndoNow = useGraphStore((s) => s.undoStack.length > 0)
  const canRedoNow = useGraphStore((s) => s.redoStack.length > 0)

  const handleExportUnity = useCallback(() => {
    const json = exportToUnity()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = dialogueMetadata?.filename
      ? `${dialogueMetadata.filename}.json`
      : 'dialogue.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [dialogueMetadata?.filename, exportToUnity])

  const {
    showAutoLayoutDropdown,
    setShowAutoLayoutDropdown,
    showActionsDropdown,
    setShowActionsDropdown,
    setShowAIGenerationPanel,
    showValidationPanel,
    setShowValidationPanel,
    showCostBreakdown,
    setShowCostBreakdown,
    showShortcutsTooltip,
    setShowShortcutsTooltip,
    showSearchBar,
    setShowSearchBar,
    setShowJumpToNodeModal,
    setShowFiltersPanel,
    layoutDirection,
    layoutSpacingMode,
    setLayoutSpacingMode,
    autoLayoutDropdownRef,
    actionsDropdownRef,
    actionsDropdownBtnRef,
    reactFlowInstance,
    handleAutoLayout,
    handleOpenExportDialog,
    undo,
    redo,
  } = toolbar

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

  const { ref: toolbarRef, isNarrow: isNarrowToolbar } = useNarrowInlineSize(
    GRAPH_TOOLBAR_COMFORT_MIN_WIDTH_PX,
    { measureParentClientWidth: true }
  )
  const { ref: compactRef, isNarrow: isCompactDesktopMeasured } = useNarrowInlineSize(
    GRAPH_TOOLBAR_DESKTOP_COMPACT_MAX_WIDTH_PX,
    { measureParentClientWidth: true }
  )
  const chrome = isNarrowToolbar ? graphToolbarChrome.narrow : graphToolbarChrome.comfortable
  const isCompactDesktop = !isNarrowToolbar && isCompactDesktopMeasured

  const effectiveButtonPadding = isCompactDesktop ? graphToolbarChrome.narrow.buttonPadding : chrome.buttonPadding
  const effectiveButtonFontSizeRem = isCompactDesktop
    ? graphToolbarChrome.narrow.buttonFontSizeRem
    : chrome.buttonFontSizeRem
  const graphChromeTouch: React.CSSProperties = {
    minWidth: chrome.touchMinPx,
    minHeight: chrome.touchMinPx,
    boxSizing: 'border-box',
  }
  const graphChromeTouchNarrow: React.CSSProperties = isNarrowToolbar
    ? {
        minWidth: 32,
        minHeight: 32,
        boxSizing: 'border-box',
      }
    : graphChromeTouch

  const renderGraphHealthBadge = () => {
    const graphErrs = graphValidationErrors ?? []
    const errors = graphErrs.filter((e) => e.severity === 'error')
    const warningSummary = summarizeGraphValidationWarnings(
      nodes,
      edges,
      graphErrs,
      intentionalCycles
    )
    const warnings = warningSummary.visibleWarnings
    const hasErrors = errors.length > 0
    const hasWarnings = warnings.length > 0 && !hasErrors
    const isValid = !hasErrors && !hasWarnings
    const canToggle = hasErrors || hasWarnings
    const warningLabel = formatGraphWarningBadgeLabel(warningSummary)
    const title = isValid
      ? 'Graphe valide (validation automatique à chaque sauvegarde)'
      : canToggle
      ? showValidationPanel
        ? 'Cliquer pour masquer les détails'
        : 'Cliquer pour afficher les détails'
      : hasErrors
      ? `${errors.length} erreur(s) détectée(s)`
      : warningSummary.disconnectedBranchCount > 0
      ? `${warnings.length} avertissement(s), dont ${warningSummary.disconnectedBranchCount} branche(s) déconnectée(s)`
      : `${warnings.length} avertissement(s) détecté(s)`
    const label = isValid
      ? isNarrowToolbar
        ? 'Valide'
        : 'Graphe valide'
      : hasErrors
      ? `${errors.length} erreur${errors.length > 1 ? 's' : ''}`
      : warningLabel

    const variant = isValid ? 'success' : hasErrors ? 'error' : 'warning'
    const size = isNarrowToolbar ? 'sm' : 'md'
    const icon = isValid ? '✓' : hasErrors ? '✗' : '⚠'

    return (
      <Badge
        variant={variant}
        size={size}
        icon={icon}
        title={title}
        onClick={canToggle ? () => setShowValidationPanel((v) => !v) : undefined}
      >
        {label}
      </Badge>
    )
  }

  const renderActionsMenuItems = useCallback(() => {
    return (
      <>
        <button
          data-testid="btn-new-manual-node"
          type="button"
          role="menuitem"
          onClick={() => {
            setShowActionsDropdown(false)
            const count = nodes.filter((n) => n.type === 'dialogueNode').length
            const position = {
              x: MANUAL_NODE_OFFSET_X + count * MANUAL_NODE_STEP,
              y: MANUAL_NODE_OFFSET_Y + count * MANUAL_NODE_STEP_Y,
            }
            const node = createEmptyNode(position)
            addNode(node)
            setSelectedNode(node.id)
            if (reactFlowInstance) {
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  const n = reactFlowInstance.getNode(node.id)
                  if (n) reactFlowInstance.fitView({ nodes: [n], padding: 0.2, duration: 200 })
                })
              })
            }
          }}
          style={{
            display: 'block',
            width: '100%',
            padding: chrome.dropdownItemPadding,
            border: 'none',
            background: 'transparent',
            color: theme.text.primary,
            textAlign: 'left',
            fontSize: `${chrome.dropdownItemFontSizeRem}rem`,
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = theme.state.hover.background
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          ➕ Nouveau nœud
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setShowActionsDropdown(false)
            setShowAIGenerationPanel(true)
          }}
          disabled={!selectedNodeId}
          style={{
            display: 'block',
            width: '100%',
            padding: chrome.dropdownItemPadding,
            border: 'none',
            background: 'transparent',
            color: !selectedNodeId ? theme.text.secondary : theme.text.primary,
            textAlign: 'left',
            fontSize: `${chrome.dropdownItemFontSizeRem}rem`,
            cursor: selectedNodeId ? 'pointer' : 'not-allowed',
            opacity: selectedNodeId ? 1 : 0.6,
          }}
          onMouseEnter={(e) => {
            if (selectedNodeId) e.currentTarget.style.backgroundColor = theme.state.hover.background
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          ✨ Générer nœud
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setShowActionsDropdown(false)
            setShowJumpToNodeModal(true)
          }}
          style={{
            display: 'block',
            width: '100%',
            padding: chrome.dropdownItemPadding,
            border: 'none',
            background: 'transparent',
            color: theme.text.primary,
            textAlign: 'left',
            fontSize: `${chrome.dropdownItemFontSizeRem}rem`,
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = theme.state.hover.background
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          🎯 Aller à un nœud (Ctrl+J)
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setShowActionsDropdown(false)
            handleOpenExportDialog()
          }}
          disabled={!reactFlowInstance}
          style={{
            display: 'block',
            width: '100%',
            padding: chrome.dropdownItemPadding,
            border: 'none',
            background: 'transparent',
            color: !reactFlowInstance ? theme.text.secondary : theme.text.primary,
            textAlign: 'left',
            fontSize: `${chrome.dropdownItemFontSizeRem}rem`,
            cursor: reactFlowInstance ? 'pointer' : 'not-allowed',
            opacity: reactFlowInstance ? 1 : 0.6,
          }}
          onMouseEnter={(e) => {
            if (reactFlowInstance) e.currentTarget.style.backgroundColor = theme.state.hover.background
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
          title="Exporter le graphe en image (PNG ou SVG)"
        >
          📤 Exporter en image (PNG/SVG)
        </button>
        <button
          type="button"
          role="menuitem"
          data-testid="btn-export-unity"
          onClick={() => {
            setShowActionsDropdown(false)
            handleExportUnity()
          }}
          disabled={nodes.length === 0}
          style={{
            display: 'block',
            width: '100%',
            padding: chrome.dropdownItemPadding,
            border: 'none',
            background: 'transparent',
            color: nodes.length === 0 ? theme.text.secondary : theme.text.primary,
            textAlign: 'left',
            fontSize: `${chrome.dropdownItemFontSizeRem}rem`,
            cursor: nodes.length === 0 ? 'not-allowed' : 'pointer',
            opacity: nodes.length === 0 ? 0.6 : 1,
          }}
          onMouseEnter={(e) => {
            if (nodes.length > 0) e.currentTarget.style.backgroundColor = theme.state.hover.background
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
          title="Exporter le dialogue au format Unity JSON"
          aria-label="Export Unity"
        >
          📦 Export Unity
        </button>
        <button
          type="button"
          role="menuitem"
          data-testid="btn-filters-panel"
          onClick={() => {
            setShowActionsDropdown(false)
            setShowFiltersPanel((v) => !v)
          }}
          disabled={!hasActiveDialogue}
          style={{
            display: 'block',
            width: '100%',
            padding: chrome.dropdownItemPadding,
            border: 'none',
            background: 'transparent',
            color: !hasActiveDialogue ? theme.text.secondary : theme.text.primary,
            textAlign: 'left',
            fontSize: `${chrome.dropdownItemFontSizeRem}rem`,
            cursor: hasActiveDialogue ? 'pointer' : 'not-allowed',
            opacity: hasActiveDialogue ? 1 : 0.6,
          }}
          onMouseEnter={(e) => {
            if (hasActiveDialogue) e.currentTarget.style.backgroundColor = theme.state.hover.background
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          🔽 Filtres
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setShowActionsDropdown(false)
            setShowCostBreakdown((v) => !v)
          }}
          disabled={!hasActiveDialogue}
          style={{
            display: 'block',
            width: '100%',
            padding: chrome.dropdownItemPadding,
            border: 'none',
            background: 'transparent',
            color: !hasActiveDialogue ? theme.text.secondary : theme.text.primary,
            textAlign: 'left',
            fontSize: `${chrome.dropdownItemFontSizeRem}rem`,
            cursor: hasActiveDialogue ? 'pointer' : 'not-allowed',
            opacity: hasActiveDialogue ? 1 : 0.6,
          }}
          onMouseEnter={(e) => {
            if (hasActiveDialogue) e.currentTarget.style.backgroundColor = theme.state.hover.background
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          💰 Coûts
        </button>
      </>
    )
  }, [
    addNode,
    chrome.dropdownItemFontSizeRem,
    chrome.dropdownItemPadding,
    createEmptyNode,
    handleExportUnity,
    handleOpenExportDialog,
    hasActiveDialogue,
    nodes,
    reactFlowInstance,
    selectedNodeId,
    setSelectedNode,
    setShowAIGenerationPanel,
    setShowActionsDropdown,
    setShowCostBreakdown,
    setShowFiltersPanel,
    setShowJumpToNodeModal,
  ])

  const renderStatusGroup = (): ReactNode => {
    const status: 'saved' | 'saving' | 'unsaved' | 'error' = lastSaveError
      ? 'error'
      : isGraphSaving
      ? 'saving'
      : hasUnsavedChanges
      ? 'unsaved'
      : 'saved'
    const pendingCount = hasUnsavedChanges ? 1 : 0
    const syncStatusDisplay =
      syncStatus === 'synced' && typeof navigator !== 'undefined' && !navigator.onLine
        ? 'offline'
        : syncStatus
    return (
      <>
        {renderGraphHealthBadge()}
        {activeDialogueFilename && (
          <SaveStatusIndicator
            status={status}
            lastSavedAt={lastSavedAt}
            errorMessage={lastSaveError}
            ackSeq={lastAckSeq}
            pendingCount={pendingCount}
            syncStatusDisplay={syncStatusDisplay}
          />
        )}
      </>
    )
  }

  const renderTitleBlock = (): ReactNode => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
      {onBack && (
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
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: theme.text.primary }}>
          Éditeur de graphe
        </div>
        <div
          style={{
            fontSize: '0.8rem',
            color: theme.text.secondary,
            textOverflow: 'ellipsis',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            maxWidth: '320px',
          }}
          title={activeDialogueTitle || activeDialogueFilename || 'Aucun dialogue chargé'}
        >
          {activeDialogueTitle || activeDialogueFilename || 'Aucun dialogue chargé'}
        </div>
      </div>
    </div>
  )

  const renderBatchOperationsMenu = (): ReactNode => (
    <BatchOperationsMenu
      selectedNodeIds={selectedNodeIds}
      canEditGraph={canEditGraph}
      onBatchDeleteClick={handleBatchDeleteSelection}
      onBatchTagApply={onBatchTagApply}
      onBatchValidateClick={handleBatchValidateSelection}
    />
  )

  const renderToolsGroup = (): ReactNode => (
    <>
      {/* Auto-layout avec menu direction */}
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
          }}
          title="Auto-layout (Dagre) — choisir la direction"
          aria-label="Auto-layout (Dagre) — choisir la direction"
        >
          {isNarrowToolbar ? '📐 Layout' : isCompactDesktop ? '📐' : '📐 Auto-layout'}
          {!isNarrowToolbar && (
            <span style={{ textTransform: 'capitalize' }}>
              <Badge variant="neutral" size="sm">
                {layoutSpacingMode}
              </Badge>
            </span>
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
              zIndex: 1000,
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
            <div
              style={{
                margin: '0.25rem 0',
                borderTop: `1px solid ${theme.border.primary}`,
              }}
            />
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
      {!isNarrowToolbar && (
        <GraphActionsDropdown
          canEditGraph={canEditGraph}
          isNarrow={isCompactDesktop}
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
      <button
        onClick={() => setShowCostBreakdown((v) => !v)}
        disabled={!hasActiveDialogue}
        style={{
          ...(isNarrowToolbar ? graphChromeTouchNarrow : graphChromeTouch),
          padding: effectiveButtonPadding,
          border: `1px solid ${
            showCostBreakdown ? theme.button.primary.background : theme.border.primary
          }`,
          borderRadius: '6px',
          backgroundColor: showCostBreakdown
            ? theme.button.primary.background
            : theme.button.default.background,
          color: showCostBreakdown ? theme.button.primary.color : theme.button.default.color,
          cursor: !hasActiveDialogue ? 'not-allowed' : 'pointer',
          opacity: !hasActiveDialogue ? 0.6 : 1,
          fontSize: `${effectiveButtonFontSizeRem}rem`,
        }}
        title="Afficher le breakdown des coûts LLM pour ce dialogue"
      >
        {isCompactDesktop ? '💰' : '💰 Coûts'}
      </button>
      {/* Shortcuts (?) avec tooltip */}
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
                  fontSize: isNarrowToolbar ? '0.85rem' : '0.95rem',
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
                  <kbd
                    style={{
                      padding: '0.1rem 0.35rem',
                      background: theme.background.panel,
                      borderRadius: 4,
                    }}
                  >
                    Ctrl+F
                  </kbd>{' '}
                  : rechercher dans le graphe
                </li>
                <li>
                  <kbd
                    style={{
                      padding: '0.1rem 0.35rem',
                      background: theme.background.panel,
                      borderRadius: 4,
                    }}
                  >
                    Ctrl+Shift+F
                  </kbd>{' '}
                  : filtres du graphe (types, speakers)
                </li>
                <li>
                  <kbd
                    style={{
                      padding: '0.1rem 0.35rem',
                      background: theme.background.panel,
                      borderRadius: 4,
                    }}
                  >
                    Ctrl+J
                  </kbd>{' '}
                  : aller à un nœud (Jump to Node)
                </li>
                <li>
                  <kbd
                    style={{
                      padding: '0.1rem 0.35rem',
                      background: theme.background.panel,
                      borderRadius: 4,
                    }}
                  >
                    Ctrl+G
                  </kbd>{' '}
                  : ouvrir la génération IA
                </li>
                <li>
                  <kbd
                    style={{
                      padding: '0.1rem 0.35rem',
                      background: theme.background.panel,
                      borderRadius: 4,
                    }}
                  >
                    Ctrl+S
                  </kbd>{' '}
                  : sauvegarder
                </li>
                <li>
                  <kbd
                    style={{
                      padding: '0.1rem 0.35rem',
                      background: theme.background.panel,
                      borderRadius: 4,
                    }}
                  >
                    Suppr
                  </kbd>{' '}
                  : supprimer le nœud sélectionné ; sur une connexion (edge) : confirmation puis
                  suppression
                </li>
                <li>
                  <kbd
                    style={{
                      padding: '0.1rem 0.35rem',
                      background: theme.background.panel,
                      borderRadius: 4,
                    }}
                  >
                    Ctrl+0
                  </kbd>{' '}
                  : Fit View (tout le graphe visible)
                </li>
                <li>
                  <kbd
                    style={{
                      padding: '0.1rem 0.35rem',
                      background: theme.background.panel,
                      borderRadius: 4,
                    }}
                  >
                    Flèches
                  </kbd>{' '}
                  ou{' '}
                  <kbd
                    style={{
                      padding: '0.1rem 0.35rem',
                      background: theme.background.panel,
                      borderRadius: 4,
                    }}
                  >
                    WASD
                  </kbd>{' '}
                  : pan du graphe
                </li>
                <li>
                  <kbd
                    style={{
                      padding: '0.1rem 0.35rem',
                      background: theme.background.panel,
                      borderRadius: 4,
                    }}
                  >
                    Double-clic
                  </kbd>{' '}
                  sur un nœud : focus (centrage + zoom)
                </li>
              </ul>
            </div>,
            document.body
          )}
      </div>
    </>
  )

  return (
    <div
      ref={toolbarRef}
      data-testid="graph-editor-toolbar"
      data-graph-toolbar-narrow={isNarrowToolbar ? 'true' : 'false'}
      style={{
        flexShrink: 0,
        padding: chrome.containerPadding,
        borderBottom: `1px solid ${theme.border.primary}`,
        backgroundColor: theme.background.panelHeader,
        display: isNarrowToolbar ? 'grid' : 'flex',
        gridTemplateColumns: isNarrowToolbar ? 'minmax(0, 1fr)' : undefined,
        gridTemplateAreas: isNarrowToolbar
          ? showSearchBar
            ? '"header" "tools" "search"'
            : '"header" "tools"'
          : undefined,
        gap: `${chrome.containerGapRem}rem`,
        rowGap: isNarrowToolbar ? `${chrome.containerGapRem}rem` : undefined,
        alignItems: isNarrowToolbar ? 'stretch' : 'center',
        justifyContent: isNarrowToolbar ? undefined : 'flex-end',
        flexWrap: isNarrowToolbar ? undefined : 'nowrap',
        width: '100%',
        minWidth: 0,
      }}
    >
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

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: `${chrome.buttonFontSizeRem}rem`,
                  fontWeight: 700,
                  color: theme.text.primary,
                }}
              >
                Éditeur de graphe
              </div>
              <div
                style={{
                  fontSize: `${chrome.badgeFontSizeRem}rem`,
                  color: theme.text.secondary,
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  maxWidth: '100%',
                }}
                title={activeDialogueTitle || activeDialogueFilename || 'Aucun dialogue chargé'}
              >
                {activeDialogueTitle || activeDialogueFilename || 'Aucun dialogue chargé'}
              </div>
            </div>
          </>
        ) : (
          <>
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
              <div style={{ minWidth: 0 }}>
                {headerSelector && (
                  <div
                    data-testid="graph-editor-header-selector"
                    style={{ marginBottom: '0.4rem' }}
                  >
                    {headerSelector}
                  </div>
                )}
                <div
                  style={{
                    fontSize: `${chrome.buttonFontSizeRem}rem`,
                    fontWeight: 700,
                    color: theme.text.primary,
                  }}
                >
                  Éditeur de graphe
                </div>
                <div
                  style={{
                    fontSize: `${chrome.badgeFontSizeRem}rem`,
                    color: theme.text.secondary,
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    maxWidth: '320px',
                  }}
                  title={activeDialogueTitle || activeDialogueFilename || 'Aucun dialogue chargé'}
                >
                  {activeDialogueTitle || activeDialogueFilename || 'Aucun dialogue chargé'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: `${chrome.groupGapRem}rem`, alignItems: 'center' }}>
              {canEditGraph && (
                <>
                  <button
                    type="button"
                    data-testid="btn-undo"
                    onClick={() => undo()}
                    disabled={!canUndoNow}
                    style={{
                      ...graphChromeTouch,
                      padding: effectiveButtonPadding,
                      border: `1px solid ${theme.border.primary}`,
                      borderRadius: '6px',
                      backgroundColor: theme.button.default.background,
                      color: !canUndoNow ? theme.text.secondary : theme.button.default.color,
                      cursor: canUndoNow ? 'pointer' : 'not-allowed',
                      opacity: canUndoNow ? 1 : 0.6,
                      fontSize: `${effectiveButtonFontSizeRem}rem`,
                    }}
                    title="Annuler (Ctrl+Z)"
                    aria-label="Annuler"
                  >
                    {isCompactDesktop ? '↩' : '↩ Undo'}
                  </button>
                  <button
                    type="button"
                    data-testid="btn-redo"
                    onClick={() => redo()}
                    disabled={!canRedoNow}
                    style={{
                      ...graphChromeTouch,
                      padding: effectiveButtonPadding,
                      border: `1px solid ${theme.border.primary}`,
                      borderRadius: '6px',
                      backgroundColor: theme.button.default.background,
                      color: !canRedoNow ? theme.text.secondary : theme.button.default.color,
                      cursor: canRedoNow ? 'pointer' : 'not-allowed',
                      opacity: canRedoNow ? 1 : 0.6,
                      fontSize: `${effectiveButtonFontSizeRem}rem`,
                    }}
                    title="Refaire (Ctrl+Y)"
                    aria-label="Refaire"
                  >
                    {isCompactDesktop ? '↪' : '↪ Redo'}
                  </button>
                </>
              )}
              {(!isNarrowToolbar || !showSearchBar) && (
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
                    ...graphChromeTouch,
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
              )}
              {isNarrowToolbar && (
                <GraphActionsDropdown
                  canEditGraph={canEditGraph}
                  isNarrow={true}
                  graphChromeTouch={graphChromeTouch}
                  buttonPadding={chrome.buttonPadding}
                  buttonFontSizeRem={chrome.buttonFontSizeRem}
                  groupGapRem={chrome.groupGapRem}
                  actionsDropdownRef={actionsDropdownRef}
                  actionsDropdownBtnRef={actionsDropdownBtnRef}
                  showActionsDropdown={showActionsDropdown}
                  setShowActionsDropdown={setShowActionsDropdown}
                  renderMenuItems={renderActionsMenuItems}
                />
              )}
            </div>
          </>
        )}
      </div>
      <div
        ref={compactRef}
        data-testid="graph-editor-toolbar-tools"
        data-graph-toolbar-compact-desktop={isCompactDesktop ? 'true' : 'false'}
        style={{
          gridArea: isNarrowToolbar ? 'tools' : undefined,
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: !isNarrowToolbar && isCompactDesktop ? 'column' : 'row',
          gap: `${chrome.groupGapRem}rem`,
          alignItems: !isNarrowToolbar && isCompactDesktop ? 'stretch' : 'center',
          flexWrap: isNarrowToolbar ? 'wrap' : 'nowrap',
          justifyContent: 'flex-start',
          overflowX: isNarrowToolbar ? undefined : 'visible',
          overflowY: 'visible',
        }}
      >
        {isNarrowToolbar ? (
          <>
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
                <>
                  <button
                    type="button"
                    data-testid="btn-undo"
                    onClick={() => undo()}
                    disabled={!canUndoNow}
                    style={{
                      ...graphChromeTouchNarrow,
                      padding: chrome.buttonPadding,
                      border: `1px solid ${theme.border.primary}`,
                      borderRadius: '6px',
                      backgroundColor: theme.button.default.background,
                      color: !canUndoNow ? theme.text.secondary : theme.button.default.color,
                      cursor: canUndoNow ? 'pointer' : 'not-allowed',
                      opacity: canUndoNow ? 1 : 0.6,
                      fontSize: `${chrome.buttonFontSizeRem}rem`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                    title="Annuler (Ctrl+Z)"
                    aria-label="Annuler"
                  >
                    <span aria-hidden>↩</span>
                    Annuler
                  </button>
                  <button
                    type="button"
                    data-testid="btn-redo"
                    onClick={() => redo()}
                    disabled={!canRedoNow}
                    style={{
                      ...graphChromeTouchNarrow,
                      padding: chrome.buttonPadding,
                      border: `1px solid ${theme.border.primary}`,
                      borderRadius: '6px',
                      backgroundColor: theme.button.default.background,
                      color: !canRedoNow ? theme.text.secondary : theme.button.default.color,
                      cursor: canRedoNow ? 'pointer' : 'not-allowed',
                      opacity: canRedoNow ? 1 : 0.6,
                      fontSize: `${chrome.buttonFontSizeRem}rem`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                    title="Refaire (Ctrl+Y)"
                    aria-label="Refaire"
                  >
                    <span aria-hidden>↪</span>
                    Refaire
                  </button>
                </>
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
            </div>
            <div
              data-testid="graph-toolbar-row-status"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: `${chrome.groupGapRem}rem`,
                flexWrap: 'wrap',
                minWidth: 0,
              }}
            >
              {renderBatchOperationsMenu()}
              {renderStatusGroup()}
              <div style={{ display: 'flex', alignItems: 'center', gap: `${chrome.groupGapRem}rem` }}>
                {renderToolsGroup()}
              </div>
            </div>
          </>
        ) : !isNarrowToolbar && isCompactDesktop ? (
          <>
            <div
              data-testid="graph-toolbar-row-status"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: `${chrome.groupGapRem}rem`,
                flexWrap: 'wrap',
                minWidth: 0,
              }}
            >
              {renderStatusGroup()}
            </div>
            <div
              data-testid="graph-toolbar-row-tools"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: `${chrome.groupGapRem}rem`,
                flexWrap: 'wrap',
                minWidth: 0,
              }}
            >
              {isStandalone && renderTitleBlock()}
              {renderBatchOperationsMenu()}
              {renderToolsGroup()}
            </div>
          </>
        ) : (
          <>
            {!isNarrowToolbar && isStandalone && renderTitleBlock()}
            {renderBatchOperationsMenu()}
            {renderStatusGroup()}
            {renderToolsGroup()}
          </>
        )}
      </div>
      {showSearchBar && isNarrowToolbar && (
        <div
          data-testid="graph-toolbar-search"
          style={{
            gridArea: isNarrowToolbar ? 'search' : undefined,
            width: '100%',
            minWidth: 0,
          }}
        >
          <GraphSearchBar
            embedded
            onClose={() => {
              toolbar.setShowSearchBar(false)
            }}
          />
        </div>
      )}
    </div>
  )
}
