/**
 * Modal optimisation contexte GDD sous budget (FR21).
 */
import { useCallback, useEffect, useId, useState } from 'react'
import { optimizeContextSelection } from '../../api/context'
import type { ContextSelection, OptimizeContextResponse } from '../../types/api'
import { useContextStore } from '../../store/contextStore'
import { useContextConfigStore } from '../../store/contextConfigStore'
import { buildOptimizeContextRequest } from '../../utils/buildContextOptimizeRequest'
import { getErrorMessage } from '../../types/errors'
import { theme } from '../../theme'

type Phase = 'loading' | 'preview' | 'report'

export interface ContextOptimizeModalProps {
  open: boolean
  onClose: () => void
  onApplied: () => void
}

export function ContextOptimizeModal({ open, onClose, onApplied }: ContextOptimizeModalProps) {
  const titleId = useId()
  const setSelections = useContextStore((s) => s.setSelections)
  const pinnedKeys = useContextConfigStore((s) => s.contextOptimizationPinnedKeys)
  const setPinnedKeys = useContextConfigStore((s) => s.setContextOptimizationPinnedKeys)
  const strategy = useContextConfigStore((s) => s.contextOptimizationStrategy)
  const setStrategy = useContextConfigStore((s) => s.setContextOptimizationStrategy)
  const proxyThreshold = useContextConfigStore((s) => s.contextOptimizationProxyThreshold)
  const setProxyThreshold = useContextConfigStore((s) => s.setContextOptimizationProxyThreshold)
  const contextTokenBudgetMax = useContextConfigStore((s) => s.contextTokenBudgetMax)

  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string | null>(null)
  const [proposal, setProposal] = useState<OptimizeContextResponse | null>(null)
  const [snapshotBefore, setSnapshotBefore] = useState<ContextSelection | null>(null)
  const [pinInput, setPinInput] = useState('')

  const reset = useCallback(() => {
    setPhase('loading')
    setError(null)
    setProposal(null)
    setSnapshotBefore(null)
  }, [])

  useEffect(() => {
    if (!open) {
      reset()
      return
    }
    const snapshotAtOpen = useContextStore.getState().selections
    const snapshotCopy: ContextSelection = JSON.parse(JSON.stringify(snapshotAtOpen)) as ContextSelection
    let cancelled = false
    ;(async () => {
      setPhase('loading')
      setError(null)
      setSnapshotBefore(snapshotCopy)
      try {
        const body = buildOptimizeContextRequest()
        const res = await optimizeContextSelection(body)
        if (cancelled) return
        setProposal(res)
        setPhase('preview')
      } catch (e) {
        if (cancelled) return
        setError(getErrorMessage(e))
        setPhase('preview')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, reset])

  const handleAccept = useCallback(() => {
    if (!proposal) return
    setSelections(proposal.proposed_context_selections)
    setPhase('report')
    onApplied()
  }, [proposal, setSelections, onApplied])

  const handleUndo = useCallback(() => {
    if (snapshotBefore) {
      setSelections(snapshotBefore)
    }
    onClose()
    reset()
  }, [snapshotBefore, setSelections, onClose, reset])

  const addPinFromInput = useCallback(() => {
    const v = pinInput.trim()
    if (!v || !v.includes(':')) return
    setPinnedKeys([...pinnedKeys, v])
    setPinInput('')
  }, [pinInput, pinnedKeys, setPinnedKeys])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 12000,
        backgroundColor: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          maxWidth: 520,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          backgroundColor: theme.background.primary,
          color: theme.text.primary,
          borderRadius: 8,
          border: `1px solid ${theme.border.primary}`,
          padding: '1rem',
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
        }}
      >
        <h2 id={titleId} style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>
          Optimiser le contexte
        </h2>

        <section aria-label="Règles d'optimisation" style={{ marginBottom: '0.75rem', fontSize: '0.82rem' }}>
          <div style={{ marginBottom: 6 }}>
            <label style={{ display: 'block', marginBottom: 4, color: theme.text.secondary }}>
              Stratégie
            </label>
            <select
              value={strategy}
              onChange={(e) =>
                setStrategy(e.target.value === 'aggressive' ? 'aggressive' : 'conservative')
              }
              style={{
                width: '100%',
                padding: '0.25rem',
                borderRadius: 4,
                border: `1px solid ${theme.border.primary}`,
                backgroundColor: theme.background.secondary,
                color: theme.text.primary,
              }}
            >
              <option value="conservative">Conservatrice (réduit d’abord types périphériques)</option>
              <option value="aggressive">Agressive (réduit d’abord personnages / lieux)</option>
            </select>
          </div>
          <div style={{ marginBottom: 6 }}>
            <label style={{ display: 'block', marginBottom: 4, color: theme.text.secondary }}>
              Seuil avertissement proxy pré-génération (1–100)
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={proxyThreshold}
              onChange={(e) => setProxyThreshold(Number(e.target.value))}
              style={{
                width: '5rem',
                padding: '0.25rem',
                borderRadius: 4,
                border: `1px solid ${theme.border.primary}`,
                backgroundColor: theme.background.secondary,
                color: theme.text.primary,
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, color: theme.text.secondary }}>
              Épingler type:nom (ex. characters:Alice)
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="characters:Nom"
                style={{
                  flex: 1,
                  padding: '0.25rem',
                  borderRadius: 4,
                  border: `1px solid ${theme.border.primary}`,
                  backgroundColor: theme.background.secondary,
                  color: theme.text.primary,
                }}
              />
              <button
                type="button"
                onClick={addPinFromInput}
                style={{
                  padding: '0.25rem 0.5rem',
                  borderRadius: 4,
                  border: `1px solid ${theme.border.primary}`,
                  backgroundColor: theme.button.secondary.background,
                  color: theme.button.secondary.color,
                  cursor: 'pointer',
                }}
              >
                Ajouter
              </button>
            </div>
            {pinnedKeys.length > 0 && (
              <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem', fontSize: '0.78rem' }}>
                {pinnedKeys.map((k) => (
                  <li key={k}>
                    {k}{' '}
                    <button
                      type="button"
                      onClick={() => setPinnedKeys(pinnedKeys.filter((p) => p !== k))}
                      style={{
                        border: 'none',
                        background: 'none',
                        color: theme.state.error.color,
                        cursor: 'pointer',
                        padding: 0,
                        fontSize: '0.75rem',
                      }}
                    >
                      retirer
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {phase === 'loading' && <p style={{ fontSize: '0.85rem' }}>Calcul de la proposition…</p>}

        {error && (
          <p role="alert" style={{ color: theme.state.error.color, fontSize: '0.85rem' }}>
            {error}
          </p>
        )}

        {proposal && phase === 'preview' && (
          <div>
            {proposal.warnings.length > 0 && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  marginBottom: '0.5rem',
                  padding: '0.35rem',
                  borderRadius: 4,
                  backgroundColor: theme.state.warning.background,
                  color: theme.state.warning.color,
                  fontSize: '0.8rem',
                }}
              >
                {proposal.warnings.map((w, i) => (
                  <div key={`w-${i}`}>{w}</div>
                ))}
              </div>
            )}
            <p style={{ fontSize: '0.82rem', margin: '0 0 0.5rem' }}>
              Tokens sélection : {proposal.selection_tokens_before.toLocaleString()} →{' '}
              {proposal.selection_tokens_after.toLocaleString()} (plafond :{' '}
              {contextTokenBudgetMax.toLocaleString()})
            </p>
            {!proposal.budget_respected && !proposal.no_op && (
              <p role="alert" style={{ fontSize: '0.82rem', color: theme.state.error.color, margin: '0 0 0.5rem' }}>
                Le plafond n’est pas atteint — vous ne pouvez pas appliquer cette proposition tant que des
                entités restent épinglées ou que le budget est trop bas.
              </p>
            )}
            <p style={{ fontSize: '0.82rem', margin: '0 0 0.5rem' }}>
              Proxy pré-génération : {proposal.pre_generation_context_fidelity_proxy_percent} %
            </p>
            {proposal.no_op ? (
              <p style={{ fontSize: '0.82rem' }}>Aucun changement nécessaire (déjà sous le budget).</p>
            ) : (
              <>
                <p style={{ fontSize: '0.82rem', margin: '0 0 0.25rem' }}>
                  {proposal.changes.length} passage(s) Complet → Extrait
                </p>
                <ul style={{ fontSize: '0.78rem', maxHeight: 140, overflowY: 'auto', margin: '0 0 0.75rem' }}>
                  {proposal.changes.slice(0, 50).map((c, i) => (
                    <li key={`${c.entity_type}-${c.entity_name}-${i}`}>
                      {c.entity_type} — {c.entity_name}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                onClick={handleAccept}
                disabled={
                  !!error ||
                  !proposal ||
                  (!proposal.no_op && !proposal.budget_respected)
                }
                style={{
                  padding: '0.35rem 0.65rem',
                  borderRadius: 4,
                  border: 'none',
                  backgroundColor: theme.button.primary.background,
                  color: theme.button.primary.color,
                  cursor:
                    error || !proposal || (!proposal.no_op && !proposal.budget_respected)
                      ? 'not-allowed'
                      : 'pointer',
                }}
              >
                Accepter
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  reset()
                }}
                style={{
                  padding: '0.35rem 0.65rem',
                  borderRadius: 4,
                  border: `1px solid ${theme.border.primary}`,
                  backgroundColor: theme.background.secondary,
                  color: theme.text.primary,
                  cursor: 'pointer',
                }}
              >
                Refuser
              </button>
            </div>
          </div>
        )}

        {phase === 'report' && proposal && (
          <div aria-live="polite">
            <p style={{ fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
              Optimisation appliquée. Tokens économisés :{' '}
              <strong>{proposal.tokens_saved.toLocaleString()}</strong> — entités passées en extrait :{' '}
              <strong>{proposal.changes.length}</strong>
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  reset()
                }}
                style={{
                  padding: '0.35rem 0.65rem',
                  borderRadius: 4,
                  border: 'none',
                  backgroundColor: theme.button.primary.background,
                  color: theme.button.primary.color,
                  cursor: 'pointer',
                }}
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={handleUndo}
                style={{
                  padding: '0.35rem 0.65rem',
                  borderRadius: 4,
                  border: `1px solid ${theme.border.primary}`,
                  backgroundColor: theme.background.secondary,
                  color: theme.text.primary,
                  cursor: 'pointer',
                }}
              >
                Annuler (restaurer la sélection)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
