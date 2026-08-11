/**
 * En-tête de l'éditeur de graphe : barre d'outils complète.
 * JSX presentation extrait en sous-composants (Story 17.9) ; layout narrow/confort via hook 17.10.
 */
import type { ReactNode } from 'react'
import { useGraphStore } from '../../store/graphStore'
import type { UseGraphToolbarReturn } from '../../hooks/useGraphToolbar'
import { buildGraphToolbarRootStyle, useGraphToolbarLayoutMode } from '../../hooks/useGraphToolbarLayoutMode'
import { GraphSearchBar } from './GraphSearchBar'
import { GraphToolbarTitleBlock } from './GraphToolbarTitleBlock'
import {
  GraphToolbarStandaloneBackButton,
  GraphToolbarStatusRow,
} from './GraphToolbarStatusRow'
import { GraphToolbarToolsGroup, GraphToolbarToolsRow } from './GraphToolbarToolsRow'
import { useGraphToolbarMenuItems } from './useGraphToolbarMenuItems'

interface GraphEditorHeaderProps {
  toolbar: UseGraphToolbarReturn
  hasActiveDialogue: boolean
  activeDialogueFilename: string | null
  handleSave: () => Promise<void>
  onBatchTagApply: (tag: string) => void
  handleBatchValidateSelection: () => void
  handleBatchGenerateSelection?: () => void
  handleBatchDeleteSelection: () => void
  canEditGraph: boolean
  /** Ouverture menu Actions (export) même en lecture seule invité. */
  canOpenGraphActions?: boolean
  isStandalone: boolean
  onBack?: () => void
  /** Story 9.4 — preview scénario mode VN. */
  scenarioPlaythroughActive?: boolean
  onToggleScenarioPlaythrough?: () => void
  onToggleDialoguePreview?: () => void
  /** Slot titre narrow — sélecteur dialogue (Story 17.7). */
  headerSelector?: ReactNode
}

export function GraphEditorHeader({
  toolbar,
  hasActiveDialogue,
  activeDialogueFilename,
  onBatchTagApply,
  handleBatchValidateSelection,
  handleBatchGenerateSelection,
  handleBatchDeleteSelection,
  canEditGraph,
  canOpenGraphActions,
  isStandalone,
  onBack,
  onToggleDialoguePreview,
  scenarioPlaythroughActive = false,
  onToggleScenarioPlaythrough,
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
    createEmptyNode,
    addNode,
    setSelectedNode,
    setHighlightedNodes,
  } = useGraphStore()
  const canUndoNow = useGraphStore((s) => s.undoStack.length > 0)
  const canRedoNow = useGraphStore((s) => s.redoStack.length > 0)

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
    showGameSystemsIntegrationPanel,
    setShowGameSystemsIntegrationPanel,
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
    handleExportUnity,
    handlePreviewExport,
    undo,
    redo,
  } = toolbar

  const {
    toolbarRef,
    isNarrow: isNarrowToolbar,
    chrome,
    chromeStyles,
    rootLayout,
  } = useGraphToolbarLayoutMode({ showSearchBar })

  const { renderActionsMenuItems, renderQualityMenuItems } = useGraphToolbarMenuItems({
    chrome,
    hasActiveDialogue,
    showDialoguePreviewPanel: scenarioPlaythroughActive,
    onToggleDialoguePreview,
    nodes,
    selectedNodeId,
    createEmptyNode,
    addNode,
    setSelectedNode,
    reactFlowInstance,
    setShowActionsDropdown,
    setShowAIGenerationPanel,
    setShowJumpToNodeModal,
    handleOpenExportDialog,
    handleExportUnity,
    handlePreviewExport,
    setShowFiltersPanel,
    setShowFlowSimulationPanel,
    showFlowSimulationPanel,
    setShowGameSystemsIntegrationPanel,
    showGameSystemsIntegrationPanel,
    setShowValidationToolsDropdown,
    setShowQualityLlmPanel,
    showQualityLlmPanel,
    setShowAiSlopPanel,
    showAiSlopPanel,
    setShowContextDroppingPanel,
    showContextDroppingPanel,
    handleToggleSchemaValidation,
    showSchemaValidationPanel,
    setShowCostBreakdown,
    showCostBreakdown,
  })

  const toolsRowProps = {
    mode: (isNarrowToolbar ? 'narrow-actions' : 'comfort-tools') as 'narrow-actions' | 'comfort-tools',
    isNarrowToolbar,
    chrome,
    chromeStyles,
    canEditGraph,
    canOpenGraphActions: canOpenGraphActions ?? canEditGraph,
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
    showAutoLayoutDropdown,
    setShowAutoLayoutDropdown,
    autoLayoutDropdownRef,
    layoutDirection,
    layoutSpacingMode,
    setLayoutSpacingMode,
    handleAutoLayout,
    showActionsDropdown,
    setShowActionsDropdown,
    actionsDropdownRef,
    actionsDropdownBtnRef,
    showValidationToolsDropdown,
    setShowValidationToolsDropdown,
    validationToolsDropdownRef,
    renderActionsMenuItems,
    renderQualityMenuItems,
    showShortcutsTooltip,
    setShowShortcutsTooltip,
    selectedNodeId,
    scenarioPlaythroughActive,
    onToggleScenarioPlaythrough:
      onToggleScenarioPlaythrough ?? onToggleDialoguePreview,
  }

  const statusRowProps = {
    isNarrowToolbar,
    chrome,
    selectedNodeIds,
    canEditGraph,
    onBatchDeleteClick: handleBatchDeleteSelection,
    onBatchTagApply,
    onBatchValidateClick: handleBatchValidateSelection,
    onBatchGenerateClick: handleBatchGenerateSelection,
    nodes,
    edges,
    graphValidationErrors,
    intentionalCycles,
    showValidationPanel,
    setShowValidationPanel,
    activeDialogueFilename,
    lastSaveError,
    isGraphSaving,
    hasUnsavedChanges,
    lastSavedAt,
    syncStatus,
    lastAckSeq,
  }

  return (
    <div
      ref={toolbarRef}
      data-testid="graph-editor-toolbar"
      data-graph-toolbar-narrow={isNarrowToolbar ? 'true' : 'false'}
      style={buildGraphToolbarRootStyle(isNarrowToolbar, chrome, rootLayout)}
    >
      <GraphToolbarTitleBlock
        isNarrowToolbar={isNarrowToolbar}
        headerSelector={headerSelector}
        isStandalone={isStandalone}
        onBack={onBack}
        chrome={chrome}
        chromeStyles={chromeStyles}
        canEditGraph={canEditGraph}
        canUndoNow={canUndoNow}
        canRedoNow={canRedoNow}
        undo={undo}
        redo={redo}
        hasActiveDialogue={hasActiveDialogue}
        showSearchBar={showSearchBar}
        setShowSearchBar={setShowSearchBar}
        setHighlightedNodes={setHighlightedNodes}
        nodeCount={nodes.length}
        edgeCount={edges.length}
      />
      <div
        data-testid="graph-editor-toolbar-tools"
        data-graph-toolbar-compact-desktop="false"
        style={{
          gridArea: isNarrowToolbar ? 'tools' : undefined,
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'row',
          gap: isNarrowToolbar ? `${chrome.groupGapRem}rem` : 14,
          alignItems: 'center',
          flexWrap: isNarrowToolbar ? 'wrap' : 'nowrap',
          justifyContent: 'flex-start',
          overflowX: isNarrowToolbar ? undefined : 'visible',
          overflowY: 'visible',
        }}
      >
        {isNarrowToolbar ? (
          <>
            <GraphToolbarToolsRow {...toolsRowProps} mode="narrow-actions" />
            <GraphToolbarStatusRow
              {...statusRowProps}
              toolsGroup={<GraphToolbarToolsGroup {...toolsRowProps} mode="comfort-tools" />}
            />
          </>
        ) : (
          <>
            {isStandalone && onBack && <GraphToolbarStandaloneBackButton onBack={onBack} />}
            <GraphToolbarStatusRow {...statusRowProps} segments={['batch']} />
            <GraphToolbarToolsRow {...toolsRowProps} mode="comfort-tools" />
            {/* Écran 2e : santé + save calés à droite de la rangée. */}
            <div aria-hidden style={{ flex: 1, minWidth: 0 }} />
            <GraphToolbarStatusRow {...statusRowProps} segments={['health', 'save']} />
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
