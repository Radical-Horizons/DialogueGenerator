/**
 * Nœud personnalisé pour afficher un nœud de dialogue dans le graphe.
 */
import { memo, useState, useCallback, useEffect } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { theme } from '../../../theme'
import { useGraphStore } from '../../../store/graphStore'
import { getNodePrompt } from '../../../api/graph'
import type { NodePromptResponse } from '../../../types/graph'
import { RegenerateNodeModal } from '../RegenerateNodeModal'
import { PromptViewerModal } from '../PromptViewerModal'
import { NODE_DRAG_TOOLTIP } from '../nodeDragTooltip'
import { useGddStaleIndicator } from '../../../hooks/useGddStaleIndicator'
import { useGraphViewStore } from '../../../store/graphViewStore'
import { formatChoiceEffectsSummary } from '../../../utils/choiceEffects'
import {
  evaluateVisibilityConditions,
  formatVisibilityConditionsSummary,
} from '../../../utils/visibilityConditions'
import { linesForAppliedChoiceEffects } from '../../../utils/previewEffectHistory'
import type { ChoiceEffect } from '../../../types/choiceEffects'
import type { VisibilityConditionsBlock } from '../../../types/visibilityConditions'
import {
  getGraphTopologyWarningKind,
  getValidationHighlightKind,
  GRAPH_TOPOLOGY_WARNING_STYLES,
} from '../../../utils/graphStructuralValidation'

interface ValidationError {
  type: string
  node_id?: string
  message: string
  severity: string
  target?: string
}

/** Entrée d'historique de régénération (Story 1.10). */
interface RegenerationEntry {
  timestamp: string
  instructions: string
  generationId: string
  cost?: number
  provider?: string
}

interface DialogueNodeData {
  id: string
  speaker?: string
  line?: string
  choices?: Array<{
    text: string
    targetNode?: string
  }>
  nextNode?: string
  validationErrors?: ValidationError[]
  validationWarnings?: ValidationError[]
  isHighlighted?: boolean
  status?: "pending" | "accepted"  // Métadonnée éditeur, non Unity
  lastGenerationInstructions?: string
  regenerationHistory?: RegenerationEntry[]
  contextGddHash?: string
  contextGddContentFingerprint?: string
  gddContextSelectionsSnapshot?: Record<string, unknown>
  incomingEdgeColor?: string
  [key: string]: unknown
}

// Zones de layout fixes pour éviter toute superposition (handles, lien prompt, tooltip)
const NODE_WIDTH = 280
const BOTTOM_ZONE_LINK_PX = 28 // au-dessus : "Voir le prompt" (28px depuis le bas)
const BOTTOM_RESERVED_WITH_CHOICES = 52 // hasChoices : handles + lien
const BOTTOM_RESERVED_SINGLE = 28 // pas de choix : handle + lien
const CHOICE_TOOLTIP_BOTTOM_PX = 56 // tooltip au survol d’un choix au-dessus du lien
const CONTENT_PADDING_TOP_WHEN_PENDING = 32 // pour ne pas passer sous Accepter/Régénérer/Rejeter

export const DialogueNode = memo(function DialogueNode({
  data,
  selected,
}: NodeProps<DialogueNodeData>) {
  const speaker = data.speaker || 'PNJ'
  const line = data.line || ''
  const title = (data.title as string) || ''
  const choices = data.choices || []
  const hasChoices = choices.length > 0
  const errors = data.validationErrors || []
  const warnings = data.validationWarnings || []
  const hasErrors = errors.length > 0
  const hasWarnings = warnings.length > 0
  const isHighlighted = data.isHighlighted || false
  const nodeStatus = data.status  // "pending" | "accepted" | undefined
  const isPending = nodeStatus === "pending"
  const isAccepted = nodeStatus === "accepted"
  const tag = (data.tag as string) || undefined
  const [isHovered, setIsHovered] = useState(false)
  const [hoveredChoiceIndex, setHoveredChoiceIndex] = useState<number | null>(null)

  const visibilityEvalState = useGraphViewStore((s) => s.visibilityEvalState)
  const dialoguePreviewActive = useGraphViewStore((s) => s.dialoguePreviewActive)
  const applyChoiceEffectsSimulation = useGraphViewStore((s) => s.applyChoiceEffectsSimulation)
  const appendPreviewEffectHistory = useGraphViewStore((s) => s.appendPreviewEffectHistory)
  const previewCatalogById = useGraphViewStore((s) => s.previewCatalogById)
  const nodeVisibility = (data as { visibilityConditions?: VisibilityConditionsBlock })
    .visibilityConditions
  const simActive =
    Object.keys(visibilityEvalState.flags).length > 0 ||
    Object.keys(visibilityEvalState.reputation).length > 0
  const visibilityEvalMode = dialoguePreviewActive || simActive
  const nodeVisOk = !visibilityEvalMode || !nodeVisibility?.items?.length
    ? true
    : evaluateVisibilityConditions(nodeVisibility, visibilityEvalState).satisfied
  const showNodeDim =
    visibilityEvalMode && Boolean(nodeVisibility?.items?.length) && !nodeVisOk
  const nodeCondSummary = formatVisibilityConditionsSummary(nodeVisibility)
  const hasNodeCond = Boolean(nodeVisibility?.items?.length)
  
  // Store pour accept/reject et régénération (Story 1.10)
  const acceptNode = useGraphStore((state) => state.acceptNode)
  const rejectNode = useGraphStore((state) => state.rejectNode)
  const regenerateNode = useGraphStore((state) => state.regenerateNode)
  const [showRegenerateModal, setShowRegenerateModal] = useState(false)
  const [showPromptModal, setShowPromptModal] = useState(false)
  const [promptData, setPromptData] = useState<NodePromptResponse | null>(null)
  const [promptError, setPromptError] = useState<string | null>(null)
  const [promptLoading, setPromptLoading] = useState(false)
  const dialogueId = useGraphStore(
    (s) => s.documentId ?? s.dialogueMetadata.filename ?? 'current'
  )

  const { stale: gddContextStale, checking: gddStaleChecking } = useGddStaleIndicator({
    id: data.id,
    contextGddContentFingerprint: data.contextGddContentFingerprint,
    gddContextSelectionsSnapshot: data.gddContextSelectionsSnapshot,
  })

  // Tronquer le texte pour l'aperçu
  const truncatedLine = line.length > 100 ? `${line.substring(0, 100)}...` : line
  
  // Handlers pour accept/reject avec prévention du double-clic
  const [isProcessing, setIsProcessing] = useState(false)
  
  const handleAccept = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    
    // Prévenir le double-clic
    if (isProcessing) {
      return
    }
    
    setIsProcessing(true)
    try {
      await acceptNode(data.id)
    } catch (error) {
      console.error('Erreur lors de l\'acceptation:', error)
    } finally {
      setIsProcessing(false)
    }
  }
  
  const handleReject = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    
    // Prévenir le double-clic
    if (isProcessing) {
      return
    }
    
    setIsProcessing(true)
    try {
      await rejectNode(data.id)
    } catch (error) {
      console.error('Erreur lors du rejet:', error)
    } finally {
      setIsProcessing(false)
    }
  }
  
  const handleOpenRegenerateModal = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setShowRegenerateModal(true)
  }

  const openAndLoadPromptModal = useCallback(async () => {
    setShowPromptModal(true)
    setPromptData(null)
    setPromptError(null)
    setPromptLoading(true)
    try {
      const res = await getNodePrompt(dialogueId, data.id)
      setPromptData(res)
    } catch (err) {
      setPromptError(
        err instanceof Error ? err.message : 'Impossible de charger le prompt'
      )
    } finally {
      setPromptLoading(false)
    }
  }, [dialogueId, data.id])

  const handleOpenPromptModal = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      openAndLoadPromptModal()
    },
    [openAndLoadPromptModal]
  )

  const promptViewerNodeId = useGraphViewStore((s) => s.promptViewerNodeId)
  useEffect(() => {
    if (promptViewerNodeId === data.id) {
      useGraphViewStore.getState().closePromptViewer()
      openAndLoadPromptModal()
    }
  }, [promptViewerNodeId, data.id, openAndLoadPromptModal])

  const handleClosePromptModal = useCallback(() => {
    setShowPromptModal(false)
    setPromptData(null)
    setPromptError(null)
  }, [])

  const handleRegenerate = async (nodeId: string, newInstructions: string) => {
    await regenerateNode(nodeId, newInstructions)
    setShowRegenerateModal(false)
  }
  
  // Couleur du speaker (hash de l'ID du nœud pour consistance - évite changement de couleur)
  // Utiliser l'ID du nœud plutôt que le speaker pour avoir une couleur stable
  const speakerColor = getSpeakerColor(data.id)
  
  // Déterminer la couleur et le style de la bordure selon le statut et les erreurs
  let borderColor = selected ? '#27AE60' : '#4A90E2'
  let borderStyle: 'solid' | 'dashed' = 'solid'
  
  const validationHighlightKind = getValidationHighlightKind(errors.map((e) => e.type))
  const topologyKind = getGraphTopologyWarningKind(warnings.map((w) => w.type))
  const topologyStyle = topologyKind ? GRAPH_TOPOLOGY_WARNING_STYLES[topologyKind] : null

  if (validationHighlightKind === 'structural') {
    borderColor = theme.state.error.border
  } else if (validationHighlightKind === 'content') {
    borderColor = theme.state.warning.border
  } else if (validationHighlightKind === 'lore') {
    borderColor = theme.state.lore.border
  } else if (hasErrors) {
    borderColor = theme.state.error.border
  } else if (hasWarnings) {
    borderColor = topologyStyle?.border ?? theme.state.warning.color
  } else if (isPending) {
    borderColor = theme.state.pending.border
    borderStyle = 'dashed'
  } else if (isAccepted) {
    borderColor = theme.state.accepted.border
    borderStyle = 'solid'
  }

  const canvasBackground =
    !hasErrors && hasWarnings && topologyStyle && !validationHighlightKind
      ? topologyStyle.background
      : undefined

  const getChoiceHandleLeftPercent = (index: number): number => {
    // Répartition uniforme sur la largeur du node, sans coller aux bords
    return ((index + 1) / (choices.length + 1)) * 100
  }
  
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      useGraphViewStore.getState().openContextMenu(data.id, e.clientX, e.clientY)
    },
    [data.id]
  )

  return (
    <div
      data-testid="graph-node-content"
      data-node-type="dialogue"
      data-status={nodeStatus ?? undefined}
      title={NODE_DRAG_TOOLTIP}
      style={{
        width: NODE_WIDTH,
        minHeight: 120,
        maxHeight: 500,
        border: `2px ${borderStyle} ${borderColor}`,
        borderRadius: 8,
        backgroundColor:
          isHighlighted
            ? theme.state.selected.background
            : (canvasBackground ?? theme.background.tertiary),
        boxShadow: selected
          ? '0 4px 12px rgba(0, 0, 0, 0.3)'
          : isHighlighted
          ? '0 0 0 3px rgba(116, 192, 252, 0.5)'
          : '0 2px 6px rgba(0, 0, 0, 0.2)',
        overflow: 'visible',
        position: 'relative',
        transition: 'all 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        opacity: showNodeDim ? 0.52 : 1,
        filter: showNodeDim ? 'grayscale(35%)' : undefined,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={handleContextMenu}
    >
      {/* Story 9.2 — indicateur conditions sur le nœud */}
      {hasNodeCond && (
        <div
          role="img"
          aria-label="Ce nœud a des conditions de visibilité"
          title={nodeCondSummary || 'Conditions de visibilité'}
          style={{
            position: 'absolute',
            top: tag ? 26 : 4,
            left: tag ? 4 : undefined,
            right: tag ? undefined : hasErrors || hasWarnings ? 56 : 28,
            padding: '2px 5px',
            borderRadius: 4,
            fontSize: '0.65rem',
            fontWeight: 700,
            backgroundColor: theme.background.secondary,
            color: theme.text.secondary,
            border: `1px solid ${theme.border.primary}`,
            zIndex: 11,
          }}
        >
          ◆
        </div>
      )}

      {/* Badge tag (Story 2.11 FR32) */}
      {tag && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            left: 4,
            padding: '2px 6px',
            borderRadius: 4,
            fontSize: '0.7rem',
            fontWeight: 600,
            backgroundColor: theme.background.primary,
            color: theme.text.secondary,
            border: `1px solid ${theme.border.primary}`,
            zIndex: 10,
            maxWidth: NODE_WIDTH - 32,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={tag}
        >
          {tag}
        </div>
      )}
      {/* Badge d'erreur */}
      {hasErrors && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            backgroundColor:
              validationHighlightKind === 'content'
                ? theme.state.warning.border
                : validationHighlightKind === 'lore'
                  ? theme.state.lore.border
                  : theme.state.error.border,
            color: 'white',
            borderRadius: '50%',
            width: 20,
            height: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.75rem',
            fontWeight: 'bold',
            zIndex: 10,
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
          }}
          title={errors.map((e, idx) => {
            const icon =
              e.type === 'orphan_node'
                ? '🔗'
                : e.type === 'broken_reference'
                  ? '🔴'
                  : e.type === 'lore_contradiction_explicit' ||
                    e.type === 'lore_contradiction_potential' ||
                    e.type === 'lore_potential_ambiguity'
                    ? '📜'
                    : e.type === 'empty_node' || e.type === 'missing_dialogue_text'
                      ? '⚪'
                      : e.type === 'missing_display_name'
                        ? '📝'
                        : e.type === 'missing_stable_id'
                          ? '🆔'
                          : '⚠️'
            return `${icon} ${e.message}${idx < errors.length - 1 ? '\n' : ''}`
          }).join('')}
        >
          {errors.length}
        </div>
      )}
      
      {/* Badge d'avertissement */}
      {gddContextStale && !gddStaleChecking && (
        <div
          data-testid="gdd-stale-badge"
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            top: tag ? 26 : 4,
            right: hasErrors || hasWarnings ? 30 : 4,
            padding: '2px 6px',
            borderRadius: 4,
            fontSize: '0.65rem',
            fontWeight: 700,
            backgroundColor: theme.state.warning.background ?? 'rgba(255, 193, 7, 0.25)',
            color: theme.state.warning.color,
            border: `1px solid ${theme.state.warning.color}`,
            zIndex: 9,
            maxWidth: 120,
            textAlign: 'center',
            lineHeight: 1.2,
          }}
          title="GDD mis à jour depuis la génération — régénérer le nœud pour utiliser le lore à jour."
        >
          GDD↑
        </div>
      )}
      {!hasErrors && hasWarnings && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            backgroundColor: topologyStyle?.border ?? theme.state.warning.color,
            color: 'black',
            borderRadius: '50%',
            width: 20,
            height: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.75rem',
            fontWeight: 'bold',
            zIndex: 10,
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
          }}
          title={warnings.map((w, idx) => {
            const icon =
              w.type === 'orphan_node'
                ? '🔗'
                : w.type === 'unreachable_node'
                  ? '📍'
                  : w.type === 'cycle_detected'
                    ? '🔄'
                    : '⚠️'
            return `${icon} ${w.message}${idx < warnings.length - 1 ? '\n' : ''}`
          }).join('')}
        >
          {warnings.length}
        </div>
      )}
      {/* Input Handle (haut) */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: data.incomingEdgeColor ?? '#4A90E2',
          width: 12,
          height: 12,
          border: '2px solid white',
        }}
      />
      
      {/* En-tête : titre en avant-plan, speaker en second plan */}
      <div
        style={{
          padding: '8px 12px',
          backgroundColor: speakerColor,
          borderBottom: `1px solid ${theme.border.primary}`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: 'white',
          }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            flex: 1,
            gap: 2,
          }}
        >
          <span
            style={{
              fontSize: '0.9rem',
              fontWeight: 'bold',
              color: 'white',
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={title ? `${title} (${speaker})` : speaker}
          >
            {title ? title : speaker}
          </span>
          {title ? (
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 'normal',
                color: 'rgba(255,255,255,0.9)',
                textShadow: '0 1px 2px rgba(0, 0, 0, 0.25)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              ({speaker})
            </span>
          ) : null}
        </div>
      </div>
      
      {/* Contenu (dialogue) — padding bas réservé pour handles + "Voir le prompt" */}
      <div
        style={{
          padding: '12px',
          paddingTop:
            isPending && (isHovered || selected)
              ? CONTENT_PADDING_TOP_WHEN_PENDING
              : 12,
          paddingBottom: hasChoices ? BOTTOM_RESERVED_WITH_CHOICES : BOTTOM_RESERVED_SINGLE,
          fontSize: '0.9rem',
          lineHeight: 1.4,
          color: theme.text.primary,
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word',
          flex: '1 1 auto',
          minHeight: 0,
        }}
      >
        {line ? truncatedLine : null}
      </div>
      
      {/* Tooltip au survol d'un rond orange (réponse associée) — au-dessus du lien "Voir le prompt" */}
      {hasChoices && hoveredChoiceIndex !== null && choices[hoveredChoiceIndex] && (
        <div
          style={{
            position: 'absolute',
            left: `${getChoiceHandleLeftPercent(hoveredChoiceIndex)}%`,
            bottom: CHOICE_TOOLTIP_BOTTOM_PX,
            transform: 'translateX(-50%)',
            backgroundColor: theme.background.secondary,
            border: '1px solid #F5A623',
            color: theme.text.primary,
            padding: '6px 8px',
            borderRadius: 8,
            boxShadow: '0 6px 16px rgba(0, 0, 0, 0.35)',
            fontSize: '0.75rem',
            maxWidth: 260,
            lineHeight: 1.25,
            zIndex: 50,
            pointerEvents: 'none',
            whiteSpace: 'normal',
          }}
        >
          <div>{choices[hoveredChoiceIndex].text || `Choix ${hoveredChoiceIndex + 1}`}</div>
          {(() => {
            const ch = choices[hoveredChoiceIndex] as {
              visibilityConditions?: VisibilityConditionsBlock
              condition?: string
              choiceEffects?: ChoiceEffect[]
            }
            const cs = formatVisibilityConditionsSummary(ch.visibilityConditions)
            const fx = formatChoiceEffectsSummary(ch.choiceEffects)
            const legacy = ch.condition?.trim()
            const bits = [
              cs,
              fx ? `effets: ${fx}` : '',
              legacy ? `legacy: ${legacy}` : '',
            ].filter(Boolean)
            if (bits.length === 0) return null
            return (
              <div style={{ marginTop: 6, fontSize: '0.68rem', color: theme.text.secondary }}>
                {bits.join(' · ')}
              </div>
            )
          })()}
        </div>
      )}

      {/* Ronds oranges (handles) uniquement, dans la carte du nœud */}
      {hasChoices &&
        choices.map((choice, index) => {
          const leftPercent = getChoiceHandleLeftPercent(index)
          const label = choice.text || `Choix ${index + 1}`
          const stableId = (choice as { choiceId?: string }).choiceId ?? `__idx_${index}`
          const handleId = `choice:${stableId}`
          const choiceVisibility = (
            choice as { visibilityConditions?: VisibilityConditionsBlock }
          ).visibilityConditions
          const choiceEffectsLen = (
            choice as { choiceEffects?: unknown[] }
          ).choiceEffects?.length ?? 0
          const hasChoiceEffects = choiceEffectsLen > 0
          const choiceVisOk =
            !visibilityEvalMode || !choiceVisibility?.items?.length
              ? true
              : evaluateVisibilityConditions(choiceVisibility, visibilityEvalState).satisfied
          const dimChoice =
            visibilityEvalMode && Boolean(choiceVisibility?.items?.length) && !choiceVisOk
          const choiceFx = (choice as { choiceEffects?: ChoiceEffect[] }).choiceEffects
          return (
            <Handle
              key={stableId}
              type="source"
              position={Position.Bottom}
              id={handleId}
              isConnectable={!dialoguePreviewActive}
              title={label}
              onPointerDown={(e) => {
                if (!dialoguePreviewActive) return
                e.stopPropagation()
                e.preventDefault()
                const prev = useGraphViewStore.getState().visibilityEvalState
                const catalog = previewCatalogById ?? undefined
                applyChoiceEffectsSimulation(choiceFx ?? [], catalog)
                const lines = linesForAppliedChoiceEffects(prev, choiceFx, catalog)
                appendPreviewEffectHistory(lines)
              }}
              onMouseEnter={() => setHoveredChoiceIndex(index)}
              onMouseLeave={() => setHoveredChoiceIndex((prev) => (prev === index ? null : prev))}
              style={{
                background: '#F5A623',
                width: 10,
                height: 10,
                border: '2px solid white',
                borderRadius: '50%',
                left: `${leftPercent}%`,
                bottom: 10,
                transform: 'translateX(-50%)',
                opacity: dimChoice ? 0.48 : 1,
                filter: dimChoice ? 'grayscale(45%)' : undefined,
                boxShadow: hasChoiceEffects
                  ? '0 0 0 2px #9B59B6'
                  : undefined,
              }}
              aria-label={
                hasChoiceEffects
                  ? `${label} — ${choiceEffectsLen} effet(s)`
                  : label
              }
            />
          )
        })}
      
      {/* Output Handle pour nextNode (si pas de choix) */}
      {!hasChoices && (
        <Handle
          type="source"
          position={Position.Bottom}
          isConnectable={!dialoguePreviewActive}
          style={{
            background: '#4A90E2',
            width: 12,
            height: 12,
            border: '2px solid white',
          }}
        />
      )}
      
      {/* Boutons Accept / Régénérer / Reject visibles au hover pour nœuds pending (Story 1.4, 1.10) */}
      {isPending && (isHovered || selected) && !isProcessing && (
        <>
          <button
            onClick={handleAccept}
            disabled={isProcessing}
            style={{
              position: 'absolute',
              top: 34,
              right: 8,
              padding: '0.4rem 0.6rem',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: '#27AE60',
              color: 'white',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
              zIndex: 15,
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)'
              e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.4)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)'
              e.currentTarget.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.3)'
            }}
            title="Accepter le nœud"
          >
            <span>✓</span>
            <span>Accepter</span>
          </button>
          <button
            onClick={handleReject}
            disabled={isProcessing}
            style={{
              position: 'absolute',
              top: 34,
              left: 8,
              padding: '0.4rem 0.6rem',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: '#E74C3C',
              color: 'white',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
              zIndex: 15,
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)'
              e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.4)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)'
              e.currentTarget.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.3)'
            }}
            title="Rejeter le nœud"
          >
            <span>✗</span>
            <span>Rejeter</span>
          </button>
          <button
            onClick={handleOpenRegenerateModal}
            disabled={isProcessing}
            style={{
              position: 'absolute',
              top: 34,
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '0.4rem 0.6rem',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: '#F5A623',
              color: theme.text.inverse,
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
              zIndex: 15,
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateX(-50%) scale(1.05)'
              e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.4)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateX(-50%) scale(1)'
              e.currentTarget.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.3)'
            }}
            title="Régénérer avec d'autres instructions"
          >
            <span>🔄</span>
            <span>Régénérer</span>
          </button>
        </>
      )}

      {/* Voir le prompt (Story 1.14) — zone dédiée au-dessus des handles, jamais superposé */}
      {(isHovered || selected) && (
        <button
          type="button"
          onClick={handleOpenPromptModal}
          style={{
            position: 'absolute',
            bottom: BOTTOM_ZONE_LINK_PX,
            left: 8,
            padding: '0.25rem 0.5rem',
            backgroundColor: 'transparent',
            border: 'none',
            borderRadius: '4px',
            color: theme.text.secondary,
            cursor: 'pointer',
            fontSize: '0.8rem',
            textDecoration: 'underline',
            zIndex: 10,
          }}
          title="Voir le prompt envoyé au LLM pour ce nœud"
        >
          Voir le prompt
        </button>
      )}

      <RegenerateNodeModal
        isOpen={showRegenerateModal}
        nodeId={data.id}
        initialInstructions={data.lastGenerationInstructions ?? ''}
        history={data.regenerationHistory ?? []}
        contextGddChanged={false}
        onRegenerate={handleRegenerate}
        onClose={() => setShowRegenerateModal(false)}
      />
      <PromptViewerModal
        isOpen={showPromptModal}
        data={promptData}
        error={promptError}
        isLoading={promptLoading}
        onClose={handleClosePromptModal}
      />
    </div>
  )
})

/**
 * Génère une couleur consistante basée sur un identifiant (ID du nœud ou nom du speaker).
 * Utilise l'ID du nœud pour garantir une couleur stable même si le speaker change.
 */
function getSpeakerColor(identifier: string): string {
  const colors = [
    '#4A90E2', // Bleu
    '#9013FE', // Violet
    '#F5A623', // Orange
    '#E74C3C', // Rouge
    '#27AE60', // Vert
    '#16A085', // Turquoise
    '#8E44AD', // Violet foncé
    '#D35400', // Orange foncé
  ]
  
  // Hash simple de l'identifiant pour sélectionner une couleur stable
  let hash = 0
  for (let i = 0; i < identifier.length; i++) {
    hash = identifier.charCodeAt(i) + ((hash << 5) - hash)
  }
  
  return colors[Math.abs(hash) % colors.length]
}
