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
  /** Résumé API dernière validation lore explicite (FR38) */
  loreExplicitSummary?: string | null
  /** Ferme le bandeau (masque le panneau dans l’éditeur). */
  onClose: () => void
}

export function GraphValidationPanel({
  validationErrors,
  reactFlowInstance,
  loreExplicitSummary,
  onClose,
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

  const tone: 'error' | 'warning' | 'success' =
    errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'success'

  const panelBg =
    tone === 'error'
      ? theme.state.error.background
      : tone === 'warning'
        ? theme.state.warning.background
        : theme.state.success.background
  const panelBorder =
    tone === 'error'
      ? theme.state.error.border
      : tone === 'warning'
        ? theme.state.warning.border
        : theme.state.success.color
  const headerColor =
    tone === 'error'
      ? theme.state.error.color
      : tone === 'warning'
        ? theme.state.warning.color
        : theme.state.success.color

  const headerIcon = tone === 'error' ? '✗' : tone === 'warning' ? '⚠' : '✓'
  const headerText =
    errors.length > 0
      ? `${errors.length} erreur${errors.length > 1 ? 's' : ''}`
      : `${warnings.length} avertissement${warnings.length > 1 ? 's' : ''}`

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        right: 16,
        maxHeight: '350px',
        overflowY: 'auto',
        backgroundColor: panelBg,
        border: `1px solid ${panelBorder}`,
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
          color: headerColor,
          marginBottom: '0.75rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
          <span aria-hidden>{headerIcon}</span>
          <span>{headerText}</span>
        </div>
        <button
          type="button"
          aria-label="Fermer le panneau de validation"
          data-testid="validation-panel-close"
          onClick={onClose}
          style={{
            flexShrink: 0,
            width: 28,
            height: 28,
            padding: 0,
            lineHeight: 1,
            border: `1px solid ${panelBorder}`,
            borderRadius: 6,
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            color: headerColor,
            cursor: 'pointer',
            fontSize: '1rem',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ×
        </button>
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

      {loreExplicitSummary ? (
        <div
          style={{
            fontSize: '0.78rem',
            color: theme.state.lore.color,
            marginBottom: '0.65rem',
            padding: '0.35rem 0.5rem',
            borderRadius: 4,
            border: `1px solid ${theme.state.lore.border}`,
            backgroundColor: theme.state.lore.background,
          }}
          data-testid="lore-explicit-summary"
        >
          <strong>Lore (explicite)</strong> — {loreExplicitSummary}
        </div>
      ) : null}

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
