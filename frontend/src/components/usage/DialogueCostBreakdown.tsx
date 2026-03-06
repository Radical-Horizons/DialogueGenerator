/**
 * Breakdown détaillé des coûts LLM pour un dialogue (Story 1.12 / FR73).
 *
 * Affiche : coût total, nombre de nœuds, coût moyen et un bar chart CSS par nœud.
 * Clic sur une barre → tooltip avec les détails du nœud.
 */
import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getDialogueCosts,
  getAllDialoguesCosts,
  type NodeCostEntry,
  type DialogueCostSummaryEntry,
} from '../../api/llmUsage'
import './DialogueCostBreakdown.css'

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCostEur(eur: number): string {
  if (eur < 0.001) return `${(eur * 100).toFixed(4)}¢`
  return `€${eur.toFixed(4)}`
}

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

/** Détermine la couleur selon le coût par nœud (€). */
function costColor(costEur: number): string {
  if (costEur > 0.05) return '#ef4444' // rouge — cher
  if (costEur >= 0.01) return '#f59e0b' // orange — modéré
  return '#22c55e' // vert — économique
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

  return (
    <div className="dcb" onClick={tooltip ? handleClose : undefined}>
      {/* ── Bouton comparaison multi-dialogues (AC#3) ── */}
      <div className="dcb__actions">
        <button
          className="dcb__btn-compare"
          onClick={() => setShowComparison(true)}
          title="Comparer les coûts de tous les dialogues"
          aria-label="Comparer tous les dialogues"
        >
          📊 Comparer tous les dialogues
        </button>
      </div>

      {/* ── Cartes de résumé ── */}
      <div className="dcb__summary">
        <div className="dcb__stat">
          <span className="dcb__stat-label">Coût total</span>
          <span className="dcb__stat-value" style={{ color: costColor(avg_cost_per_node_eur) }}>
            {formatCostEur(total_cost_eur)}
          </span>
        </div>
        <div className="dcb__stat">
          <span className="dcb__stat-label">Nœuds générés</span>
          <span className="dcb__stat-value">{node_count}</span>
        </div>
        <div className="dcb__stat">
          <span className="dcb__stat-label">Coût moyen / nœud</span>
          <span className="dcb__stat-value" style={{ color: costColor(avg_cost_per_node_eur) }}>
            {node_count > 0 ? formatCostEur(avg_cost_per_node_eur) : '—'}
          </span>
        </div>
      </div>

      {/* ── Bar chart ── */}
      {breakdown.length === 0 ? (
        <p className="dcb__empty">Aucun nœud généré pour ce dialogue.</p>
      ) : (
        <div className="dcb__chart" aria-label="Distribution des coûts par nœud">
          <div className="dcb__bars">
            {breakdown.map((entry, i) => {
              const heightPct = (entry.cost_eur / maxCost) * 100
              const color = costColor(entry.cost_eur)
              const label = entry.node_id ? entry.node_id.slice(-6) : `#${i + 1}`
              return (
                <div
                  key={entry.node_id ?? i}
                  className="dcb__bar-container"
                  data-testid={`dcb-bar-${i}`}
                >
                  <div
                    className={`dcb__bar${entry.deleted ? ' dcb__bar--deleted' : ''}`}
                    style={{ height: `${heightPct}%`, background: color }}
                    title={`${label} — ${formatCostEur(entry.cost_eur)}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Nœud ${label}, coût ${formatCostEur(entry.cost_eur)}`}
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
            <span className="dcb__legend-item dcb__legend-item--green">{'< 0.01€ : économique'}</span>
            <span className="dcb__legend-item dcb__legend-item--orange">{'0.01–0.05€ : modéré'}</span>
            <span className="dcb__legend-item dcb__legend-item--red">{'> 0.05€ : cher'}</span>
          </div>
        </div>
      )}

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
      <div className="dcb__actions">
        <button className="dcb__btn-compare" onClick={onBack} aria-label="Retour">
          ← Retour au dialogue actuel
        </button>
      </div>
      <h3 className="dcb__compare-title">
        Comparaison des coûts — {dialogues.length} dialogue{dialogues.length !== 1 ? 's' : ''}
      </h3>
      {dialogues.length === 0 ? (
        <p className="dcb__empty">Aucun dialogue avec des coûts trackés.</p>
      ) : (
        <div className="dcb__compare-list" aria-label="Liste des dialogues triés par coût">
          {dialogues.map((d: DialogueCostSummaryEntry) => {
            const isCurrent = d.dialogue_id === currentDialogueId
            const color = costColor(d.avg_cost_per_node_eur)
            return (
              <div
                key={d.dialogue_id}
                className={`dcb__compare-row${isCurrent ? ' dcb__compare-row--current' : ''}`}
                role={onSelectDialogue ? 'button' : undefined}
                tabIndex={onSelectDialogue ? 0 : undefined}
                aria-label={`Dialogue ${d.dialogue_id}, coût ${formatCostEur(d.total_cost_eur)}`}
                onClick={() => onSelectDialogue?.(d.dialogue_id)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && onSelectDialogue) {
                    e.preventDefault()
                    onSelectDialogue(d.dialogue_id)
                  }
                }}
              >
                <span
                  className="dcb__compare-indicator"
                  style={{ background: color }}
                  aria-hidden="true"
                />
                <span className="dcb__compare-name" title={d.dialogue_id}>
                  {d.dialogue_id}
                  {isCurrent && <span className="dcb__compare-current-badge"> (actuel)</span>}
                </span>
                <span className="dcb__compare-cost" style={{ color }}>
                  {formatCostEur(d.total_cost_eur)}
                </span>
                <span className="dcb__compare-nodes">{d.node_count} nœud{d.node_count !== 1 ? 's' : ''}</span>
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
      <button className="dcb__tooltip-close" onClick={onClose} aria-label="Fermer">
        ✕
      </button>
      <div className="dcb__tooltip-title">
        Nœud : <code>{entry.node_id ?? '—'}</code>
      </div>
      <table className="dcb__tooltip-table">
        <tbody>
          <tr>
            <td>Généré le</td>
            <td>{formatTimestamp(entry.timestamp)}</td>
          </tr>
          <tr>
            <td>Modèle</td>
            <td>{entry.model_name}</td>
          </tr>
          <tr>
            <td>Tokens prompt</td>
            <td>{entry.prompt_tokens.toLocaleString()}</td>
          </tr>
          <tr>
            <td>Tokens completion</td>
            <td>{entry.completion_tokens.toLocaleString()}</td>
          </tr>
          <tr>
            <td>Coût</td>
            <td style={{ color: costColor(entry.cost_eur), fontWeight: 600 }}>
              {formatCostEur(entry.cost_eur)}
            </td>
          </tr>
          <tr>
            <td>Statut</td>
            <td>{entry.success ? '✅ Succès' : '❌ Échec'}</td>
          </tr>
          {entry.deleted && (
            <tr>
              <td colSpan={2} style={{ color: '#f59e0b', fontStyle: 'italic' }}>
                Nœud supprimé du graphe
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
