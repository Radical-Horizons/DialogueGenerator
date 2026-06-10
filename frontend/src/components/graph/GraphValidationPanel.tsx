/**
 * Panneau d'erreurs de validation du graphe (overlay absolu).
 * Extrait de GraphEditor pour isoler ce bloc JSX.
 * Appelle useGraphStore() en interne pour les actions de navigation et les cycles intentionnels.
 */
import { useCallback, useMemo } from 'react'
import { useGraphStore } from '../../store/graphStore'
import { theme } from '../../theme'
import type { ValidationErrorDetail } from '../../types/graph'
import { useLoreWarningPanelState } from '../../hooks/useLoreWarningPanelState'
import {
  applyLoreWarningFilters,
  countVisibleDismissibleLoreWarnings,
  isDismissibleLoreWarning,
  resolveLoreWarningKey,
} from '../../utils/loreWarningUi'
import { summarizeGraphValidationWarnings } from '../../utils/graphValidationSummary'
import { LoreWarningFilterBar } from './LoreWarningFilterBar'
import {
  ValidationErrorsByType,
  ValidationWarningsByType,
} from './GraphValidationPanelLists'
import { GraphStructuralWarningsSummary } from './GraphStructuralWarningsSummary'
import { GraphToolFloatingShell } from './GraphToolFloatingShell'

interface GraphValidationPanelProps {
  validationErrors: ValidationErrorDetail[]
  /** Résumé contradictions explicites uniquement (`summary_explicit_only`, FR39 AC #5). */
  loreExplicitSummary?: string | null
  /** Clé stable dialogue (filename ou documentId) pour persistance FR39 */
  loreDialogueScopeKey?: string
  /** Ferme le bandeau (masque le panneau dans l’éditeur). */
  onClose: () => void
}

export function GraphValidationPanel({
  validationErrors,
  loreExplicitSummary,
  loreDialogueScopeKey = 'default',
  onClose,
}: GraphValidationPanelProps) {
  const {
    nodes,
    edges,
    selectedNodeIds,
    setSelectedNode,
    syncNodeDocumentId,
    intentionalCycles,
    markCycleAsIntentional,
    unmarkCycleAsIntentional,
    batchDeleteNodes,
    validateGraph,
  } = useGraphStore()

  const {
    showIgnored,
    setShowIgnored,
    typeFilter,
    setTypeFilter,
    dispositions,
    setDisposition,
  } = useLoreWarningPanelState(loreDialogueScopeKey)

  const loreFilterOpts = useMemo(
    () => ({ dispositions, showIgnored, typeFilter }),
    [dispositions, showIgnored, typeFilter]
  )

  const filteredValidationErrors = useMemo(
    () => applyLoreWarningFilters(validationErrors, loreFilterOpts),
    [validationErrors, loreFilterOpts]
  )

  const dismissibleVisibleCount = useMemo(
    () => countVisibleDismissibleLoreWarnings(validationErrors, loreFilterOpts),
    [validationErrors, loreFilterOpts]
  )

  const loreTypeOptions = useMemo(() => {
    const s = new Set<string>()
    for (const e of validationErrors) {
      if (isDismissibleLoreWarning(e)) {
        s.add(e.type)
      }
    }
    return Array.from(s)
  }, [validationErrors])

  const errors = filteredValidationErrors.filter((e) => e.severity === 'error')
  const warningSummary = summarizeGraphValidationWarnings(
    nodes,
    edges,
    filteredValidationErrors,
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

  const orphanIdsInPanel = useMemo(() => {
    const s = new Set<string>()
    for (const e of filteredValidationErrors) {
      if (e.severity === 'warning' && e.type === 'orphan_node' && e.node_id) {
        s.add(e.node_id)
      }
    }
    return s
  }, [filteredValidationErrors])

  const selectedOrphanIdsToDelete = useMemo(
    () => selectedNodeIds.filter((id) => orphanIdsInPanel.has(id)),
    [selectedNodeIds, orphanIdsInPanel]
  )

  const handleDeleteSelectedOrphans = useCallback(async () => {
    if (selectedOrphanIdsToDelete.length === 0) return
    batchDeleteNodes(selectedOrphanIdsToDelete)
    try {
      await validateGraph()
    } catch {
      /* validateGraph loggue déjà */
    }
  }, [batchDeleteNodes, selectedOrphanIdsToDelete, validateGraph])

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
    <GraphToolFloatingShell
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
          <span aria-hidden>{headerIcon}</span>
          <span>{headerText}</span>
        </span>
      }
      onClose={onClose}
      dataTestId="graph-validation-panel"
      storageKey="graph-validation-errors"
      initialOffset={{ top: 120, left: 40 }}
      width="min(720px, calc(100vw - 24px))"
      maxHeight="min(65vh, 520px)"
      closeButtonTestId="validation-panel-close"
      closeAriaLabel="Fermer le panneau de validation"
      closeButtonChildren="×"
      closeButtonStyle={{
        width: 28,
        height: 28,
        padding: 0,
        lineHeight: 1,
        border: `1px solid ${panelBorder}`,
        borderRadius: 6,
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
        color: headerColor,
        fontSize: '1rem',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      containerStyle={{
        backgroundColor: panelBg,
        border: `1px solid ${panelBorder}`,
      }}
      headerBarStyle={{
        backgroundColor: panelBg,
        color: headerColor,
        borderBottom: `1px solid ${panelBorder}`,
      }}
    >
      {((warningSummary.countsByType.orphan_node ?? 0) > 0 ||
        (warningSummary.countsByType.unreachable_node ?? 0) > 0 ||
        warningSummary.cycleCount > 0) && (
        <GraphStructuralWarningsSummary warningSummary={warningSummary} />
      )}

      {selectedNodeIds.length > 0 ? (
        <div style={{ marginBottom: '0.65rem' }}>
          <button
            type="button"
            data-testid="validation-delete-selected-orphans"
            disabled={selectedOrphanIdsToDelete.length === 0}
            onClick={() => void handleDeleteSelectedOrphans()}
            style={{
              fontSize: '0.72rem',
              padding: '0.35rem 0.55rem',
              borderRadius: 6,
              border: `1px solid ${panelBorder}`,
              backgroundColor: 'rgba(0, 0, 0, 0.25)',
              color: headerColor,
              cursor: selectedOrphanIdsToDelete.length > 0 ? 'pointer' : 'not-allowed',
              opacity: selectedOrphanIdsToDelete.length > 0 ? 1 : 0.55,
            }}
          >
            Supprimer la sélection (orphelins uniquement — {selectedOrphanIdsToDelete.length} nœud
            {selectedOrphanIdsToDelete.length > 1 ? 's' : ''})
          </button>
        </div>
      ) : null}

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
          <strong>Contradictions lore</strong> — {loreExplicitSummary}
        </div>
      ) : null}

      <LoreWarningFilterBar
        loreTypeOptions={loreTypeOptions}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        showIgnored={showIgnored}
        setShowIgnored={setShowIgnored}
        dismissibleVisibleCount={dismissibleVisibleCount}
      />

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
          setSelectedNode={setSelectedNode}
          intentionalCycles={intentionalCycles}
          markCycleAsIntentional={markCycleAsIntentional}
          unmarkCycleAsIntentional={unmarkCycleAsIntentional}
          loreWarningUi={{
            getDisposition: (w) => dispositions[resolveLoreWarningKey(w)] ?? 'active',
            onDisposition: (w, d) => setDisposition(resolveLoreWarningKey(w), d),
            showIgnored,
          }}
        />
      ) : null}
    </GraphToolFloatingShell>
  )
}
