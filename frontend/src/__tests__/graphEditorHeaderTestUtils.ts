/**
 * Fixtures partagées pour les tests GraphEditorHeader (Story 17.11).
 */
import { createElement, type ComponentProps } from 'react'
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import type { UseGraphToolbarReturn } from '../hooks/useGraphToolbar'
import { useGraphStore } from '../store/graphStore'
import { GraphEditorHeader } from '../components/graph/GraphEditorHeader'
import * as narrowHook from '../hooks/useNarrowInlineSize'

type NarrowHookReturn = ReturnType<typeof narrowHook.useNarrowInlineSize>

function nullRef<T>() {
  return { current: null as T | null }
}

/** Baseline complète UseGraphToolbarReturn — union desktopToolbar / searchRow / undoRedo. */
export const defaultMockToolbarState: UseGraphToolbarReturn = {
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
  autoLayoutDropdownRef: nullRef(),
  actionsDropdownRef: nullRef(),
  actionsDropdownBtnRef: nullRef(),
  validationToolsDropdownRef: nullRef(),
  canvasWrapperRef: nullRef(),
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
  undo: () => useGraphStore.getState().undo(),
  redo: () => useGraphStore.getState().redo(),
  canUndoNow: false,
  canRedoNow: false,
  lastExportDownload: null,
  isExportDownloading: false,
  handleDownloadLastExport: () => {},
  dismissExportDownload: () => {},
}

export function makeMockToolbar(
  overrides: Partial<UseGraphToolbarReturn> = {},
): UseGraphToolbarReturn {
  return { ...defaultMockToolbarState, ...overrides }
}

/** Mocks `useNarrowInlineSize` for the toolbar narrow threshold (640px). */
export function mockNarrowToolbar(narrowToolbar: boolean): void {
  vi.spyOn(narrowHook, 'useNarrowInlineSize').mockImplementation(
    () => ({ ref: () => {}, isNarrow: narrowToolbar }) as NarrowHookReturn,
  )
}

export const defaultGraphEditorHeaderProps = {
  hasActiveDialogue: true,
  activeDialogueFilename: 'test.json',
  handleSave: async () => {},
  onBatchTagApply: () => {},
  handleBatchValidateSelection: () => {},
  handleBatchDeleteSelection: () => {},
  canEditGraph: true,
  isStandalone: false,
} satisfies Omit<ComponentProps<typeof GraphEditorHeader>, 'toolbar'>

type RenderGraphEditorHeaderOptions = Partial<
  ComponentProps<typeof GraphEditorHeader>
> & {
  narrow?: boolean
}

/** Render minimal GraphEditorHeader pour tests mount / density. */
export function renderGraphEditorHeader(
  options: RenderGraphEditorHeaderOptions = {},
) {
  const { narrow, toolbar, ...headerProps } = options
  if (narrow !== undefined) {
    mockNarrowToolbar(narrow)
  }
  return render(
    createElement(GraphEditorHeader, {
      toolbar: toolbar ?? makeMockToolbar(),
      ...defaultGraphEditorHeaderProps,
      ...headerProps,
    }),
  )
}
