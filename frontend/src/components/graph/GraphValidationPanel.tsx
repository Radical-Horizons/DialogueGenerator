/**
 * Panneau d'erreurs de validation du graphe (overlay absolu).
 * Extrait de GraphEditor pour isoler ce bloc JSX.
 * Appelle useGraphStore() en interne pour les actions de navigation et les cycles intentionnels.
 */
import type { ReactFlowInstance } from 'reactflow'
import { useGraphStore } from '../../store/graphStore'
import { theme } from '../../theme'
import type { ValidationErrorDetail } from '../../types/graph'
import { summarizeGraphValidationWarnings } from '../../utils/graphValidationSummary'

const ICON_FOR_TYPE: Record<string, string> = {
  orphan_node: '🔗',
  broken_reference: '🔴',
  empty_node: '⚪',
  missing_test: '❓',
  unreachable_node: '📍',
  cycle_detected: '🔄',
}

const LABEL_FOR_TYPE: Record<string, string> = {
  orphan_node: 'Nœud orphelin détecté',
  broken_reference: 'Références cassées',
  empty_node: 'Nœuds vides',
  missing_test: 'Tests manquants',
  unreachable_node: 'Nœuds inaccessibles',
  cycle_detected: 'Cycles détectés',
}

function getIconForType(type: string): string {
  return ICON_FOR_TYPE[type] ?? '⚠️'
}

function getLabelForType(type: string): string {
  return LABEL_FOR_TYPE[type] ?? 'Autres'
}

interface GraphValidationPanelProps {
  validationErrors: ValidationErrorDetail[]
  reactFlowInstance: ReactFlowInstance | null
}

export function GraphValidationPanel({
  validationErrors,
  reactFlowInstance,
}: GraphValidationPanelProps) {
  const {
    nodes,
    edges,
    setSelectedNode,
    intentionalCycles,
    markCycleAsIntentional,
    unmarkCycleAsIntentional,
  } = useGraphStore()

  const errors = validationErrors.filter((e) => e.severity === 'error')
  const warningSummary = summarizeGraphValidationWarnings(
    nodes,
    edges,
    validationErrors,
    intentionalCycles
  )
  const warnings = warningSummary.visibleWarnings

  const errorsByType = errors.reduce(
    (acc, err) => {
      const type = err.type || 'other'
      if (!acc[type]) acc[type] = []
      acc[type].push(err)
      return acc
    },
    {} as Record<string, ValidationErrorDetail[]>
  )

  const warningsByType = warnings.reduce(
    (acc, warn) => {
      const type = warn.type || 'other'
      if (!acc[type]) acc[type] = []
      acc[type].push(warn)
      return acc
    },
    {} as Record<string, ValidationErrorDetail[]>
  )

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        right: 16,
        maxHeight: '350px',
        overflowY: 'auto',
        backgroundColor:
          errors.length > 0 ? theme.state.error.background : theme.state.warning.background,
        border: `1px solid ${
          errors.length > 0 ? theme.state.error.border : theme.state.warning.color
        }`,
        borderRadius: '6px',
        padding: '0.75rem',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          fontSize: '0.85rem',
          fontWeight: 'bold',
          color: errors.length > 0 ? theme.state.error.color : theme.state.warning.color,
          marginBottom: '0.75rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <span>{errors.length > 0 ? '✗' : '⚠'}</span>
        <span>
          {errors.length > 0
            ? `${errors.length} erreur${errors.length > 1 ? 's' : ''}`
            : `${warnings.length} avertissement${warnings.length > 1 ? 's' : ''}`}
        </span>
      </div>

      {errors.length === 0 && warnings.length > 0 && (
        <div
          style={{
            fontSize: '0.75rem',
            color: theme.state.warning.color,
            marginBottom: '0.75rem',
            opacity: 0.95,
          }}
        >
          {warningSummary.disconnectedBranchCount > 0 && (
            <span>
              {warningSummary.disconnectedBranchCount} branche
              {warningSummary.disconnectedBranchCount > 1 ? 's' : ''} déconnectée
              {warningSummary.disconnectedBranchCount > 1 ? 's' : ''}
              {warningSummary.countsByType.unreachable_node
                ? `, ${warningSummary.countsByType.unreachable_node} nœud${
                    warningSummary.countsByType.unreachable_node > 1 ? 's' : ''
                  } inaccessibles`
                : ''}
              {warningSummary.countsByType.cycle_detected
                ? `, ${warningSummary.countsByType.cycle_detected} cycle${
                    warningSummary.countsByType.cycle_detected > 1 ? 's' : ''
                  }`
                : ''}
            </span>
          )}
        </div>
      )}

      {errors.length > 0 &&
        Object.entries(errorsByType).map(([type, typeErrors]) => (
          <div key={`error-${type}`} style={{ marginBottom: '0.75rem' }}>
            <div
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: theme.state.error.color,
                marginBottom: '0.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <span>{getIconForType(type)}</span>
              <span>
                {getLabelForType(type)} ({typeErrors.length})
              </span>
            </div>
            {typeErrors.map((err, idx) => (
              <div
                key={idx}
                onClick={() => {
                  if (err.node_id) setSelectedNode(err.node_id)
                }}
                style={{
                  fontSize: '0.75rem',
                  color: theme.state.error.color,
                  marginBottom: '0.2rem',
                  padding: '0.3rem 0.5rem',
                  borderRadius: '4px',
                  cursor: err.node_id ? 'pointer' : 'default',
                  backgroundColor: err.node_id ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                  transition: 'background-color 0.2s',
                  marginLeft: '1.5rem',
                }}
                onMouseEnter={(e) => {
                  if (err.node_id)
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'
                }}
                onMouseLeave={(e) => {
                  if (err.node_id)
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'
                }}
              >
                {err.node_id ? `[${err.node_id}] ` : ''}
                {err.message}
              </div>
            ))}
          </div>
        ))}

      {warnings.length > 0 &&
        Object.entries(warningsByType).map(([type, typeWarnings]) => (
          <div key={`warning-${type}`} style={{ marginBottom: '0.75rem' }}>
            <div
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: theme.state.warning.color,
                marginBottom: '0.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <span>{getIconForType(type)}</span>
              <span>
                {getLabelForType(type)} ({typeWarnings.length})
              </span>
            </div>
            {typeWarnings.map((warn, idx) => {
              const isCycle =
                type === 'cycle_detected' && warn.cycle_path && warn.cycle_nodes
              const handleClick = () => {
                if (isCycle && reactFlowInstance && warn.cycle_nodes) {
                  const cycleNodeObjects = warn.cycle_nodes
                    .map((nodeId) => reactFlowInstance.getNode(nodeId))
                    .filter((node) => node !== undefined)
                  if (cycleNodeObjects.length > 0) {
                    reactFlowInstance.fitView({
                      nodes: cycleNodeObjects,
                      padding: 0.2,
                      duration: 300,
                    })
                  }
                } else if (warn.node_id) {
                  setSelectedNode(warn.node_id)
                }
              }
              return (
                <div
                  key={idx}
                  onClick={handleClick}
                  style={{
                    fontSize: '0.75rem',
                    color: theme.state.warning.color,
                    marginBottom: '0.2rem',
                    padding: '0.3rem 0.5rem',
                    borderRadius: '4px',
                    cursor: isCycle || warn.node_id ? 'pointer' : 'default',
                    backgroundColor:
                      isCycle || warn.node_id ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                    transition: 'background-color 0.2s',
                    marginLeft: '1.5rem',
                  }}
                  onMouseEnter={(e) => {
                    if (isCycle || warn.node_id)
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'
                  }}
                  onMouseLeave={(e) => {
                    if (isCycle || warn.node_id)
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'
                  }}
                  title={isCycle ? 'Cliquer pour zoomer sur les nœuds du cycle' : undefined}
                >
                  {isCycle ? (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span style={{ fontWeight: 500, flex: 1 }}>{warn.cycle_path}</span>
                      {warn.cycle_id && (
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                            userSelect: 'none',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={intentionalCycles.includes(warn.cycle_id)}
                            onChange={(e) => {
                              e.stopPropagation()
                              if (warn.cycle_id) {
                                if (e.target.checked) {
                                  markCycleAsIntentional(warn.cycle_id)
                                } else {
                                  unmarkCycleAsIntentional(warn.cycle_id)
                                }
                              }
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                          <span>Marquer comme intentionnel</span>
                        </label>
                      )}
                    </div>
                  ) : (
                    <>
                      {warn.node_id ? `[${warn.node_id}] ` : ''}
                      {warn.message}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        ))}
    </div>
  )
}
