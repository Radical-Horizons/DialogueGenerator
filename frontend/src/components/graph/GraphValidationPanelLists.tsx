import type { ReactFlowInstance } from 'reactflow'
import { useGraphViewStore } from '../../store/graphViewStore'
import { theme } from '../../theme'
import type { ValidationErrorDetail } from '../../types/graph'
import {
  getIconForType,
  getLabelForType,
  isDocumentIdRepairable,
} from './validationPanelLabels'

interface ValidationErrorsByTypeProps {
  errorsByType: Record<string, ValidationErrorDetail[]>
  setSelectedNode: (id: string) => void
  syncNodeDocumentId: (id: string) => void
}

export function ValidationErrorsByType({
  errorsByType,
  setSelectedNode,
  syncNodeDocumentId,
}: ValidationErrorsByTypeProps) {
  return (
    <>
      {Object.entries(errorsByType).map(([type, typeErrors]) => (
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
                if (err.node_id) {
                  setSelectedNode(err.node_id)
                  useGraphViewStore.getState().focusNode(err.node_id)
                }
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
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                flexWrap: 'wrap',
              }}
              onMouseEnter={(e) => {
                if (err.node_id) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'
              }}
              onMouseLeave={(e) => {
                if (err.node_id) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'
              }}
            >
              <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                {err.node_id ? `[${err.node_id}] ` : ''}
                {err.message}
              </span>
              {isDocumentIdRepairable(err) && err.node_id ? (
                <button
                  type="button"
                  aria-label="Générer stableID (aligner data.id)"
                  onClick={(e) => {
                    e.stopPropagation()
                    syncNodeDocumentId(err.node_id as string)
                  }}
                  style={{
                    fontSize: '0.7rem',
                    padding: '0.2rem 0.45rem',
                    borderRadius: '4px',
                    border: `1px solid ${theme.state.error.border}`,
                    backgroundColor: 'rgba(255, 255, 255, 0.15)',
                    color: theme.state.error.color,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  Générer stableID
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ))}
    </>
  )
}

interface ValidationWarningsByTypeProps {
  warningsByType: Record<string, ValidationErrorDetail[]>
  reactFlowInstance: ReactFlowInstance | null
  setSelectedNode: (id: string) => void
  intentionalCycles: string[]
  markCycleAsIntentional: (id: string) => void
  unmarkCycleAsIntentional: (id: string) => void
}

export function ValidationWarningsByType({
  warningsByType,
  reactFlowInstance,
  setSelectedNode,
  intentionalCycles,
  markCycleAsIntentional,
  unmarkCycleAsIntentional,
}: ValidationWarningsByTypeProps) {
  return (
    <>
      {Object.entries(warningsByType).map(([type, typeWarnings]) => (
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
                useGraphViewStore.getState().focusNode(warn.node_id)
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
    </>
  )
}
