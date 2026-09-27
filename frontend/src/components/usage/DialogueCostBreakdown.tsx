/**
 * Breakdown détaillé des coûts LLM pour un dialogue (Story 1.12 / FR73).
 *
 * Affiche : coût total, nombre de nœuds, coût moyen et un bar chart CSS par nœud.
 * Clic sur une barre → tooltip avec les détails du nœud.
 *
 * Rendu nu (fond transparent, filets, pas de cadre) : le composant s'insère dans
 * l'inspecteur du graphe, la modale de coûts et le panneau de métadonnées.
 * Montants en euros — les champs `*_cost_eur` de l'API.
 */
import { useState, useCallback, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getDialogueCosts,
  getAllDialoguesCosts,
  type NodeCostEntry,
  type DialogueCostSummaryEntry,
} from '../../api/llmUsage'
import { theme } from '../../theme'
import { formatCostDetail, formatCurrency, formatNumber } from '../../utils/formatCurrency'
import './DialogueCostBreakdown.css'

// ── Helpers ──────────────────────────────────────────────────────────────────

const MODERATE_COST_EUR = 0.01
const EXPENSIVE_COST_EUR = 0.05

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

interface CostTier {
  color: string
  label: string
}

const TIER_ECONOMIC: CostTier = { color: theme.state.accepted.border, label: 'Économique' }
const TIER_MODERATE: CostTier = { color: theme.state.pending.border, label: 'Modéré' }
const TIER_EXPENSIVE: CostTier = { color: theme.state.error.color, label: 'Cher' }

/** Palier de coût par nœud (€) : couleur d'état du système + libellé. */
function costTier(costEur: number): CostTier {
  if (costEur > EXPENSIVE_COST_EUR) return TIER_EXPENSIVE
  if (costEur >= MODERATE_COST_EUR) return TIER_MODERATE
  return TIER_ECONOMIC
}

const LEGEND: Array<{ tier: CostTier; range: string }> = [
  { tier: TIER_ECONOMIC, range: `< ${formatCurrency(MODERATE_COST_EUR, 'EUR')}` },
  {
    tier: TIER_MODERATE,
    range: `${formatCurrency(MODERATE_COST_EUR, 'EUR')} – ${formatCurrency(EXPENSIVE_COST_EUR, 'EUR')}`,
  },
  { tier: TIER_EXPENSIVE, range: `> ${formatCurrency(EXPENSIVE_COST_EUR, 'EUR')}` },
]

/** Pastille 6px + libellé mono : la seule forme d'un statut. */
function StatusDot({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="dcb__status">
      <span className="dcb__dot" style={{ background: color }} aria-hidden="true" />
      {children}
    </span>
  )
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="dcb__row">
      <span className="dcb__row-label">{label}</span>
      <span className="dcb__row-value">{children}</span>
    </div>
  )
}

// ── Composant ─────────────────────────────────────────────────────────────────

interface DialogueCostBreakdownProps {
  /** Nom du fichier dialogue (ex: "mon_dialogue.json") */
  dialogueId: string
  /** Callback déclenché lors du clic sur un dialogue dans la vue comparaison */
  onSelectDialogue?: (dialogueId: string) => void
}

interface TooltipState {
  entry: NodeCostEntry
  x: number
  y: number
}

export function DialogueCostBreakdown({ dialogueId, onSelectDialogue }: DialogueCostBreakdownProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [showComparison, setShowComparison] = useState(false)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['dialogue-costs', dialogueId],
    queryFn: () => getDialogueCosts(dialogueId),
    enabled: !!dialogueId,
    staleTime: 30_000,
  })

  const handleBarClick = useCallback(
    (entry: NodeCostEntry, event: React.MouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      setTooltip((prev) =>
        prev?.entry === entry ? null : { entry, x: rect.left, y: rect.top }
      )
    },
    []
  )

  const handleClose = useCallback(() => setTooltip(null), [])

  if (!dialogueId) return null

  if (showComparison) {
    return (
      <AllDialoguesComparison
        currentDialogueId={dialogueId}
        onBack={() => setShowComparison(false)}
        onSelectDialogue={onSelectDialogue}
      />
    )
  }

  if (isLoading) {
    return (
      <div className="dcb__loading" role="status" aria-live="polite">
        Chargement des coûts…
      </div>
    )
  }

  if (isError) {
    return (
      <div className="dcb__error" role="alert">
        Impossible de charger les coûts : {String(error)}
      </div>
    )
  }

  if (!data) return null

  const { total_cost_eur, node_count, avg_cost_per_node_eur, breakdown } = data
  const maxCost = breakdown.length > 0 ? Math.max(...breakdown.map((e) => e.cost_eur), 0.00001) : 1
  const avgTier = costTier(avg_cost_per_node_eur)

  return (
    <div className="dcb" onClick={tooltip ? handleClose : undefined}>
      {/* ── Résumé ── */}
      <div className="dcb__section-label">Résumé</div>
      <div className="dcb__rows">
        <SummaryRow label="Coût total">{formatCostDetail(total_cost_eur, 'EUR')}</SummaryRow>
        <SummaryRow label="Nœuds générés">{formatNumber(node_count)}</SummaryRow>
        <SummaryRow label="Coût moyen / nœud">
          {node_count > 0 ? formatCostDetail(avg_cost_per_node_eur, 'EUR') : '—'}
        </SummaryRow>
        {node_count > 0 && (
          <SummaryRow label="Palier">
            <StatusDot color={avgTier.color}>{avgTier.label}</StatusDot>
          </SummaryRow>
        )}
      </div>

      {/* ── Bar chart ── */}
      <div className="dcb__section-label">Par nœud</div>
      {breakdown.length === 0 ? (
        <p className="dcb__empty">Aucun nœud généré pour ce dialogue.</p>
      ) : (
        <div className="dcb__chart" aria-label="Distribution des coûts par nœud">
          <div className="dcb__bars">
            {breakdown.map((entry, i) => {
              const heightPct = (entry.cost_eur / maxCost) * 100
              const label = entry.node_id ? entry.node_id.slice(-6) : `#${i + 1}`
              const cost = formatCostDetail(entry.cost_eur, 'EUR')
              return (
                <div
                  key={entry.node_id ?? i}
                  className="dcb__bar-container"
                  data-testid={`dcb-bar-${i}`}
                >
                  <div
                    className={`dcb__bar${entry.deleted ? ' dcb__bar--deleted' : ''}`}
                    style={{ height: `${heightPct}%`, background: costTier(entry.cost_eur).color }}
                    title={`${label} — ${cost}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Nœud ${label}, coût ${cost}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleBarClick(entry, e)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleBarClick(entry, e as unknown as React.MouseEvent<HTMLDivElement>)
                      }
                    }}
                  />
                  <span className="dcb__bar-label">{label}</span>
                </div>
              )
            })}
          </div>
          <div className="dcb__legend">
            {LEGEND.map(({ tier, range }) => (
              <StatusDot key={tier.label} color={tier.color}>
                {tier.label} {range}
              </StatusDot>
            ))}
          </div>
        </div>
      )}

      <div className="dcb__actions">
        <button
          type="button"
          className="dcb__btn"
          onClick={() => setShowComparison(true)}
          title="Comparer les coûts de tous les dialogues"
          aria-label="Comparer tous les dialogues"
        >
          Comparer tous les dialogues
        </button>
      </div>

      {/* ── Tooltip détails nœud ── */}
      {tooltip && (
        <NodeDetailTooltip entry={tooltip.entry} onClose={handleClose} />
      )}
    </div>
  )
}

// ── Vue comparaison multi-dialogues (AC#3) ────────────────────────────────────

interface AllDialoguesComparisonProps {
  currentDialogueId: string
  onBack: () => void
  onSelectDialogue?: (dialogueId: string) => void
}

function AllDialoguesComparison({ currentDialogueId, onBack, onSelectDialogue }: AllDialoguesComparisonProps) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['all-dialogues-costs'],
    queryFn: getAllDialoguesCosts,
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <div className="dcb__loading" role="status" aria-live="polite">
        Chargement des coûts…
      </div>
    )
  }

  if (isError) {
    return (
      <div className="dcb__error" role="alert">
        Impossible de charger les coûts : {String(error)}
      </div>
    )
  }

  const dialogues = data?.dialogues ?? []

  return (
    <div className="dcb">
      <div className="dcb__actions dcb__actions--top">
        <button type="button" className="dcb__btn" onClick={onBack} aria-label="Retour">
          ← Retour au dialogue actuel
        </button>
      </div>
      <div className="dcb__section-label">
        Comparaison — {formatNumber(dialogues.length)} dialogue{dialogues.length !== 1 ? 's' : ''}
      </div>
      {dialogues.length === 0 ? (
        <p className="dcb__empty">Aucun dialogue avec des coûts trackés.</p>
      ) : (
        <div className="dcb__compare-list" aria-label="Liste des dialogues triés par coût">
          {dialogues.map((d: DialogueCostSummaryEntry) => {
            const isCurrent = d.dialogue_id === currentDialogueId
            const tier = costTier(d.avg_cost_per_node_eur)
            const cost = formatCostDetail(d.total_cost_eur, 'EUR')
            return (
              <div
                key={d.dialogue_id}
                className={`dcb__compare-row${isCurrent ? ' dcb__compare-row--current' : ''}`}
                role={onSelectDialogue ? 'button' : undefined}
                tabIndex={onSelectDialogue ? 0 : undefined}
                aria-label={`Dialogue ${d.dialogue_id}, coût ${cost}`}
                onClick={() => onSelectDialogue?.(d.dialogue_id)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && onSelectDialogue) {
                    e.preventDefault()
                    onSelectDialogue(d.dialogue_id)
                  }
                }}
              >
                <span
                  className="dcb__dot"
                  style={{ background: tier.color }}
                  title={tier.label}
                  aria-hidden="true"
                />
                <span className="dcb__compare-name" title={d.dialogue_id}>
                  {d.dialogue_id}
                  {isCurrent && <span className="dcb__compare-current-badge"> actuel</span>}
                </span>
                <span className="dcb__compare-cost">{cost}</span>
                <span className="dcb__compare-nodes">
                  {formatNumber(d.node_count)} nœud{d.node_count !== 1 ? 's' : ''}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface NodeDetailTooltipProps {
  entry: NodeCostEntry
  onClose: () => void
}

function NodeDetailTooltip({ entry, onClose }: NodeDetailTooltipProps) {
  return (
    <div
      className="dcb__tooltip"
      role="dialog"
      aria-modal="true"
      aria-label="Détails du nœud"
      data-testid="dcb-tooltip"
      onClick={(e) => e.stopPropagation()}
    >
      <button type="button" className="dcb__tooltip-close" onClick={onClose} aria-label="Fermer">
        ×
      </button>
      <div className="dcb__section-label">Nœud</div>
      <div className="dcb__tooltip-id">{entry.node_id ?? '—'}</div>
      <div className="dcb__rows">
        <SummaryRow label="Généré le">{formatTimestamp(entry.timestamp)}</SummaryRow>
        <SummaryRow label="Modèle">{entry.model_name}</SummaryRow>
        <SummaryRow label="Tokens prompt">{formatNumber(entry.prompt_tokens)}</SummaryRow>
        <SummaryRow label="Tokens completion">{formatNumber(entry.completion_tokens)}</SummaryRow>
        <SummaryRow label="Coût">
          <StatusDot color={costTier(entry.cost_eur).color}>
            {formatCostDetail(entry.cost_eur, 'EUR')}
          </StatusDot>
        </SummaryRow>
        <SummaryRow label="Statut">
          {entry.success ? (
            <StatusDot color={theme.state.accepted.border}>Succès</StatusDot>
          ) : (
            <StatusDot color={theme.state.error.color}>Échec</StatusDot>
          )}
        </SummaryRow>
        {entry.deleted && (
          <SummaryRow label="Graphe">
            <StatusDot color={theme.state.pending.border}>Nœud supprimé du graphe</StatusDot>
          </SummaryRow>
        )}
      </div>
    </div>
  )
}
