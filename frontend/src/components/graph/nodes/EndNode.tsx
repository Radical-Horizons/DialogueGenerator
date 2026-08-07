/**
 * Nœud personnalisé pour afficher un nœud de fin de dialogue dans le graphe.
 */
import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { theme } from '../../../theme'
import { NODE_DRAG_TOOLTIP } from '../nodeDragTooltip'
import { getValidationHighlightKind } from '../../../utils/graphStructuralValidation'
import {
  redesignAccent,
  redesignFont,
  redesignNodeBorder,
  redesignRadius,
  redesignSurface,
  redesignText,
} from '../../../theme/redesignTokens'

interface ValidationError {
  type: string
  node_id?: string
  message: string
  severity: string
  target?: string
}

interface EndNodeData {
  id: string
  validationErrors?: ValidationError[]
  validationWarnings?: ValidationError[]
  isHighlighted?: boolean
  incomingEdgeColor?: string
  [key: string]: unknown
}

export const EndNode = memo(function EndNode({
  data,
  selected,
}: NodeProps<EndNodeData>) {
  const errors = data?.validationErrors || []
  const warnings = data?.validationWarnings || []
  const hasErrors = errors.length > 0
  const hasWarnings = warnings.length > 0
  const isHighlighted = data?.isHighlighted || false

  const validationHighlightKind = getValidationHighlightKind(errors.map((e) => e.type))
  // Écran 2e : plaque sombre neutre, bordure fine — la sélection passe à l'accent.
  let borderColor: string = selected ? redesignAccent.base : redesignNodeBorder.default
  if (validationHighlightKind === 'structural') {
    borderColor = theme.state.error.border
  } else if (validationHighlightKind === 'content') {
    borderColor = theme.state.warning.border
  } else if (validationHighlightKind === 'lore') {
    borderColor = theme.state.lore.border
  } else if (hasErrors) {
    borderColor = theme.state.error.border
  } else if (hasWarnings) {
    borderColor = theme.state.warning.color
  }

  const backgroundColor = isHighlighted
    ? theme.state.selected.background
    : redesignSurface.panel

  return (
    <div
      data-testid="graph-node-content"
      data-node-type="end"
      title={NODE_DRAG_TOOLTIP}
      style={{
        width: 180,
        border: `1px solid ${borderColor}`,
        borderRadius: redesignRadius.node,
        backgroundColor,
        boxShadow: selected
          ? `0 0 0 3px ${redesignAccent.ring}`
          : isHighlighted
          ? '0 0 0 3px rgba(116, 192, 252, 0.5)'
          : 'none',
        padding: '9px 11px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        position: 'relative',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Badge d'erreur */}
      {hasErrors && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            backgroundColor: theme.state.error.border,
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
                  : e.type === 'empty_node' || e.type === 'missing_dialogue_text'
                    ? '⚪'
                    : e.type === 'missing_display_name'
                      ? '📝'
                      : e.type === 'missing_stable_id'
                        ? '🆔'
                        : e.type === 'missing_test'
                          ? '🧪'
                          : '⚠️'
            return `${icon} ${e.message}${idx < errors.length - 1 ? '\n' : ''}`
          }).join('')}
        >
          {errors.length}
        </div>
      )}
      
      {/* Badge d'avertissement */}
      {!hasErrors && hasWarnings && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            backgroundColor: theme.state.warning.color,
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
            const icon = w.type === 'unreachable_node' ? '📍' : w.type === 'cycle_detected' ? '🔄' : '⚠️'
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
          background: data.incomingEdgeColor ?? '#B8B8B8',
          width: 12,
          height: 12,
          border: '2px solid white',
        }}
      />

      {/* Libellé mono maquette 2e : `FIN` + carré plein. */}
      <span
        title="Fin du dialogue"
        style={{
          fontFamily: redesignFont.mono,
          fontSize: '9.5px',
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
          color: redesignText.muted,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        Fin du dialogue
      </span>
      <span aria-hidden style={{ fontSize: 11, color: redesignText.label, flexShrink: 0 }}>
        ■
      </span>

      {/* Pas de handle de sortie (c'est une fin) */}
    </div>
  )
})
