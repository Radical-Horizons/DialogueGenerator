/**
 * Items des menus Actions et Qualités de la toolbar graphe (Story 17.9).
 */
import { useCallback, type CSSProperties } from 'react'
import type { Node } from '@xyflow/react'
import type { ReactFlowInstance } from '@xyflow/react'
import { theme } from '../../theme'
import {
  MANUAL_NODE_OFFSET_X,
  MANUAL_NODE_OFFSET_Y,
  MANUAL_NODE_STEP,
  MANUAL_NODE_STEP_Y,
} from './graphToolbarConstants'
import type { GraphToolbarChromeTokens } from './graphToolbarTypes'

export interface GraphToolbarMenuItemsParams {
  chrome: GraphToolbarChromeTokens
  hasActiveDialogue: boolean
  showDialoguePreviewPanel: boolean
  onToggleDialoguePreview?: () => void
  nodes: Node[]
  selectedNodeId: string | null
  createEmptyNode: (position: { x: number; y: number }) => Node
  addNode: (node: Node) => void
  setSelectedNode: (id: string | null) => void
  reactFlowInstance: ReactFlowInstance | null
  setShowActionsDropdown: (next: boolean | ((v: boolean) => boolean)) => void
  setShowAIGenerationPanel: (next: boolean | ((v: boolean) => boolean)) => void
  setShowJumpToNodeModal: (next: boolean | ((v: boolean) => boolean)) => void
  handleOpenExportDialog: () => void
  handleExportUnity: () => void | Promise<void>
  handlePreviewExport: () => void | Promise<void>
  setShowFiltersPanel: (next: boolean | ((v: boolean) => boolean)) => void
  setShowFlowSimulationPanel: (next: boolean | ((v: boolean) => boolean)) => void
  showFlowSimulationPanel: boolean
  setShowGameSystemsIntegrationPanel: (next: boolean | ((v: boolean) => boolean)) => void
  showGameSystemsIntegrationPanel: boolean
  setShowValidationToolsDropdown: (next: boolean | ((v: boolean) => boolean)) => void
  setShowQualityLlmPanel: (next: boolean | ((v: boolean) => boolean)) => void
  showQualityLlmPanel: boolean
  setShowAiSlopPanel: (next: boolean | ((v: boolean) => boolean)) => void
  showAiSlopPanel: boolean
  setShowContextDroppingPanel: (next: boolean | ((v: boolean) => boolean)) => void
  showContextDroppingPanel: boolean
  handleToggleSchemaValidation: () => void
  showSchemaValidationPanel: boolean
  setShowCostBreakdown: (next: boolean | ((v: boolean) => boolean)) => void
  showCostBreakdown: boolean
}

function dropdownItemStyle(
  chrome: GraphToolbarChromeTokens,
  active: boolean,
  disabled: boolean
): CSSProperties {
  return {
    display: 'block',
    width: '100%',
    padding: chrome.dropdownItemPadding,
    border: 'none',
    background: active ? theme.button.default.background : 'transparent',
    color: disabled ? theme.text.secondary : theme.text.primary,
    textAlign: 'left',
    fontSize: `${chrome.dropdownItemFontSizeRem}rem`,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  }
}

/** Callbacks menu Actions + Qualités pour GraphActionsDropdown. */
export function useGraphToolbarMenuItems(params: GraphToolbarMenuItemsParams) {
  const {
    chrome,
    hasActiveDialogue,
    showDialoguePreviewPanel,
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
  } = params

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
          style={dropdownItemStyle(chrome, false, false)}
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
          style={dropdownItemStyle(chrome, false, !selectedNodeId)}
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
          style={dropdownItemStyle(chrome, false, false)}
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
          style={dropdownItemStyle(chrome, false, !reactFlowInstance)}
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
            void handleExportUnity()
          }}
          disabled={nodes.length === 0}
          style={dropdownItemStyle(chrome, false, nodes.length === 0)}
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
          data-testid="btn-preview-export"
          onClick={() => {
            setShowActionsDropdown(false)
            void handlePreviewExport()
          }}
          disabled={nodes.length === 0}
          style={dropdownItemStyle(chrome, false, nodes.length === 0)}
          onMouseEnter={(e) => {
            if (nodes.length > 0) e.currentTarget.style.backgroundColor = theme.state.hover.background
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
          title="Prévisualiser l'export Unity avant téléchargement"
          aria-label="Prévisualiser export"
        >
          👁 Prévisualiser export
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
          style={dropdownItemStyle(chrome, false, !hasActiveDialogue)}
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
            setShowFlowSimulationPanel((v) => !v)
          }}
          disabled={!hasActiveDialogue}
          style={dropdownItemStyle(chrome, showFlowSimulationPanel, !hasActiveDialogue)}
          onMouseEnter={(e) => {
            if (hasActiveDialogue) e.currentTarget.style.backgroundColor = theme.state.hover.background
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = showFlowSimulationPanel
              ? theme.button.default.background
              : 'transparent'
          }}
        >
          🔀 Simulation flow
        </button>
        <button
          type="button"
          role="menuitem"
          data-testid="btn-game-systems-integration-panel"
          onClick={() => {
            setShowActionsDropdown(false)
            setShowGameSystemsIntegrationPanel((v) => !v)
          }}
          disabled={!hasActiveDialogue}
          style={dropdownItemStyle(chrome, showGameSystemsIntegrationPanel, !hasActiveDialogue)}
          title="Afficher les systèmes de jeu utilisables dans les dialogues (FR94)"
          onMouseEnter={(e) => {
            if (hasActiveDialogue) e.currentTarget.style.backgroundColor = theme.state.hover.background
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = showGameSystemsIntegrationPanel
              ? theme.button.default.background
              : 'transparent'
          }}
        >
          ⚙️ Systèmes de jeu
        </button>
      </>
    )
  }, [
    addNode,
    chrome,
    createEmptyNode,
    handleExportUnity,
    handlePreviewExport,
    handleOpenExportDialog,
    hasActiveDialogue,
    nodes,
    reactFlowInstance,
    selectedNodeId,
    setSelectedNode,
    setShowAIGenerationPanel,
    setShowActionsDropdown,
    setShowFiltersPanel,
    setShowFlowSimulationPanel,
    setShowGameSystemsIntegrationPanel,
    setShowJumpToNodeModal,
    showFlowSimulationPanel,
    showGameSystemsIntegrationPanel,
  ])

  const renderQualityMenuItems = useCallback(() => {
    return (
      <>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setShowValidationToolsDropdown(false)
            setShowQualityLlmPanel((v) => !v)
          }}
          disabled={!hasActiveDialogue}
          style={dropdownItemStyle(chrome, showQualityLlmPanel, !hasActiveDialogue)}
          onMouseEnter={(e) => {
            if (hasActiveDialogue) e.currentTarget.style.backgroundColor = theme.state.hover.background
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = showQualityLlmPanel
              ? theme.button.default.background
              : 'transparent'
          }}
        >
          🧪 Qualité LLM
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setShowValidationToolsDropdown(false)
            setShowAiSlopPanel((v) => !v)
          }}
          disabled={!hasActiveDialogue}
          style={dropdownItemStyle(chrome, showAiSlopPanel, !hasActiveDialogue)}
          onMouseEnter={(e) => {
            if (hasActiveDialogue) e.currentTarget.style.backgroundColor = theme.state.hover.background
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = showAiSlopPanel
              ? theme.button.default.background
              : 'transparent'
          }}
        >
          🧹 Anti-slop IA
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setShowValidationToolsDropdown(false)
            setShowContextDroppingPanel((v) => !v)
          }}
          disabled={!hasActiveDialogue}
          style={dropdownItemStyle(chrome, showContextDroppingPanel, !hasActiveDialogue)}
          onMouseEnter={(e) => {
            if (hasActiveDialogue) e.currentTarget.style.backgroundColor = theme.state.hover.background
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = showContextDroppingPanel
              ? theme.button.default.background
              : 'transparent'
          }}
        >
          🧠 Context dropping
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setShowValidationToolsDropdown(false)
            handleToggleSchemaValidation()
          }}
          disabled={!hasActiveDialogue}
          style={dropdownItemStyle(chrome, showSchemaValidationPanel, !hasActiveDialogue)}
          onMouseEnter={(e) => {
            if (hasActiveDialogue) e.currentTarget.style.backgroundColor = theme.state.hover.background
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = showSchemaValidationPanel
              ? theme.button.default.background
              : 'transparent'
          }}
        >
          ✅ Validation schéma
        </button>
        <button
          type="button"
          role="menuitem"
          data-testid="btn-dialogue-preview"
          onClick={() => {
            setShowValidationToolsDropdown(false)
            onToggleDialoguePreview?.()
          }}
          disabled={!hasActiveDialogue || !onToggleDialoguePreview}
          aria-pressed={showDialoguePreviewPanel}
          style={dropdownItemStyle(chrome, showDialoguePreviewPanel, !hasActiveDialogue || !onToggleDialoguePreview)}
          title="Preview scénario — simuler variables et effets sans sauvegarder"
          onMouseEnter={(e) => {
            if (hasActiveDialogue && onToggleDialoguePreview) {
              e.currentTarget.style.backgroundColor = theme.state.hover.background
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = showDialoguePreviewPanel
              ? theme.button.default.background
              : 'transparent'
          }}
        >
          👁 Preview scénario
        </button>
        <button
          type="button"
          role="menuitem"
          data-testid="btn-cost-breakdown"
          onClick={() => {
            setShowValidationToolsDropdown(false)
            setShowCostBreakdown((v) => !v)
          }}
          disabled={!hasActiveDialogue}
          style={dropdownItemStyle(chrome, showCostBreakdown, !hasActiveDialogue)}
          title="Afficher le breakdown des coûts LLM pour ce dialogue"
          onMouseEnter={(e) => {
            if (hasActiveDialogue) e.currentTarget.style.backgroundColor = theme.state.hover.background
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = showCostBreakdown
              ? theme.button.default.background
              : 'transparent'
          }}
        >
          💰 Coûts
        </button>
      </>
    )
  }, [
    chrome,
    handleToggleSchemaValidation,
    hasActiveDialogue,
    onToggleDialoguePreview,
    setShowAiSlopPanel,
    setShowContextDroppingPanel,
    setShowCostBreakdown,
    setShowQualityLlmPanel,
    setShowValidationToolsDropdown,
    showAiSlopPanel,
    showContextDroppingPanel,
    showCostBreakdown,
    showDialoguePreviewPanel,
    showQualityLlmPanel,
    showSchemaValidationPanel,
  ])

  return { renderActionsMenuItems, renderQualityMenuItems }
}
