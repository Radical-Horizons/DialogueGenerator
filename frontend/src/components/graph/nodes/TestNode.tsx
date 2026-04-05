/**
 * Nœud personnalisé pour afficher un nœud de test d'attribut dans le graphe.
 */
import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { theme } from '../../../theme'
import { NODE_DRAG_TOOLTIP } from '../nodeDragTooltip'
import { TEST_RESULT_EDGE_CONFIG } from '../../../utils/graphEdgeBuilders'
import { getValidationHighlightKind } from '../../../utils/graphStructuralValidation'

interface ValidationError {
  type: string
  node_id?: string
  message: string
  severity: string
  target?: string
}

interface TestNodeData {
  id: string
  test?: string
  line?: string
  criticalFailureNode?: string
  failureNode?: string
  successNode?: string
  criticalSuccessNode?: string
  validationErrors?: ValidationError[]
  validationWarnings?: ValidationError[]
  isHighlighted?: boolean
  incomingEdgeColor?: string
  [key: string]: unknown
}

/**
 * Formate un test d'attribut pour l'affichage.
 * Ex: "Raison+Architecture:8" => "Architecture (DD8)"
 */
function formatTest(test: string): string {
  if (!test) return 'Test non défini'
  
  try {
    // Format attendu: "Attribut+Compétence:DD"
    const parts = test.split(':')
    if (parts.length !== 2) return test // Format invalide, retourner tel quel
    
    const dd = parts[1]
    const attributCompetence = parts[0]
    
    // Extraire la compétence (après le +)
    const competenceParts = attributCompetence.split('+')
    if (competenceParts.length >= 2) {
      const competence = competenceParts[competenceParts.length - 1] // Dernière partie après +
      return `${competence} (DD${dd})`
    }
    
    // Si pas de +, utiliser tout le texte avant :
    return `${attributCompetence} (DD${dd})`
  } catch {
    return test // En cas d'erreur, retourner tel quel
  }
}

export const TestNode = memo(function TestNode({
  data,
  selected,
}: NodeProps<TestNodeData>) {
  const test = data.test || 'Test non défini'
  const formattedTest = formatTest(test)
  const errors = data.validationErrors || []
  const warnings = data.validationWarnings || []
  const hasErrors = errors.length > 0
  const hasWarnings = warnings.length > 0
  const isHighlighted = data.isHighlighted || false
  
  const validationHighlightKind = getValidationHighlightKind(errors.map((e) => e.type))
  let borderColor = selected ? '#27AE60' : '#F5A623'
  if (validationHighlightKind === 'structural') {
    borderColor = theme.state.error.border
  } else if (validationHighlightKind === 'content') {
    borderColor = theme.state.warning.border
  } else if (hasErrors) {
    borderColor = theme.state.error.border
  } else if (hasWarnings) {
    borderColor = theme.state.warning.color
  }

  const backgroundColor = isHighlighted
    ? theme.state.selected.background
    : validationHighlightKind === 'structural'
      ? theme.state.error.background
      : validationHighlightKind === 'content'
        ? theme.state.warning.background
        : hasErrors
          ? theme.state.error.background
          : hasWarnings
            ? theme.state.warning.background
            : '#16a085'
  
  // Barre compacte avec 4 handles
  return (
    <div
      data-testid="graph-node-content"
      data-node-type="test"
      title={NODE_DRAG_TOOLTIP}
      style={{
        width: 200,
        height: 44, // Hauteur réduite mais suffisante pour les cercles complets
        border: `2px solid ${borderColor}`,
        borderRadius: 8,
        backgroundColor,
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
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px 4px', // Padding adapté à la hauteur réduite
      }}
    >
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
                  : e.type === 'empty_node' || e.type === 'missing_dialogue_text'
                    ? '⚪'
                    : e.type === 'missing_display_name'
                      ? '📝'
                      : e.type === 'missing_stable_id'
                        ? '🆔'
                        : e.type === 'missing_test'
                          ? '❓'
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
      
      {/* Input Handle (haut) - totalement transparent mais nécessaire pour les connexions */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: data.incomingEdgeColor ?? '#4A90E2',
          width: 12,
          height: 12,
          border: '2px solid white',
          top: -1,
        }}
      />
      
      {/* Test formaté (ex: "Architecture (DD8)") - centré dans la barre */}
      <div
        style={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: '0.8rem',
          color: theme.text.primary,
          fontWeight: '600',
          textAlign: 'center',
          padding: '0 8px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '100%',
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: -15, // Remonte le texte
        }}
        title={test} // Tooltip avec le format original
      >
        {formattedTest}
      </div>
      
      {/* Output Handles (bas) - 4 handles répartis équitablement avec couleurs vives */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="critical-failure"
        style={{
          background: TEST_RESULT_EDGE_CONFIG[0].color,
          width: 12,
          height: 12,
          border: '2px solid white',
          left: '12.5%',
          bottom: 2, // Positionné légèrement à l'intérieur pour être complètement visible
        }}
        title="Échec critique"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="failure"
        style={{
          background: TEST_RESULT_EDGE_CONFIG[1].color,
          width: 12,
          height: 12,
          border: '2px solid white',
          left: '37.5%',
          bottom: 2, // Positionné légèrement à l'intérieur pour être complètement visible
        }}
        title="Échec"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="success"
        style={{
          background: TEST_RESULT_EDGE_CONFIG[2].color,
          width: 12,
          height: 12,
          border: '2px solid white',
          left: '62.5%',
          bottom: 2, // Positionné légèrement à l'intérieur pour être complètement visible
        }}
        title="Réussite"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="critical-success"
        style={{
          background: TEST_RESULT_EDGE_CONFIG[3].color,
          width: 12,
          height: 12,
          border: '2px solid white',
          left: '87.5%',
          bottom: 2, // Positionné légèrement à l'intérieur pour être complètement visible
        }}
        title="Réussite critique"
      />
    </div>
  )
})
