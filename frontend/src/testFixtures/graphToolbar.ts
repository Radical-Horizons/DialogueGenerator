/**
 * Mock complet de `useGraphToolbar` pour les tests.
 *
 * `UseGraphToolbarReturn` compte ~75 champs : chaque test qui le mockait à la main
 * en gardait une copie partielle, et les copies divergeaient à chaque renommage
 * sans que rien ne le signale (Vitest ne typecheck pas). Point de mise à jour
 * unique : quand le hook change, ce fichier casse — et lui seul.
 *
 * Le type de retour est annoté explicitement : une propriété retirée ou renommée
 * dans le hook fait échouer `tsc` ici, et un `overrides` portant une clé obsolète
 * échoue chez l'appelant via `Partial<UseGraphToolbarReturn>`.
 */
import type { UseGraphToolbarReturn } from '../hooks/useGraphToolbar'

export function makeMockGraphToolbar(
  overrides: Partial<UseGraphToolbarReturn> = {}
): UseGraphToolbarReturn {
  return {
    showAutoLayoutDropdown: false,
    setShowAutoLayoutDropdown: () => {},
    showActionsDropdown: false,
    setShowActionsDropdown: () => {},
    showValidationToolsDropdown: false,
    setShowValidationToolsDropdown: () => {},
    showAIGenerationPanel: false,
    setShowAIGenerationPanel: () => {},
    showExportFormatDialog: false,
    setShowExportFormatDialog: () => {},
    showValidationPanel: false,
    setShowValidationPanel: () => {},
    showQualityLlmPanel: false,
    setShowQualityLlmPanel: () => {},
    showAiSlopPanel: false,
    setShowAiSlopPanel: () => {},
    showContextDroppingPanel: false,
    setShowContextDroppingPanel: () => {},
    showFlowSimulationPanel: false,
    setShowFlowSimulationPanel: () => {},
    showDialoguePreviewPanel: false,
    setShowDialoguePreviewPanel: () => {},
    showGameSystemsIntegrationPanel: false,
    setShowGameSystemsIntegrationPanel: () => {},
    showSchemaValidationPanel: false,
    schemaValidationLoading: false,
    schemaValidationIsValid: true,
    schemaValidationErrors: [],
    schemaValidationErrorCount: 0,
    schemaValidationWarnings: [],
    schemaValidationStructuredErrors: [],
    handleToggleSchemaValidation: () => {},
    handleSchemaIssueClick: () => {},
    showCostBreakdown: false,
    setShowCostBreakdown: () => {},
    showShortcutsTooltip: false,
    setShowShortcutsTooltip: () => {},
    showSearchBar: false,
    setShowSearchBar: () => {},
    showJumpToNodeModal: false,
    setShowJumpToNodeModal: () => {},
    showFiltersPanel: false,
    setShowFiltersPanel: () => {},
    layoutDirection: 'TB',
    layoutSpacingMode: 'normal',
    setLayoutSpacingMode: () => {},
    autoLayoutDropdownRef: { current: null },
    actionsDropdownRef: { current: null },
    actionsDropdownBtnRef: { current: null },
    validationToolsDropdownRef: { current: null },
    canvasWrapperRef: { current: null },
    reactFlowInstance: null,
    handleAutoLayout: async () => {},
    handleOpenExportDialog: () => {},
    handleExportPNG: async () => {},
    handleExportSVG: async () => {},
    handleExportUnity: async () => {},
    handlePreviewExport: async () => {},
    previewOpen: false,
    previewMode: 'single',
    previewLoading: false,
    previewError: null,
    singlePreview: null,
    batchPreview: null,
    isExportingFromPreview: false,
    handleExportFromPreview: async () => {},
    closePreview: () => {},
    undo: () => {},
    redo: () => {},
    canUndoNow: false,
    canRedoNow: false,
    lastExportDownload: null,
    isExportDownloading: false,
    handleDownloadLastExport: () => {},
    dismissExportDownload: () => {},
    ...overrides,
  }
}
