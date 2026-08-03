/**
 * Badge santé graphe, indicateur sauvegarde et menu batch (Story 17.9).
 */
import type { ReactNode } from 'react'
import type { Edge, Node } from '@xyflow/react'
import { SaveStatusIndicator } from '../shared'
import { theme } from '../../theme'
import { redesignFont } from '../../theme/redesignTokens'
import { BatchOperationsMenu } from './BatchOperationsMenu'
import {
  formatGraphWarningBadgeLabel,
  summarizeGraphValidationWarnings,
} from '../../utils/graphValidationSummary'
import type { ValidationErrorDetail } from '../../types/graph'
import type { GraphToolbarChromeTokens } from './graphToolbarTypes'

export interface GraphToolbarStatusRowProps {
  isNarrowToolbar: boolean
  chrome: GraphToolbarChromeTokens
  /** Sous-ensemble à rendre en mode confort (défaut : tout). Ignoré en narrow row. */
  segments?: Array<'batch' | 'health' | 'save'>
  /** Contenu outils (layout, raccourcis…) — rendu dans row-status en narrow uniquement. */
  toolsGroup?: ReactNode
  selectedNodeIds: string[]
  canEditGraph: boolean
  onBatchDeleteClick: () => void
  onBatchTagApply: (tag: string) => void
  onBatchValidateClick: () => void
  nodes: Node[]
  edges: Edge[]
  graphValidationErrors: ValidationErrorDetail[]
  intentionalCycles: string[]
  showValidationPanel: boolean
  setShowValidationPanel: React.Dispatch<React.SetStateAction<boolean>>
  activeDialogueFilename: string | null
  lastSaveError: string | null
  isGraphSaving: boolean
  hasUnsavedChanges: boolean
  lastSavedAt: string | null
  syncStatus: 'synced' | 'offline' | 'error'
  lastAckSeq: number | null
}

function GraphHealthBadge({
  isNarrowToolbar,
  nodes,
  edges,
  graphValidationErrors,
  intentionalCycles,
  showValidationPanel,
  setShowValidationPanel,
}: Pick<
  GraphToolbarStatusRowProps,
  | 'isNarrowToolbar'
  | 'nodes'
  | 'edges'
  | 'graphValidationErrors'
  | 'intentionalCycles'
  | 'showValidationPanel'
  | 'setShowValidationPanel'
>) {
  const graphErrs = graphValidationErrors ?? []
  const errors = graphErrs.filter((e) => e.severity === 'error')
  const warningSummary = summarizeGraphValidationWarnings(
    nodes,
    edges,
    graphErrs,
    intentionalCycles
  )
  const warnings = warningSummary.visibleWarnings
  const hasErrors = errors.length > 0
  const hasWarnings = warnings.length > 0 && !hasErrors
  const isValid = !hasErrors && !hasWarnings
  const canToggle = hasErrors || hasWarnings
  const warningLabel = formatGraphWarningBadgeLabel(warningSummary)
  const title = isValid
    ? 'Graphe valide (validation automatique à chaque sauvegarde)'
    : canToggle
      ? showValidationPanel
        ? 'Cliquer pour masquer les détails'
        : 'Cliquer pour afficher les détails'
      : hasErrors
        ? `${errors.length} erreur(s) détectée(s)`
        : warningSummary.disconnectedBranchCount > 0
          ? `${warnings.length} avertissement(s), dont ${warningSummary.disconnectedBranchCount} branche(s) déconnectée(s)`
          : `${warnings.length} avertissement(s) détecté(s)`
  const label = isValid
    ? isNarrowToolbar
      ? 'Valide'
      : 'Graphe valide'
    : hasErrors
      ? `${errors.length} erreur${errors.length > 1 ? 's' : ''}`
      : warningLabel

  // Refonte UI : point + libellé mono, plus de pastille à fond coloré.
  const dotColor = isValid
    ? theme.state.accepted.border
    : hasErrors
      ? theme.state.error.color
      : theme.state.pending.border

  return (
    <span
      data-testid="graph-health-badge"
      title={title}
      onClick={canToggle ? () => setShowValidationPanel((v) => !v) : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        cursor: canToggle ? 'pointer' : 'default',
        fontFamily: redesignFont.mono,
        fontSize: '10.5px',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: theme.text.secondary,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: dotColor,
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  )
}

function GraphSaveStatusIndicator({
  activeDialogueFilename,
  lastSaveError,
  isGraphSaving,
  hasUnsavedChanges,
  lastSavedAt,
  syncStatus,
  lastAckSeq,
}: Pick<
  GraphToolbarStatusRowProps,
  | 'activeDialogueFilename'
  | 'lastSaveError'
  | 'isGraphSaving'
  | 'hasUnsavedChanges'
  | 'lastSavedAt'
  | 'syncStatus'
  | 'lastAckSeq'
>) {
  const status: 'saved' | 'saving' | 'unsaved' | 'error' = lastSaveError
    ? 'error'
    : isGraphSaving
      ? 'saving'
      : hasUnsavedChanges
        ? 'unsaved'
        : 'saved'
  const pendingCount = hasUnsavedChanges ? 1 : 0
  const syncStatusDisplay =
    syncStatus === 'synced' && typeof navigator !== 'undefined' && !navigator.onLine
      ? 'offline'
      : syncStatus

  if (!activeDialogueFilename) return null

  return (
    <SaveStatusIndicator
      status={status}
      lastSavedAt={lastSavedAt}
      errorMessage={lastSaveError}
      ackSeq={lastAckSeq}
      pendingCount={pendingCount}
      syncStatusDisplay={syncStatusDisplay}
    />
  )
}

/** Batch + badge santé + save — inline confort ou rangée narrow. */
export function GraphToolbarStatusRow({
  isNarrowToolbar,
  chrome,
  segments = ['batch', 'health', 'save'],
  toolsGroup,
  selectedNodeIds,
  canEditGraph,
  onBatchDeleteClick,
  onBatchTagApply,
  onBatchValidateClick,
  nodes,
  edges,
  graphValidationErrors,
  intentionalCycles,
  showValidationPanel,
  setShowValidationPanel,
  activeDialogueFilename,
  lastSaveError,
  isGraphSaving,
  hasUnsavedChanges,
  lastSavedAt,
  syncStatus,
  lastAckSeq,
}: GraphToolbarStatusRowProps) {
  const batchMenu = (
    <BatchOperationsMenu
      selectedNodeIds={selectedNodeIds}
      canEditGraph={canEditGraph}
      onBatchDeleteClick={onBatchDeleteClick}
      onBatchTagApply={onBatchTagApply}
      onBatchValidateClick={onBatchValidateClick}
    />
  )

  const healthBadge = (
    <GraphHealthBadge
      isNarrowToolbar={isNarrowToolbar}
      nodes={nodes}
      edges={edges}
      graphValidationErrors={graphValidationErrors}
      intentionalCycles={intentionalCycles}
      showValidationPanel={showValidationPanel}
      setShowValidationPanel={setShowValidationPanel}
    />
  )

  const saveIndicator = (
    <GraphSaveStatusIndicator
      activeDialogueFilename={activeDialogueFilename}
      lastSaveError={lastSaveError}
      isGraphSaving={isGraphSaving}
      hasUnsavedChanges={hasUnsavedChanges}
      lastSavedAt={lastSavedAt}
      syncStatus={syncStatus}
      lastAckSeq={lastAckSeq}
    />
  )

  if (isNarrowToolbar) {
    return (
      <div
        data-testid="graph-toolbar-row-status"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: `${chrome.groupGapRem}rem`,
          flexWrap: 'wrap',
          minWidth: 0,
        }}
      >
        {batchMenu}
        <div style={{ display: 'flex', alignItems: 'center', gap: `${chrome.groupGapRem}rem` }}>
          {toolsGroup}
        </div>
        {healthBadge}
        {saveIndicator}
      </div>
    )
  }

  return (
    <>
      {segments.includes('batch') && batchMenu}
      {segments.includes('health') && healthBadge}
      {segments.includes('save') && saveIndicator}
    </>
  )
}

/** Bouton Retour standalone pour la rangée confort outils (legacy isStandalone). */
export function GraphToolbarStandaloneBackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      style={{
        padding: '0.45rem 0.8rem',
        border: `1px solid ${theme.border.primary}`,
        borderRadius: '6px',
        backgroundColor: theme.button.default.background,
        color: theme.button.default.color,
        cursor: 'pointer',
        fontSize: '0.85rem',
        whiteSpace: 'nowrap',
      }}
    >
      ← Retour
    </button>
  )
}
