/**
 * Éditeur de graphe narratif avec sélecteur de dialogue.
 * Orchestrateur léger : délègue la logique aux hooks et les blocs JSX aux composants dédiés.
 * Structure : Liste de dialogues à gauche, graphe à droite.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ReactFlowProvider } from 'reactflow'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../store/authStore'
import { UnityDialogueList } from '../unityDialogues/UnityDialogueList'
import { DialogueCombobox } from '../unityDialogues/DialogueCombobox'
import { GraphCanvas } from './GraphCanvas'
import { JumpToNodeModal } from './JumpToNodeModal'
import { GraphFiltersPanel } from './GraphFiltersPanel'
import { GraphSearchBar } from './GraphSearchBar'
import { AIGenerationPanel } from './AIGenerationPanel'
import { DeleteNodeConfirmModal } from './DeleteNodeConfirmModal'
import { GraphEditorHeader } from './GraphEditorHeader'
import { GraphContextBreadcrumb } from './GraphContextBreadcrumb'
import { ExportDownloadBanner } from '../unityDialogues/ExportDownloadBanner'
import { BatchExportProgressBanner } from '../unityDialogues/BatchExportProgressBanner'
import { ExportPreviewModal } from '../unityDialogues/ExportPreviewModal'
import { NodeEditorPanel } from './NodeEditorPanel'
import { GraphValidationPanel } from './GraphValidationPanel'
import {
  GraphInspector,
  GraphInspectorEmpty,
  GraphInspectorNodeHeading,
  GraphInspectorPrimaryAction,
  type GraphInspectorTabDef,
} from './GraphInspector'
import { GraphInspectorNodeSummary } from './GraphInspectorNodeSummary'
import { useUiLayoutStore } from '../../store/uiLayoutStore'
import { GraphQualityLlmPanel } from './GraphQualityLlmPanel'
import { GraphAiSlopPanel } from './GraphAiSlopPanel'
import { GraphContextDroppingPanel } from './GraphContextDroppingPanel'
import { FlowSimulationPanel } from './FlowSimulationPanel'
import { ScenarioPlaythroughOverlay } from './playthrough/ScenarioPlaythroughOverlay'
import { GameSystemsIntegrationPanel } from './systems/GameSystemsIntegrationPanel'
import { SchemaValidationPanel } from './SchemaValidationPanel'
import { BatchValidationReportModal } from './BatchValidationReportModal'
import { DialogueCostModal } from './DialogueCostModal'
import { GraphExportFormatDialog } from './GraphExportFormatDialog'
import { useGraphStore } from '../../store/graphStore'
import { useGraphViewStore } from '../../store/graphViewStore'
import { useToast, ConfirmDialog } from '../shared'
import { theme } from '../../theme'
import {
  unityDialogueListColumnStyle,
  unityDialogueWorkspaceColumnStyle,
} from '../../theme/unityDialogueListShell'
import { resolveGraphRouteTarget } from './graphEditorStandalone'
import { useDialogueLoader } from '../../hooks/useDialogueLoader'
import { useGraphToolbar } from '../../hooks/useGraphToolbar'
import { useDialoguePreview } from '../../hooks/useDialoguePreview'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useBatchOperations } from '../../hooks/useBatchOperations'
import { useBatchGenerateFromNodes } from '../../hooks/useBatchGenerateFromNodes'
import { BatchGenerateFromNodesModal } from './BatchGenerateFromNodesModal'
import { useNarrowInlineSize } from '../../hooks/useNarrowInlineSize'
import {
  GRAPH_TOOLBAR_COMFORT_MIN_WIDTH_PX,
  PANEL_COMFORT_MIN_WIDTH_PX,
} from '../../theme/responsiveChrome'
import type { UnityDialogueMetadata } from '../../types/api'

interface GraphEditorProps {
  mode?: 'embedded' | 'standalone'
  routeDialogueId?: string
  onBack?: () => void
  onDialogueSelected?: (filename: string) => void
}

export function GraphEditor({
  mode = 'embedded',
  routeDialogueId,
  onBack,
  onDialogueSelected,
}: GraphEditorProps) {
  const isStandalone = mode === 'standalone'
  const toast = useToast()
  const queryClient = useQueryClient()

  const routeTarget = useMemo(
    () => resolveGraphRouteTarget(routeDialogueId),
    [routeDialogueId]
  )

  const {
    setSelectedDialogue,
    isLoadingDialogue,
    activeDialogueFilename,
    hasActiveDialogue,
    handleSave,
    dialogueListRef,
  } = useDialogueLoader(toast, routeTarget)

  const {
    nodes,
    selectedNodeId,
    selectedNodeIds,
    validationErrors: graphValidationErrors,
    loreExplicitValidationSummary,
    isLoading: isGraphLoading,
    documentId: graphDocumentId,
  } = useGraphStore()

  const loreDialogueScopeKey = activeDialogueFilename ?? graphDocumentId ?? 'untitled'

  /**
   * 2e : l'onglet NŒUD s'ouvre en lecture ; « éditer » bascule sur le formulaire.
   * Changer de nœud ramène la lecture — on regarde d'abord, on modifie ensuite.
   */
  const [nodeInspectorEditing, setNodeInspectorEditing] = useState(false)
  useEffect(() => {
    setNodeInspectorEditing(false)
  }, [selectedNodeId])

  const toolbar = useGraphToolbar(toast, activeDialogueFilename, handleSave, isLoadingDialogue)
  const { ref: workspaceRef, isNarrow: isWorkspaceNarrow } = useNarrowInlineSize(
    GRAPH_TOOLBAR_COMFORT_MIN_WIDTH_PX,
    { measureParentClientWidth: true }
  )
  const {
    ref: graphEditorContainerRef,
    isNarrow: isGraphEditorNarrow,
  } = useNarrowInlineSize(PANEL_COMFORT_MIN_WIDTH_PX)

  const { enterDialoguePreview, exitDialoguePreview } = useDialoguePreview()
  const scenarioPlaythroughActive = useGraphViewStore((s) => s.scenarioPlaythrough.active)
  const showGraphPeek = useGraphViewStore((s) => s.scenarioPlaythrough.showGraphPeek)

  const {
    showValidationPanel,
    showQualityLlmPanel,
    showAiSlopPanel,
    showContextDroppingPanel,
    showFlowSimulationPanel,
    setShowDialoguePreviewPanel,
    showGameSystemsIntegrationPanel,
    setShowGameSystemsIntegrationPanel,
    showSchemaValidationPanel,
    schemaValidationLoading,
    schemaValidationIsValid,
    schemaValidationErrors,
    schemaValidationErrorCount,
    schemaValidationWarnings,
    schemaValidationStructuredErrors,
    handleToggleSchemaValidation,
    handleSchemaIssueClick,
    showCostBreakdown,
    setShowCostBreakdown,
    showAIGenerationPanel,
    setShowAIGenerationPanel,
    showExportFormatDialog,
    setShowExportFormatDialog,
    showJumpToNodeModal,
    setShowJumpToNodeModal,
    showFiltersPanel,
    setShowFiltersPanel,
    actionsDropdownBtnRef,
    handleExportPNG,
    handleExportSVG,
  } = toolbar

  const isGuest = useAuthStore((s) => s.user?.role === 'guest')
  const canEditGraph =
    hasActiveDialogue && !isGraphLoading && !isLoadingDialogue && !isGuest
  const canOpenGraphActions =
    hasActiveDialogue && !isGraphLoading && !isLoadingDialogue

  const handleToggleDialoguePreview = useCallback(() => {
    if (scenarioPlaythroughActive) {
      exitDialoguePreview()
      setShowDialoguePreviewPanel(false)
    } else {
      enterDialoguePreview()
      setShowDialoguePreviewPanel(true)
    }
  }, [
    scenarioPlaythroughActive,
    exitDialoguePreview,
    enterDialoguePreview,
    setShowDialoguePreviewPanel,
  ])

  useKeyboardShortcuts(
    [
      {
        key: 'p',
        handler: () => handleToggleDialoguePreview(),
        description: 'Jouer / quitter preview scénario',
        enabled: hasActiveDialogue && canEditGraph,
        preventDefault: true,
      },
    ],
    [handleToggleDialoguePreview, hasActiveDialogue, canEditGraph],
  )

  const {
    selectedNodeIdsToDelete,
    handleBatchDeleteSelection,
    handleConfirmBatchDelete,
    handleCancelBatchDelete,
    handleBatchTagSelection,
    handleBatchValidateSelection,
    showValidationReportForSelection,
    setShowValidationReportForSelection,
  } = useBatchOperations(toast)

  const {
    isGenerating: isBatchGenerating,
    progress: batchGenerateProgress,
    report: batchGenerateReport,
    showModal: showBatchGenerateModal,
    setShowModal: setShowBatchGenerateModal,
    dismissReport: dismissBatchGenerateReport,
    startBatchGenerate,
    cancelBatchGenerate,
    retryFailedParents,
  } = useBatchGenerateFromNodes(toast)

  /** Lore explicite peut n’ajouter aucune entrée dans validationErrors (graphe OK) : afficher quand même le résumé. */
  const showValidationOverlay =
    showValidationPanel &&
    (graphValidationErrors.length > 0 || Boolean(loreExplicitValidationSummary))

  /**
   * Onglets de l'inspecteur (écran 2e). Le contenu réutilise les panneaux existants :
   * seul leur contenant change (colonne fixe au lieu d'overlay empilable).
   */
  const selectedGraphNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId) ?? null
    : null
  const selectedNodeData = (selectedGraphNode?.data ?? null) as
    | { speaker?: string; line?: string; choices?: unknown[] }
    | null

  const healthIssueCount =
    graphValidationErrors.length + (schemaValidationErrorCount ?? 0)

  const selectedNodeErrorCount = selectedNodeId
    ? graphValidationErrors.filter((e) => e.node_id === selectedNodeId && e.severity === 'error')
        .length
    : 0
  const selectedNodeWarningCount = selectedNodeId
    ? graphValidationErrors.filter((e) => e.node_id === selectedNodeId && e.severity !== 'error')
        .length
    : 0

  const inspectorTabs: GraphInspectorTabDef[] = [
    {
      id: 'node',
      label: 'Nœud',
      content: selectedGraphNode ? (
        <>
          <GraphInspectorNodeHeading
            nodeLabel={`Nœud ${selectedGraphNode.id}${
              selectedNodeData?.speaker ? ` · ${selectedNodeData.speaker}` : ''
            }`}
            line={selectedNodeData?.line}
          />
          {/* 2e : vue lecture par défaut ; « éditer » ouvre le formulaire complet,
              qui reste la seule surface d'édition du graphe. */}
          {nodeInspectorEditing ? (
            <NodeEditorPanel />
          ) : (
            <GraphInspectorNodeSummary
              node={selectedGraphNode}
              errorCount={selectedNodeErrorCount}
              warningCount={selectedNodeWarningCount}
              onEdit={() => setNodeInspectorEditing(true)}
              onShowHealth={() => useUiLayoutStore.getState().setInspectorTab('health')}
            />
          )}
        </>
      ) : (
        <GraphInspectorEmpty>
          Aucun nœud sélectionné. Clique un nœud du graphe pour voir sa réplique, ses réponses
          et son origine.
        </GraphInspectorEmpty>
      ),
    },
    {
      id: 'health',
      label: 'Santé',
      count: healthIssueCount,
      content:
        graphValidationErrors.length > 0 || loreExplicitValidationSummary ? (
          <GraphValidationPanel
            validationErrors={graphValidationErrors}
            loreExplicitSummary={loreExplicitValidationSummary}
            loreDialogueScopeKey={loreDialogueScopeKey}
            variant="inspector"
          />
        ) : (
          <GraphInspectorEmpty>
            Aucune erreur ni contradiction détectée sur ce dialogue.
          </GraphInspectorEmpty>
        ),
    },
    {
      id: 'quality',
      label: 'Qualité',
      content: <GraphQualityLlmPanel variant="inspector" />,
    },
    {
      id: 'cost',
      label: 'Coût',
      content: activeDialogueFilename ? (
        <DialogueCostModal filename={activeDialogueFilename} variant="inspector" />
      ) : (
        <GraphInspectorEmpty>
          Ouvre un dialogue pour voir son coût de génération.
        </GraphInspectorEmpty>
      ),
    },
  ]

  const inspectorFooter = selectedGraphNode ? (
    <GraphInspectorPrimaryAction
      label="Générer la suite"
      shortcut="CTRL+↵"
      onClick={() => setShowAIGenerationPanel(true)}
    />
  ) : null

  const handleSelectDialogue = useCallback(
    (dialogue: UnityDialogueMetadata | null) => {
      setSelectedDialogue(dialogue)
      if (dialogue) {
        onDialogueSelected?.(dialogue.filename)
      }
    },
    [onDialogueSelected, setSelectedDialogue]
  )

  return (
    <div
      data-testid="graph-editor"
      ref={graphEditorContainerRef}
      style={{
        display: 'flex',
        height: '100%',
        width: '100%',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        flex: 1,
      }}
    >
      {/* Panneau gauche : Liste des dialogues (≤25 % ; droit prioritaire ~75 %) — caché en narrow (Story 17.7) */}
      {!isGraphEditorNarrow && (
        <div style={{ ...unityDialogueListColumnStyle, height: '100%' }}>
          <UnityDialogueList
            ref={dialogueListRef}
            onSelectDialogue={handleSelectDialogue}
            selectedFilename={activeDialogueFilename || null}
          />
        </div>
      )}

      {/* Panneau droit : Graphe */}
      <div
        style={{
          ...unityDialogueWorkspaceColumnStyle,
          display: 'flex',
          flexDirection: 'column',
        }}
        ref={workspaceRef}
      >
        <GraphEditorHeader
          toolbar={toolbar}
          hasActiveDialogue={hasActiveDialogue}
          activeDialogueFilename={activeDialogueFilename}
          handleSave={handleSave}
          onBatchTagApply={handleBatchTagSelection}
          handleBatchValidateSelection={handleBatchValidateSelection}
          handleBatchGenerateSelection={() => void startBatchGenerate()}
          handleBatchDeleteSelection={handleBatchDeleteSelection}
          canEditGraph={canEditGraph}
          canOpenGraphActions={canOpenGraphActions}
          isStandalone={isStandalone}
          onBack={onBack}
          scenarioPlaythroughActive={scenarioPlaythroughActive}
          onToggleScenarioPlaythrough={handleToggleDialoguePreview}
          onToggleDialoguePreview={handleToggleDialoguePreview}
          headerSelector={
            isGraphEditorNarrow ? (
              <DialogueCombobox
                ref={dialogueListRef}
                selectedFilename={activeDialogueFilename || null}
                onSelect={handleSelectDialogue}
              />
            ) : undefined
          }
        />

        <GraphContextBreadcrumb />

        {toolbar.lastExportDownload && (
          <ExportDownloadBanner
            exportDownload={toolbar.lastExportDownload}
            isDownloading={toolbar.isExportDownloading}
            onDownload={toolbar.handleDownloadLastExport}
            onDismiss={toolbar.dismissExportDownload}
          />
        )}

        <BatchExportProgressBanner />

        <ExportPreviewModal
          isOpen={toolbar.previewOpen}
          mode={toolbar.previewMode}
          isLoading={toolbar.previewLoading}
          error={toolbar.previewError}
          singlePreview={toolbar.singlePreview}
          batchPreview={toolbar.batchPreview}
          isExporting={toolbar.isExportingFromPreview}
          onClose={toolbar.closePreview}
          onExport={toolbar.handleExportFromPreview}
        />

        {/* Contenu graphe */}
        {!hasActiveDialogue && nodes.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: theme.text.secondary,
              padding: '2rem',
              textAlign: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.7 }}>📊</div>
              <div
                style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: theme.text.primary }}
              >
                {isStandalone ? 'Chargez un dialogue Unity' : 'Sélectionnez un dialogue Unity'}
              </div>
              <div style={{ fontSize: '0.9rem' }}>
                Choisissez un dialogue dans la liste à gauche pour le visualiser et l'éditer sous
                forme de graphe
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              position: 'relative',
              backgroundColor: theme.background.panel,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {isLoadingDialogue || isGraphLoading ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: theme.text.secondary,
                }}
              >
                Chargement du graphe...
              </div>
            ) : (
              <>
                {/* Écran 2e : le canvas partage la rangée avec l'inspecteur fixe ;
                    plus aucun panneau consultatif ne recouvre le graphe. */}
                <div style={{ flex: 1, minHeight: 0, display: 'flex', minWidth: 0 }}>
                <div
                  data-testid="graph-canvas"
                  style={{
                    flex: 1,
                    minHeight: 0,
                    minWidth: 0,
                    overflow: 'hidden',
                    position: 'relative',
                    visibility:
                      scenarioPlaythroughActive && !showGraphPeek ? 'hidden' : 'visible',
                  }}
                >
                {toolbar.showSearchBar && !isWorkspaceNarrow && (
                  <GraphSearchBar
                    onClose={() => {
                      toolbar.setShowSearchBar(false)
                    }}
                  />
                )}
                  <ReactFlowProvider>
                    <GraphCanvas />
                  </ReactFlowProvider>
                </div>
                {!isGraphEditorNarrow && <GraphInspector tabs={inspectorTabs} footer={inspectorFooter} />}
                </div>
                  {showGameSystemsIntegrationPanel ? (
                    <GameSystemsIntegrationPanel
                      onClose={() => setShowGameSystemsIntegrationPanel(false)}
                    />
                  ) : null}
              </>
            )}
            {/* Validation, qualité, slop et coût vivent désormais dans l'inspecteur
                (onglets SANTÉ / QUALITÉ / COÛT) — voir `inspectorTabs` plus haut.
                En colonne étroite, l'inspecteur n'a pas la place : ils restent en overlay. */}
            {isGraphEditorNarrow && showValidationOverlay && (
              <GraphValidationPanel
                validationErrors={graphValidationErrors}
                loreExplicitSummary={loreExplicitValidationSummary}
                loreDialogueScopeKey={loreDialogueScopeKey}
                onClose={() => toolbar.setShowValidationPanel(false)}
              />
            )}
            {isGraphEditorNarrow && showQualityLlmPanel && (
              <GraphQualityLlmPanel
                onClose={() => toolbar.setShowQualityLlmPanel(false)}
              />
            )}
            {isGraphEditorNarrow && showAiSlopPanel && (
              <GraphAiSlopPanel onClose={() => toolbar.setShowAiSlopPanel(false)} />
            )}
            {showContextDroppingPanel && (
              <GraphContextDroppingPanel
                onClose={() => toolbar.setShowContextDroppingPanel(false)}
              />
            )}
            {showFlowSimulationPanel && (
              <FlowSimulationPanel
                onClose={() => toolbar.setShowFlowSimulationPanel(false)}
              />
            )}
            <SchemaValidationPanel
              isOpen={isGraphEditorNarrow && showSchemaValidationPanel}
              isLoading={schemaValidationLoading}
              isValid={schemaValidationIsValid}
              errors={schemaValidationErrors}
              errorCount={schemaValidationErrorCount}
              warnings={schemaValidationWarnings}
              structuredErrors={schemaValidationStructuredErrors}
              onClose={handleToggleSchemaValidation}
              onIssueClick={handleSchemaIssueClick}
            />
            {isGraphEditorNarrow && showCostBreakdown && activeDialogueFilename && (
              <DialogueCostModal
                filename={activeDialogueFilename}
                onClose={() => setShowCostBreakdown(false)}
              />
            )}
            {showAIGenerationPanel && (
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2000,
                }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) setShowAIGenerationPanel(false)
                }}
              >
                <div
                  style={{
                    width: '90%',
                    maxWidth: '600px',
                    maxHeight: '90vh',
                    backgroundColor: theme.background.panel,
                    borderRadius: '8px',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <AIGenerationPanel
                    parentNodeId={selectedNodeId}
                    onClose={() => setShowAIGenerationPanel(false)}
                    onGenerated={() => {
                      dialogueListRef.current?.refresh()
                      if (activeDialogueFilename) {
                        queryClient.invalidateQueries({
                          queryKey: ['dialogue-costs', activeDialogueFilename],
                        })
                      }
                      queryClient.invalidateQueries({ queryKey: ['all-dialogues-costs'] })
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showExportFormatDialog && (
        <GraphExportFormatDialog
          onExportPNG={handleExportPNG}
          onExportSVG={handleExportSVG}
          onClose={() => setShowExportFormatDialog(false)}
        />
      )}

      <DeleteNodeConfirmModal />
      <JumpToNodeModal
        isOpen={showJumpToNodeModal}
        onClose={() => setShowJumpToNodeModal(false)}
      />
      <GraphFiltersPanel
        isOpen={showFiltersPanel}
        onClose={() => {
          setShowFiltersPanel(false)
          requestAnimationFrame(() => actionsDropdownBtnRef.current?.focus())
        }}
      />
      <ConfirmDialog
        isOpen={selectedNodeIdsToDelete != null && selectedNodeIdsToDelete.length > 0}
        title={
          selectedNodeIdsToDelete?.length === 1
            ? 'Supprimer le nœud sélectionné'
            : 'Supprimer les nœuds sélectionnés'
        }
        message={
          selectedNodeIdsToDelete?.length === 1
            ? 'Supprimer ce nœud ?'
            : `Supprimer ${selectedNodeIdsToDelete?.length ?? 0} nœuds ?`
        }
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        onConfirm={handleConfirmBatchDelete}
        onCancel={handleCancelBatchDelete}
        variant="danger"
      />
      <BatchValidationReportModal
        isOpen={showValidationReportForSelection}
        onClose={() => setShowValidationReportForSelection(false)}
        validationErrors={graphValidationErrors}
        selectedNodeIds={selectedNodeIds}
      />
      <BatchGenerateFromNodesModal
        open={showBatchGenerateModal}
        isGenerating={isBatchGenerating}
        progress={batchGenerateProgress}
        report={batchGenerateReport}
        onClose={() => {
          setShowBatchGenerateModal(false)
          dismissBatchGenerateReport()
        }}
        onCancel={cancelBatchGenerate}
        onRetryFailed={() => void retryFailedParents()}
      />
      {scenarioPlaythroughActive ? (
        <ScenarioPlaythroughOverlay
          dialogueTitle={activeDialogueFilename ?? 'Dialogue'}
          onExit={() => setShowDialoguePreviewPanel(false)}
        />
      ) : null}
    </div>
  )
}
