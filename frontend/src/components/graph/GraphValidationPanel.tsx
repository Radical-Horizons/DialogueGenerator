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
import {
  ValidationErrorsByType,
  ValidationWarningsByType,
} from './GraphValidationPanelLists'

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
    syncNodeDocumentId,
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

      {errors.length > 0 ? (
        <ValidationErrorsByType
          errorsByType={errorsByType}
          setSelectedNode={setSelectedNode}
          syncNodeDocumentId={syncNodeDocumentId}
        />
      ) : null}

      {warnings.length > 0 ? (
        <ValidationWarningsByType
          warningsByType={warningsByType}
          reactFlowInstance={reactFlowInstance}
          setSelectedNode={setSelectedNode}
          intentionalCycles={intentionalCycles}
          markCycleAsIntentional={markCycleAsIntentional}
          unmarkCycleAsIntentional={unmarkCycleAsIntentional}
        />
      ) : null}
    </div>
  )
}
