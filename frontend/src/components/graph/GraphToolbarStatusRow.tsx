/**
 * Badge santé graphe, indicateur sauvegarde et menu batch (Story 17.9).
 */
import type { ReactNode } from 'react'
import type { Edge, Node } from 'reactflow'
import { SaveStatusIndicator } from '../shared'
import { theme } from '../../theme'
import { redesignFont, redesignText } from '../../theme/redesignTokens'
import { useUiLayoutStore } from '../../store/uiLayoutStore'
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
  onBatchGenerateClick?: () => void
  isBatchGenerating?: boolean
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
  /** Timestamp ms — aligné sur `GraphState.lastSavedAt` et `SaveStatusIndicator`. */
  lastSavedAt: number | null
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

  // Cliquable ⇒ vrai bouton : le point + libellé mono ne doit pas coûter l'accès clavier.
  const Tag = (canToggle ? 'button' : 'span') as 'button' | 'span'

  return (
    <Tag
      {...(canToggle ? { type: 'button' as const } : {})}
      data-testid="graph-health-badge"
      title={title}
      onClick={
        canToggle
          ? () => {
              // Écran 2e : le badge santé ouvre l'onglet SANTÉ de l'inspecteur.
              // Le booléen historique reste piloté pour la variante narrow (overlay).
              useUiLayoutStore.getState().toggleInspectorTab('health')
              setShowValidationPanel((v) => !v)
            }
          : undefined
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        border: 'none',
        background: 'none',
        padding: 0,
        margin: 0,
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
    </Tag>
  )
}

/** Libellés mono capitales de la rangée 2e (`ENREGISTRÉ · 11:24`). */
const MONO_SAVE_LABELS: Record<'saved' | 'saving' | 'unsaved' | 'error', string> = {
  saved: 'ENREGISTRÉ',
  saving: 'SAUVEGARDE…',
  unsaved: 'NON ENREGISTRÉ',
  error: 'ERREUR SAVE',
}

function formatSaveClock(timestamp: number | string): string | null {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return null
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function GraphSaveStatusIndicator({
  isNarrowToolbar,
  activeDialogueFilename,
  lastSaveError,
  isGraphSaving,
  hasUnsavedChanges,
  lastSavedAt,
  syncStatus,
  lastAckSeq,
}: Pick<
  GraphToolbarStatusRowProps,
  | 'isNarrowToolbar'
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

  if (isNarrowToolbar) {
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

  // Écran 2e : texte mono `ENREGISTRÉ · 11:24`. Le détail sync (seq / offline) reste en title.
  const clock = status === 'saved' && lastSavedAt != null ? formatSaveClock(lastSavedAt) : null
  const label = clock ? `${MONO_SAVE_LABELS[status]} · ${clock}` : MONO_SAVE_LABELS[status]
  const detail =
    syncStatusDisplay === 'offline'
      ? pendingCount > 0
        ? `Hors ligne — ${pendingCount} changement(s) en attente`
        : 'Hors ligne'
      : status === 'error' && lastSaveError
        ? lastSaveError
        : lastAckSeq != null
          ? `Synchronisé (seq ${lastAckSeq})`
          : label
  const color =
    status === 'error'
      ? theme.state.error.color
      : status === 'unsaved' || syncStatusDisplay === 'offline'
        ? theme.state.pending.border
        : redesignText.label

  return (
    <span
      data-testid="graph-save-status-mono"
      title={detail}
      style={{
        fontFamily: redesignFont.mono,
        fontSize: '10.5px',
        letterSpacing: '0.05em',
        color,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {label}
    </span>
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
  onBatchGenerateClick,
  isBatchGenerating,
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
      onBatchGenerateClick={onBatchGenerateClick}
      isBatchGenerating={isBatchGenerating}
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
      isNarrowToolbar={isNarrowToolbar}
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
