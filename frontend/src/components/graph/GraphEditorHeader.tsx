/**
 * En-tête de l'éditeur de graphe : barre d'outils complète.
 * Extrait de GraphEditor pour isoler le bloc JSX de la toolbar (~778L).
 * Appelle useGraphStore() en interne pour éviter le prop drilling sur les données du store.
 */
import type React from 'react'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGraphStore } from '../../store/graphStore'
import { useContextStore } from '../../store/contextStore'
import { SaveStatusIndicator } from '../shared'
import { theme } from '../../theme'
import type { UseGraphToolbarReturn } from '../../hooks/useGraphToolbar'
import { BatchOperationsMenu } from './BatchOperationsMenu'
import { NODE_DRAG_TOOLTIP } from './nodeDragTooltip'
import {
  formatGraphWarningBadgeLabel,
  summarizeGraphValidationWarnings,
} from '../../utils/graphValidationSummary'
import {
  GRAPH_TOOLBAR_DROPDOWN_MAX_HEIGHT,
  GRAPH_TOOLBAR_DROPDOWN_Z_INDEX,
} from './graphToolbarConstants'

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
  /** Story 9.4 — preview scénario variables / effets. */
  showDialoguePreviewPanel?: boolean
  onToggleDialoguePreview?: () => void
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
  showDialoguePreviewPanel = false,
  onToggleDialoguePreview,
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
    graphFilters,
    dialogueMetadata,
    createEmptyNode,
    addNode,
    setSelectedNode,
    setHighlightedNodes,
    exportToUnity,
  } = useGraphStore()
  const canUndoNow = useGraphStore((s) => s.undoStack.length > 0)
  const canRedoNow = useGraphStore((s) => s.redoStack.length > 0)
  const validateLoreExplicit = useGraphStore((s) => s.validateLoreExplicit)
  const loreExplicitLoading = useGraphStore((s) => s.loreExplicitValidationLoading)
  const contextSelections = useContextStore((s) => s.selections)

  const handleExportUnity = () => {
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
  }

  const {
    showAutoLayoutDropdown,
    setShowAutoLayoutDropdown,
    showActionsDropdown,
    setShowActionsDropdown,
    showValidationToolsDropdown,
    setShowValidationToolsDropdown,
    setShowAIGenerationPanel,
    showValidationPanel,
    setShowValidationPanel,
    showQualityLlmPanel,
    setShowQualityLlmPanel,
    showAiSlopPanel,
    setShowAiSlopPanel,
    showContextDroppingPanel,
    setShowContextDroppingPanel,
    showFlowSimulationPanel,
    setShowFlowSimulationPanel,
    showSchemaValidationPanel,
    handleToggleSchemaValidation,
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
    validationToolsDropdownRef,
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

  return (
    <div
      style={{
        flexShrink: 0,
        padding: '0.75rem 1rem',
        borderBottom: `1px solid ${theme.border.primary}`,
        backgroundColor: theme.background.panelHeader,
        display: 'flex',
        gap: '0.5rem',
        alignItems: 'center',
        justifyContent: 'flex-end',
        flexWrap: 'wrap',
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'center',
          flexWrap: 'wrap',
          justifyContent: 'flex-start',
        }}
      >
        {isStandalone && (
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
        )}
        <BatchOperationsMenu
          selectedNodeIds={selectedNodeIds}
          canEditGraph={canEditGraph}
          onBatchDeleteClick={handleBatchDeleteSelection}
          onBatchTagApply={onBatchTagApply}
          onBatchValidateClick={handleBatchValidateSelection}
        />
        {canEditGraph && (
          <>
            <button
              type="button"
              data-testid="btn-undo"
              onClick={() => undo()}
              disabled={!canUndoNow}
              style={{
                padding: '0.5rem 0.75rem',
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '6px',
                backgroundColor: theme.button.default.background,
                color: !canUndoNow ? theme.text.secondary : theme.button.default.color,
                cursor: canUndoNow ? 'pointer' : 'not-allowed',
                opacity: canUndoNow ? 1 : 0.6,
                fontSize: '0.9rem',
              }}
              title="Annuler (Ctrl+Z)"
              aria-label="Annuler"
            >
              ↩ Undo
            </button>
            <button
              type="button"
              data-testid="btn-redo"
              onClick={() => redo()}
              disabled={!canRedoNow}
              style={{
                padding: '0.5rem 0.75rem',
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '6px',
                backgroundColor: theme.button.default.background,
                color: !canRedoNow ? theme.text.secondary : theme.button.default.color,
                cursor: canRedoNow ? 'pointer' : 'not-allowed',
                opacity: canRedoNow ? 1 : 0.6,
                fontSize: '0.9rem',
              }}
              title="Refaire (Ctrl+Y)"
              aria-label="Refaire"
            >
              ↪ Redo
            </button>
          </>
        )}
        {/* Badge de santé global du graphe */}
        {(() => {
          const errors = graphValidationErrors.filter((e) => e.severity === 'error')
          const warningSummary = summarizeGraphValidationWarnings(
            nodes,
            edges,
            graphValidationErrors,
            intentionalCycles
          )
          const warnings = warningSummary.visibleWarnings
          const hasErrors = errors.length > 0
          const hasWarnings = warnings.length > 0 && !hasErrors
          const isValid = !hasErrors && !hasWarnings
          const canToggle = hasErrors || hasWarnings
          const warningLabel = formatGraphWarningBadgeLabel(warningSummary)
          const badgeStyle = {
            padding: '0.4rem 0.75rem',
            borderRadius: '6px',
            fontSize: '0.85rem',
            fontWeight: 600,
            backgroundColor: isValid
              ? theme.state.success.background
              : hasErrors
              ? theme.state.error.background
              : theme.state.warning.background,
            color: isValid
              ? theme.state.success.color
              : hasErrors
              ? theme.state.error.color
              : theme.state.warning.color,
            border: `1px solid ${
              isValid
                ? theme.state.success.color
                : hasErrors
                ? theme.state.error.border
                : theme.state.warning.color
            }`,
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            ...(canToggle && { cursor: 'pointer' }),
          } as React.CSSProperties
          const title = isValid
            ? 'Structure : 0 erreurs (validation automatique à chaque sauvegarde)'
            : canToggle
            ? showValidationPanel
              ? 'Cliquer pour masquer les détails'
              : 'Cliquer pour afficher les détails'
            : hasErrors
            ? `${errors.length} erreur(s) détectée(s)`
            : warningSummary.disconnectedBranchCount > 0
            ? `${warnings.length} avertissement(s), dont ${warningSummary.disconnectedBranchCount} branche(s) déconnectée(s)`
            : `${warnings.length} avertissement(s) détecté(s)`
          const content = (
            <>
              <span>{isValid ? '✓' : hasErrors ? '✗' : '⚠'}</span>
              <span>
                {isValid
                  ? 'Structure : 0 erreurs'
                  : hasErrors
                  ? `${errors.length} erreur${errors.length > 1 ? 's' : ''}`
                  : warningLabel}
              </span>
            </>
          )
          if (canToggle) {
            return (
              <button
                type="button"
                style={{
                  ...badgeStyle,
                  margin: 0,
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  font: 'inherit',
                }}
                title={title}
                onClick={() => setShowValidationPanel((v) => !v)}
              >
                {content}
              </button>
            )
          }
          return (
            <div style={badgeStyle} title={title}>
              {content}
            </div>
          )
        })()}
        {/* Indicateur sauvegarde ADR-006 */}
        {activeDialogueFilename &&
          (() => {
            const status: 'saved' | 'saving' | 'unsaved' | 'error' = lastSaveError
              ? 'error'
              : isGraphSaving
              ? 'saving'
              : hasUnsavedChanges
              ? 'unsaved'
              : 'saved'
            const pendingCount = hasUnsavedChanges ? 1 : 0
            const syncStatusDisplay =
              syncStatus === 'synced' &&
              typeof navigator !== 'undefined' &&
              !navigator.onLine
                ? 'offline'
                : syncStatus
            return (
              <SaveStatusIndicator
                status={status}
                lastSavedAt={lastSavedAt}
                errorMessage={lastSaveError}
                ackSeq={lastAckSeq}
                pendingCount={pendingCount}
                syncStatusDisplay={syncStatusDisplay}
              />
            )
          })()}
        {/* Auto-layout avec menu direction */}
        <div ref={autoLayoutDropdownRef} style={{ position: 'relative' }}>
          <button
            onClick={() => canEditGraph && setShowAutoLayoutDropdown((v) => !v)}
            disabled={!canEditGraph}
            style={{
              padding: '0.5rem 1rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '6px',
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              cursor: canEditGraph ? 'pointer' : 'not-allowed',
              opacity: canEditGraph ? 1 : 0.6,
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
            title="Auto-layout (Dagre) — choisir la direction"
            aria-label="Auto-layout (Dagre) — choisir la direction"
          >
            📐 Auto-layout
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
                maxHeight: GRAPH_TOOLBAR_DROPDOWN_MAX_HEIGHT,
                overflowY: 'auto',
                overflowX: 'hidden',
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
                  fontSize: '0.72rem',
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
                    padding: '0.45rem 0.75rem',
                    border: 'none',
                    background:
                      layoutSpacingMode === value ? theme.button.default.background : 'transparent',
                    color: theme.input.color,
                    textAlign: 'left',
                    fontSize: '0.85rem',
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
                  fontSize: '0.72rem',
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
                    padding: '0.5rem 0.75rem',
                    border: 'none',
                    background:
                      layoutDirection === value ? theme.button.default.background : 'transparent',
                    color: theme.input.color,
                    textAlign: 'left',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div ref={actionsDropdownRef} style={{ position: 'relative' }}>
          <button
            ref={actionsDropdownBtnRef}
            data-testid="btn-actions-dropdown"
            type="button"
            onClick={() => canEditGraph && setShowActionsDropdown((v) => !v)}
            disabled={!canEditGraph}
            style={{
              padding: '0.5rem 1rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '6px',
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              cursor: canEditGraph ? 'pointer' : 'not-allowed',
              opacity: canEditGraph ? 1 : 0.6,
              fontSize: '0.9rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
            title="Actions sur le graphe"
          >
            Actions
            <span style={{ fontSize: '0.7rem' }}>▼</span>
          </button>
          {showActionsDropdown && (
            <div
              role="menu"
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: '4px',
                minWidth: '200px',
                maxWidth: 'min(320px, 92vw)',
                maxHeight: GRAPH_TOOLBAR_DROPDOWN_MAX_HEIGHT,
                overflowY: 'auto',
                overflowX: 'hidden',
                backgroundColor: theme.background.tertiary,
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                zIndex: GRAPH_TOOLBAR_DROPDOWN_Z_INDEX,
              }}
            >
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
                  padding: '0.5rem 1rem',
                  border: 'none',
                  background: 'transparent',
                  color: theme.text.primary,
                  textAlign: 'left',
                  fontSize: '0.9rem',
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
                  padding: '0.5rem 1rem',
                  border: 'none',
                  background: 'transparent',
                  color: !selectedNodeId ? theme.text.secondary : theme.text.primary,
                  textAlign: 'left',
                  fontSize: '0.9rem',
                  cursor: selectedNodeId ? 'pointer' : 'not-allowed',
                  opacity: selectedNodeId ? 1 : 0.6,
                }}
                onMouseEnter={(e) => {
                  if (selectedNodeId)
                    e.currentTarget.style.backgroundColor = theme.state.hover.background
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
                data-testid="btn-validate-lore-explicit"
                disabled={!hasActiveDialogue || loreExplicitLoading}
                onClick={() => {
                  void (async () => {
                    setShowActionsDropdown(false)
                    setShowValidationPanel(true)
                    try {
                      await validateLoreExplicit(
                        contextSelections as Record<string, unknown>
                      )
                    } catch {
                      window.alert(
                        'La validation lore n’a pas pu s’exécuter. Vérifiez la connexion au serveur ou réessayez plus tard.'
                      )
                    }
                  })()
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '0.5rem 1rem',
                  border: 'none',
                  background: 'transparent',
                  color:
                    !hasActiveDialogue || loreExplicitLoading
                      ? theme.text.secondary
                      : theme.text.primary,
                  textAlign: 'left',
                  fontSize: '0.9rem',
                  cursor:
                    hasActiveDialogue && !loreExplicitLoading ? 'pointer' : 'not-allowed',
                  opacity: hasActiveDialogue && !loreExplicitLoading ? 1 : 0.6,
                }}
                onMouseEnter={(e) => {
                  if (hasActiveDialogue && !loreExplicitLoading)
                    e.currentTarget.style.backgroundColor = theme.state.hover.background
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                {loreExplicitLoading ? '⏳ Lore…' : '📜 Valider lore'}
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
                  padding: '0.5rem 1rem',
                  border: 'none',
                  background: 'transparent',
                  color: theme.text.primary,
                  textAlign: 'left',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = theme.state.hover.background
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                🎯 Aller à un nœud
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
                  padding: '0.5rem 1rem',
                  border: 'none',
                  background: 'transparent',
                  color: !reactFlowInstance ? theme.text.secondary : theme.text.primary,
                  textAlign: 'left',
                  fontSize: '0.9rem',
                  cursor: reactFlowInstance ? 'pointer' : 'not-allowed',
                  opacity: reactFlowInstance ? 1 : 0.6,
                }}
                onMouseEnter={(e) => {
                  if (reactFlowInstance)
                    e.currentTarget.style.backgroundColor = theme.state.hover.background
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
                title="Exporter le graphe en image (PNG ou SVG)"
              >
                📤 Exporter en image
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
                  padding: '0.5rem 1rem',
                  border: 'none',
                  background: 'transparent',
                  color: nodes.length === 0 ? theme.text.secondary : theme.text.primary,
                  textAlign: 'left',
                  fontSize: '0.9rem',
                  cursor: nodes.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: nodes.length === 0 ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (nodes.length > 0)
                    e.currentTarget.style.backgroundColor = theme.state.hover.background
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
                  padding: '0.5rem 1rem',
                  border: 'none',
                  background: 'transparent',
                  color: !hasActiveDialogue ? theme.text.secondary : theme.text.primary,
                  textAlign: 'left',
                  fontSize: '0.9rem',
                  cursor: hasActiveDialogue ? 'pointer' : 'not-allowed',
                  opacity: hasActiveDialogue ? 1 : 0.6,
                }}
                onMouseEnter={(e) => {
                  if (hasActiveDialogue)
                    e.currentTarget.style.backgroundColor = theme.state.hover.background
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                🔽 Filtres
                {(graphFilters.hiddenTypes?.length ?? 0) > 0 ||
                (graphFilters.allowedSpeakers?.length ?? 0) > 0 ? (
                  <span style={{ marginLeft: '0.35rem', fontSize: '0.75rem' }}>•</span>
                ) : null}
              </button>
            </div>
          )}
        </div>
        {(() => {
          const validationToolsActive =
            showQualityLlmPanel ||
            showAiSlopPanel ||
            showContextDroppingPanel ||
            showFlowSimulationPanel ||
            showSchemaValidationPanel ||
            showCostBreakdown ||
            showDialoguePreviewPanel
          const menuItemStyle = {
            display: 'block',
            width: '100%',
            padding: '0.5rem 1rem',
            border: 'none',
            background: 'transparent',
            color: theme.text.primary,
            textAlign: 'left' as const,
            fontSize: '0.9rem',
            cursor: 'pointer' as const,
          }
          return (
            <div ref={validationToolsDropdownRef} style={{ position: 'relative' }}>
              <button
                type="button"
                data-testid="btn-validation-tools-dropdown"
                onClick={() =>
                  hasActiveDialogue &&
                  setShowValidationToolsDropdown((v) => !v)
                }
                disabled={!hasActiveDialogue}
                style={{
                  padding: '0.5rem 1rem',
                  border: `1px solid ${
                    showValidationToolsDropdown || validationToolsActive
                      ? theme.button.primary.background
                      : theme.border.primary
                  }`,
                  borderRadius: '6px',
                  backgroundColor:
                    showValidationToolsDropdown || validationToolsActive
                      ? theme.button.primary.background
                      : theme.button.default.background,
                  color:
                    showValidationToolsDropdown || validationToolsActive
                      ? theme.button.primary.color
                      : theme.button.default.color,
                  cursor: !hasActiveDialogue ? 'not-allowed' : 'pointer',
                  opacity: !hasActiveDialogue ? 0.6 : 1,
                  fontSize: '0.9rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
                title="Qualité narrative, détections, simulation de flux, schéma Unity et coûts LLM"
              >
                Qualité
                {validationToolsActive ? (
                  <span style={{ fontSize: '0.75rem' }}>•</span>
                ) : null}
                <span style={{ fontSize: '0.7rem' }}>▼</span>
              </button>
              {showValidationToolsDropdown && (
                <div
                  role="menu"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: '4px',
                    minWidth: '280px',
                    maxWidth: 'min(360px, 92vw)',
                    maxHeight: GRAPH_TOOLBAR_DROPDOWN_MAX_HEIGHT,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    backgroundColor: theme.background.tertiary,
                    border: `1px solid ${theme.border.primary}`,
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                    zIndex: GRAPH_TOOLBAR_DROPDOWN_Z_INDEX,
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="btn-quality-llm-panel"
                    onClick={() => {
                      setShowValidationToolsDropdown(false)
                      setShowQualityLlmPanel((v) => !v)
                    }}
                    style={menuItemStyle}
                    title="Évaluer la qualité narrative du dialogue (juge LLM, FR42)"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = theme.state.hover.background
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    ✨ Qualité LLM
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="btn-ai-slop-panel"
                    onClick={() => {
                      setShowValidationToolsDropdown(false)
                      setShowAiSlopPanel((v) => !v)
                    }}
                    style={menuItemStyle}
                    title="Détecter les formulations type GPT-ism, répétitions et phrases génériques (FR43)"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = theme.state.hover.background
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    🤖 Détection AI slop
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="btn-context-dropping-panel"
                    onClick={() => {
                      setShowValidationToolsDropdown(false)
                      setShowContextDroppingPanel((v) => !v)
                    }}
                    style={menuItemStyle}
                    title="Détecter si le contexte GDD sélectionné est absent ou trop indirect dans le dialogue (FR44)"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = theme.state.hover.background
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    📎 Context dropping
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="btn-flow-simulation-panel"
                    onClick={() => {
                      setShowValidationToolsDropdown(false)
                      setShowFlowSimulationPanel((v) => !v)
                    }}
                    style={menuItemStyle}
                    title="Simuler le flux de dialogue pour détecter dead ends et cul-de-sacs (FR46)"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = theme.state.hover.background
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    🔀 Simulation de flux
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="btn-schema-validation-panel"
                    onClick={() => {
                      setShowValidationToolsDropdown(false)
                      void handleToggleSchemaValidation()
                    }}
                    style={menuItemStyle}
                    title="Valider la conformité du schéma JSON Unity (FR48)"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = theme.state.hover.background
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    🧩 Schéma Unity
                  </button>
                  <div
                    style={{
                      height: 1,
                      margin: '0.15rem 0',
                      backgroundColor: theme.border.primary,
                    }}
                  />
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="btn-cost-breakdown-panel"
                    onClick={() => {
                      setShowValidationToolsDropdown(false)
                      setShowCostBreakdown((v) => !v)
                    }}
                    style={menuItemStyle}
                    title="Afficher le breakdown des coûts LLM pour ce dialogue"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = theme.state.hover.background
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    💰 Coûts LLM
                  </button>
                </div>
              )}
            </div>
          )
        })()}
        <button
          type="button"
          data-testid="btn-dialogue-preview"
          onClick={() => onToggleDialoguePreview?.()}
          disabled={!hasActiveDialogue || !onToggleDialoguePreview}
          style={{
            padding: '0.5rem 1rem',
            border: `1px solid ${
              showDialoguePreviewPanel ? theme.button.primary.background : theme.border.primary
            }`,
            borderRadius: '6px',
            backgroundColor: showDialoguePreviewPanel
              ? theme.button.primary.background
              : theme.button.default.background,
            color: showDialoguePreviewPanel
              ? theme.button.primary.color
              : theme.button.default.color,
            cursor:
              !hasActiveDialogue || !onToggleDialoguePreview ? 'not-allowed' : 'pointer',
            opacity: !hasActiveDialogue ? 0.6 : 1,
            fontSize: '0.9rem',
          }}
          title="Preview scénario — simuler variables et effets sans sauvegarder"
          aria-pressed={showDialoguePreviewPanel}
        >
          👁 Preview
        </button>
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
            padding: '0.5rem 1rem',
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
            fontSize: '0.9rem',
          }}
          title="Rechercher dans le graphe (Ctrl+F)"
          aria-label="Rechercher"
        >
          🔍 Rechercher
        </button>
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
              width: 28,
              height: 28,
              padding: 0,
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '50%',
              backgroundColor: theme.button.default.background,
              color: theme.text.secondary,
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Raccourcis du graphe"
            aria-describedby={showShortcutsTooltip ? 'graph-shortcuts-tooltip' : undefined}
          >
            ?
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
      </div>
    </div>
  )
}
