/**
 * État de l'interface de la barre d'outils du graphe : dropdowns, export, layout, raccourcis.
 * Extrait de GraphEditor pour isoler l'UI tooling du rendu principal.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import type { RefObject } from 'react'
import type { ReactFlowInstance } from 'reactflow'
import { useGraphStore } from '../store/graphStore'
import { useGraphViewStore } from '../store/graphViewStore'
import { exportGraphToPNG, exportGraphToSVG } from '../utils/graphExport'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import { getErrorMessage } from '../types/errors'
import type { UseToastFn } from '../components/shared'
import type { GraphLayoutSpacingMode } from '../store/types/graphState'
import * as graphAPI from '../api/graph'
import { buildGraphSchemaApiPayload } from '../utils/buildGraphApiPayload'
import {
  buildUnityNodeIndexToIdMap,
  resolveGraphNodeIdFromUnityPath,
} from '../utils/unityNodeIndexMap'
import { useUnityExport } from './useUnityExport'
import { useUnityExportDownload } from './useUnityExportDownload'
import type { LastExportDownload } from './useUnityExportDownload'
import type { SchemaValidationIssue } from '../types/graph'

export interface UseGraphToolbarReturn {
  showAutoLayoutDropdown: boolean
  setShowAutoLayoutDropdown: (v: boolean | ((prev: boolean) => boolean)) => void
  showActionsDropdown: boolean
  setShowActionsDropdown: (v: boolean | ((prev: boolean) => boolean)) => void
  showValidationToolsDropdown: boolean
  setShowValidationToolsDropdown: (v: boolean | ((prev: boolean) => boolean)) => void
  showAIGenerationPanel: boolean
  setShowAIGenerationPanel: (v: boolean) => void
  showExportFormatDialog: boolean
  setShowExportFormatDialog: (v: boolean) => void
  showValidationPanel: boolean
  setShowValidationPanel: (v: boolean | ((prev: boolean) => boolean)) => void
  showQualityLlmPanel: boolean
  setShowQualityLlmPanel: (v: boolean | ((prev: boolean) => boolean)) => void
  showAiSlopPanel: boolean
  setShowAiSlopPanel: (v: boolean | ((prev: boolean) => boolean)) => void
  showContextDroppingPanel: boolean
  setShowContextDroppingPanel: (v: boolean | ((prev: boolean) => boolean)) => void
  showFlowSimulationPanel: boolean
  setShowFlowSimulationPanel: (v: boolean | ((prev: boolean) => boolean)) => void
  /** Story 9.4 — panneau preview scénario (variables / historique). */
  showDialoguePreviewPanel: boolean
  setShowDialoguePreviewPanel: (v: boolean | ((prev: boolean) => boolean)) => void
  showGameSystemsIntegrationPanel: boolean
  setShowGameSystemsIntegrationPanel: (v: boolean | ((prev: boolean) => boolean)) => void
  showSchemaValidationPanel: boolean
  schemaValidationLoading: boolean
  schemaValidationIsValid: boolean
  schemaValidationErrors: string[]
  schemaValidationErrorCount: number
  schemaValidationWarnings: SchemaValidationIssue[]
  schemaValidationStructuredErrors: SchemaValidationIssue[]
  handleToggleSchemaValidation: () => void
  handleSchemaIssueClick: (issue: SchemaValidationIssue) => void
  showCostBreakdown: boolean
  setShowCostBreakdown: (v: boolean | ((prev: boolean) => boolean)) => void
  showShortcutsTooltip: boolean
  setShowShortcutsTooltip: (v: boolean) => void
  showSearchBar: boolean
  setShowSearchBar: (v: boolean | ((prev: boolean) => boolean)) => void
  showJumpToNodeModal: boolean
  setShowJumpToNodeModal: (v: boolean) => void
  showFiltersPanel: boolean
  setShowFiltersPanel: (v: boolean | ((prev: boolean) => boolean)) => void
  layoutDirection: 'TB' | 'LR' | 'BT' | 'RL'
  layoutSpacingMode: GraphLayoutSpacingMode
  setLayoutSpacingMode: (mode: GraphLayoutSpacingMode) => void
  autoLayoutDropdownRef: RefObject<HTMLDivElement>
  actionsDropdownRef: RefObject<HTMLDivElement>
  actionsDropdownBtnRef: RefObject<HTMLButtonElement>
  validationToolsDropdownRef: RefObject<HTMLDivElement>
  canvasWrapperRef: RefObject<HTMLDivElement>
  reactFlowInstance: ReactFlowInstance | null
  handleAutoLayout: (direction?: 'TB' | 'LR' | 'BT' | 'RL') => Promise<void>
  handleOpenExportDialog: () => void
  handleExportPNG: () => Promise<void>
  handleExportSVG: () => Promise<void>
  handleExportUnity: () => Promise<void>
  undo: () => void
  redo: () => void
  canUndoNow: boolean
  canRedoNow: boolean
  lastExportDownload: LastExportDownload | null
  isExportDownloading: boolean
  handleDownloadLastExport: () => void
  dismissExportDownload: () => void
}

export function useGraphToolbar(
  toast: UseToastFn,
  activeDialogueFilename: string | null,
  handleSave: () => Promise<void>,
  isLoadingDialogue: boolean,
): UseGraphToolbarReturn {
  const [showAutoLayoutDropdown, setShowAutoLayoutDropdown] = useState(false)
  const [showActionsDropdown, setShowActionsDropdown] = useState(false)
  const [showValidationToolsDropdown, setShowValidationToolsDropdown] = useState(false)
  const [showAIGenerationPanel, setShowAIGenerationPanel] = useState(false)
  const [showExportFormatDialog, setShowExportFormatDialog] = useState(false)
  const [showValidationPanel, setShowValidationPanel] = useState(false)
  const [showQualityLlmPanel, setShowQualityLlmPanel] = useState(false)
  const [showAiSlopPanel, setShowAiSlopPanel] = useState(false)
  const [showContextDroppingPanel, setShowContextDroppingPanel] = useState(false)
  const [showFlowSimulationPanel, setShowFlowSimulationPanel] = useState(false)
  const [showDialoguePreviewPanel, setShowDialoguePreviewPanel] = useState(false)
  const [showGameSystemsIntegrationPanel, setShowGameSystemsIntegrationPanel] = useState(false)
  const [showSchemaValidationPanel, setShowSchemaValidationPanel] = useState(false)
  const [schemaValidationLoading, setSchemaValidationLoading] = useState(false)
  const [schemaValidationIsValid, setSchemaValidationIsValid] = useState(false)
  const [schemaValidationErrors, setSchemaValidationErrors] = useState<string[]>([])
  const [schemaValidationErrorCount, setSchemaValidationErrorCount] = useState(0)
  const [schemaValidationWarnings, setSchemaValidationWarnings] = useState<SchemaValidationIssue[]>([])
  const [schemaValidationStructuredErrors, setSchemaValidationStructuredErrors] = useState<
    SchemaValidationIssue[]
  >([])
  const [showCostBreakdown, setShowCostBreakdown] = useState(false)
  const [showShortcutsTooltip, setShowShortcutsTooltip] = useState(false)
  const [showSearchBar, setShowSearchBar] = useState(false)
  const [showJumpToNodeModal, setShowJumpToNodeModal] = useState(false)
  const [showFiltersPanel, setShowFiltersPanel] = useState(false)
  const [layoutDirection, setLayoutDirection] = useState<'TB' | 'LR' | 'BT' | 'RL'>('TB')
  const autoLayoutDropdownRef = useRef<HTMLDivElement>(null)
  const actionsDropdownRef = useRef<HTMLDivElement>(null)
  const actionsDropdownBtnRef = useRef<HTMLButtonElement>(null)
  const validationToolsDropdownRef = useRef<HTMLDivElement>(null)
  const canvasWrapperRef = useRef<HTMLDivElement>(null)

  const reactFlowInstance = useGraphViewStore((s) => s.reactFlowInstance)

  const {
    selectedNodeId,
    setSelectedNode,
    setShowDeleteNodeConfirm,
    setHighlightedNodes,
    applyAutoLayout,
    layoutSpacingMode,
    setLayoutSpacingMode,
    undo,
    redo,
    canUndo,
    canRedo,
    isLoading: isGraphLoading,
    isSaving: isGraphSaving,
  } = useGraphStore()

  const aiGenerationNodeId = useGraphViewStore((s) => s.aiGenerationNodeId)
  useEffect(() => {
    if (!aiGenerationNodeId) return
    useGraphViewStore.getState().closeAIGeneration()
    setSelectedNode(aiGenerationNodeId)
    setShowAIGenerationPanel(true)
  }, [aiGenerationNodeId, setSelectedNode])

  useEffect(() => {
    if (!showAutoLayoutDropdown) return
    const el = autoLayoutDropdownRef.current
    const onOutside = (e: MouseEvent) => {
      if (el && !el.contains(e.target as Node)) setShowAutoLayoutDropdown(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [showAutoLayoutDropdown])

  useEffect(() => {
    if (!showActionsDropdown) return
    const el = actionsDropdownRef.current
    const onOutside = (e: MouseEvent) => {
      if (el && !el.contains(e.target as Node)) setShowActionsDropdown(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [showActionsDropdown])

  useEffect(() => {
    if (!showValidationToolsDropdown) return
    const el = validationToolsDropdownRef.current
    const onOutside = (e: MouseEvent) => {
      if (el && !el.contains(e.target as Node)) setShowValidationToolsDropdown(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [showValidationToolsDropdown])

  const handleAutoLayout = useCallback(
    async (direction?: 'TB' | 'LR' | 'BT' | 'RL') => {
      const dir = direction ?? layoutDirection
      try {
        await applyAutoLayout('dagre', dir)
        setLayoutDirection(dir)
        toast('Layout appliqué', 'success', 2000)
      } catch (err) {
        toast(`Erreur lors de l'auto-layout: ${getErrorMessage(err)}`, 'error')
      }
    },
    [applyAutoLayout, layoutDirection, toast]
  )

  const handleOpenExportDialog = useCallback(() => {
    if (!reactFlowInstance || !activeDialogueFilename) {
      toast('Aucun dialogue sélectionné', 'warning')
      return
    }
    setShowExportFormatDialog(true)
  }, [reactFlowInstance, activeDialogueFilename, toast])

  const handleExportPNG = useCallback(async () => {
    if (!reactFlowInstance || !activeDialogueFilename) {
      toast('Aucun dialogue sélectionné', 'warning')
      return
    }
    try {
      setShowExportFormatDialog(false)
      const filename = activeDialogueFilename.replace(/\.json$/i, '')
      await exportGraphToPNG(reactFlowInstance, filename, 1.0)
      toast('Export PNG réussi', 'success', 2000)
    } catch (err) {
      toast(`Erreur lors de l'export PNG: ${getErrorMessage(err)}`, 'error')
    }
  }, [reactFlowInstance, activeDialogueFilename, toast])

  const handleExportSVG = useCallback(async () => {
    if (!reactFlowInstance || !activeDialogueFilename) {
      toast('Aucun dialogue sélectionné', 'warning')
      return
    }
    try {
      setShowExportFormatDialog(false)
      const filename = activeDialogueFilename.replace(/\.json$/i, '')
      await exportGraphToSVG(reactFlowInstance, filename)
      toast('Export SVG réussi', 'success', 2000)
    } catch (err) {
      toast(`Erreur lors de l'export SVG: ${getErrorMessage(err)}`, 'error')
    }
  }, [reactFlowInstance, activeDialogueFilename, toast])

  const PAN_DELTA = 50

  useKeyboardShortcuts(
    [
      {
        key: 'ctrl+s',
        handler: (e) => {
          e.preventDefault()
          if (activeDialogueFilename && !isGraphSaving && !isLoadingDialogue) {
            void handleSave()
          }
        },
        description: 'Sauvegarder',
        enabled: !!activeDialogueFilename && !isGraphSaving && !isLoadingDialogue,
      },
      {
        key: 'ctrl+g',
        handler: (e) => {
          e.preventDefault()
          if (selectedNodeId && !isGraphLoading && !isLoadingDialogue && activeDialogueFilename) {
            setShowAIGenerationPanel(true)
          }
        },
        description: "Générer un nœud avec l'IA",
        enabled: !!selectedNodeId && !isGraphLoading && !isLoadingDialogue && !!activeDialogueFilename,
      },
      {
        key: 'ctrl+j',
        handler: (e) => {
          e.preventDefault()
          setShowJumpToNodeModal(true)
        },
        description: 'Aller à un nœud (Jump to Node)',
        enabled: true,
      },
      {
        key: 'delete',
        handler: (e) => {
          e.preventDefault()
          const currentSelectedNodeId = useGraphStore.getState().selectedNodeId
          if (currentSelectedNodeId) {
            setShowDeleteNodeConfirm(true)
          }
        },
        description: 'Supprimer le nœud sélectionné',
        enabled: () => !!useGraphStore.getState().selectedNodeId,
      },
      {
        key: 'ctrl+shift+f',
        handler: (e) => {
          e.preventDefault()
          setShowSearchBar((v) => {
            if (v) setHighlightedNodes([])
            return !v
          })
        },
        description: 'Ouvrir / fermer la recherche dans le graphe',
        enabled: true,
      },
      {
        key: 'ctrl+alt+f',
        handler: (e) => {
          e.preventDefault()
          setShowFiltersPanel((v) => !v)
        },
        description: 'Ouvrir / fermer le panneau filtres du graphe',
        enabled: true,
      },
      {
        key: 'ctrl+z',
        handler: (e) => {
          e.preventDefault()
          if (!isLoadingDialogue && useGraphStore.getState().canUndo()) useGraphStore.getState().undo()
        },
        description: 'Annuler (undo)',
        enabled: () => !isLoadingDialogue && useGraphStore.getState().canUndo(),
      },
      {
        key: 'ctrl+y',
        handler: (e) => {
          e.preventDefault()
          if (!isLoadingDialogue && useGraphStore.getState().canRedo()) useGraphStore.getState().redo()
        },
        description: 'Refaire (redo)',
        enabled: () => !isLoadingDialogue && useGraphStore.getState().canRedo(),
      },
      {
        key: 'ctrl+shift+z',
        handler: (e) => {
          e.preventDefault()
          if (!isLoadingDialogue && useGraphStore.getState().canRedo()) useGraphStore.getState().redo()
        },
        description: 'Refaire (redo)',
        enabled: () => !isLoadingDialogue && useGraphStore.getState().canRedo(),
      },
      {
        key: 'ctrl+0',
        handler: (e) => {
          e.preventDefault()
          if (reactFlowInstance) reactFlowInstance.fitView({ padding: 0.2, duration: 200 })
        },
        description: 'Fit View (tout le graphe visible)',
        enabled: !!reactFlowInstance,
      },
      {
        key: 'arrowup',
        handler: (e) => {
          e.preventDefault()
          if (reactFlowInstance) {
            const vp = reactFlowInstance.getViewport()
            reactFlowInstance.setViewport({ ...vp, y: vp.y + PAN_DELTA })
          }
        },
        description: 'Pan graphe vers le haut',
        enabled: !!reactFlowInstance,
      },
      {
        key: 'arrowdown',
        handler: (e) => {
          e.preventDefault()
          if (reactFlowInstance) {
            const vp = reactFlowInstance.getViewport()
            reactFlowInstance.setViewport({ ...vp, y: vp.y - PAN_DELTA })
          }
        },
        description: 'Pan graphe vers le bas',
        enabled: !!reactFlowInstance,
      },
      {
        key: 'arrowleft',
        handler: (e) => {
          e.preventDefault()
          if (reactFlowInstance) {
            const vp = reactFlowInstance.getViewport()
            reactFlowInstance.setViewport({ ...vp, x: vp.x + PAN_DELTA })
          }
        },
        description: 'Pan graphe vers la gauche',
        enabled: !!reactFlowInstance,
      },
      {
        key: 'arrowright',
        handler: (e) => {
          e.preventDefault()
          if (reactFlowInstance) {
            const vp = reactFlowInstance.getViewport()
            reactFlowInstance.setViewport({ ...vp, x: vp.x - PAN_DELTA })
          }
        },
        description: 'Pan graphe vers la droite',
        enabled: !!reactFlowInstance,
      },
      {
        key: 'w',
        handler: (e) => {
          e.preventDefault()
          if (reactFlowInstance) {
            const vp = reactFlowInstance.getViewport()
            reactFlowInstance.setViewport({ ...vp, y: vp.y + PAN_DELTA })
          }
        },
        description: 'Pan graphe vers le haut (WASD)',
        enabled: !!reactFlowInstance,
      },
      {
        key: 's',
        handler: (e) => {
          e.preventDefault()
          if (reactFlowInstance) {
            const vp = reactFlowInstance.getViewport()
            reactFlowInstance.setViewport({ ...vp, y: vp.y - PAN_DELTA })
          }
        },
        description: 'Pan graphe vers le bas (WASD)',
        enabled: !!reactFlowInstance,
      },
      {
        key: 'a',
        handler: (e) => {
          e.preventDefault()
          if (reactFlowInstance) {
            const vp = reactFlowInstance.getViewport()
            reactFlowInstance.setViewport({ ...vp, x: vp.x + PAN_DELTA })
          }
        },
        description: 'Pan graphe vers la gauche (WASD)',
        enabled: !!reactFlowInstance,
      },
      {
        key: 'd',
        handler: (e) => {
          e.preventDefault()
          if (reactFlowInstance) {
            const vp = reactFlowInstance.getViewport()
            reactFlowInstance.setViewport({ ...vp, x: vp.x - PAN_DELTA })
          }
        },
        description: 'Pan graphe vers la droite (WASD)',
        enabled: !!reactFlowInstance,
      },
    ],
    [
      activeDialogueFilename,
      isGraphSaving,
      handleSave,
      selectedNodeId,
      isGraphLoading,
      isLoadingDialogue,
      setShowDeleteNodeConfirm,
      setHighlightedNodes,
      reactFlowInstance,
    ]
  )

  const handleToggleSchemaValidation = useCallback(async () => {
    if (showSchemaValidationPanel) {
      setShowSchemaValidationPanel(false)
      return
    }
    setShowSchemaValidationPanel(true)
    setSchemaValidationLoading(true)
    try {
      const { nodes, edges, dialogueFlagBindings } = useGraphStore.getState()
      const payload = buildGraphSchemaApiPayload(nodes, edges, dialogueFlagBindings)
      const res = await graphAPI.validateSchema(payload)
      setSchemaValidationIsValid(res.is_valid)
      setSchemaValidationErrors(res.errors)
      setSchemaValidationErrorCount(res.error_count)
      setSchemaValidationWarnings(res.warnings ?? [])
      setSchemaValidationStructuredErrors(res.structured_errors ?? [])
    } catch (err) {
      setSchemaValidationErrors([getErrorMessage(err)])
      setSchemaValidationErrorCount(1)
      setSchemaValidationIsValid(false)
      setSchemaValidationWarnings([])
      setSchemaValidationStructuredErrors([])
    } finally {
      setSchemaValidationLoading(false)
    }
  }, [showSchemaValidationPanel])

  const exportDownload = useUnityExportDownload()

  const { handleExportUnity } = useUnityExport(toast, {
    setShowSchemaValidationPanel,
    setSchemaValidationLoading,
    setSchemaValidationIsValid,
    setSchemaValidationErrors,
    setSchemaValidationErrorCount,
    setSchemaValidationWarnings,
    setSchemaValidationStructuredErrors,
  }, exportDownload)

  const handleSchemaIssueClick = useCallback((issue: SchemaValidationIssue) => {
    if (issue.node_id) {
      useGraphViewStore.getState().focusNode(issue.node_id)
      return
    }
    const { nodes } = useGraphStore.getState()
    const unityIndexMap = buildUnityNodeIndexToIdMap(nodes)
    const graphNodeId = resolveGraphNodeIdFromUnityPath(issue.path, unityIndexMap)
    if (graphNodeId) {
      useGraphViewStore.getState().focusNode(graphNodeId)
      return
    }
    const legacyMatch = /\[nodes\.(\d+)/.exec(issue.message)
    if (!legacyMatch) return
    const legacyId = unityIndexMap.get(parseInt(legacyMatch[1], 10))
    if (legacyId) {
      useGraphViewStore.getState().focusNode(legacyId)
    }
  }, [])

  const canUndoNow = canUndo()
  const canRedoNow = canRedo()

  return {
    showAutoLayoutDropdown,
    setShowAutoLayoutDropdown,
    showActionsDropdown,
    setShowActionsDropdown,
    showValidationToolsDropdown,
    setShowValidationToolsDropdown,
    showAIGenerationPanel,
    setShowAIGenerationPanel,
    showExportFormatDialog,
    setShowExportFormatDialog,
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
    showDialoguePreviewPanel,
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
    showShortcutsTooltip,
    setShowShortcutsTooltip,
    showSearchBar,
    setShowSearchBar,
    showJumpToNodeModal,
    setShowJumpToNodeModal,
    showFiltersPanel,
    setShowFiltersPanel,
    layoutDirection,
    layoutSpacingMode,
    setLayoutSpacingMode,
    autoLayoutDropdownRef,
    actionsDropdownRef,
    actionsDropdownBtnRef,
    validationToolsDropdownRef,
    canvasWrapperRef,
    reactFlowInstance,
    handleAutoLayout,
    handleOpenExportDialog,
    handleExportPNG,
    handleExportSVG,
    handleExportUnity,
    undo,
    redo,
    canUndoNow,
    canRedoNow,
    lastExportDownload: exportDownload.lastExportDownload,
    isExportDownloading: exportDownload.isDownloading,
    handleDownloadLastExport: exportDownload.handleDownloadLastExport,
    dismissExportDownload: exportDownload.dismissDownload,
  }
}
