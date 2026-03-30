/**
 * Panneau Pertinence contexte GDD (Story 3.6) — score, breakdown, historique dialogue.
 */
import { useEffect, useState } from 'react'
import axios from 'axios'
import * as llmUsageApi from '../../api/llmUsage'
import type { ContextRelevanceHistoryEntry, ContextRelevanceReport } from '../../api/llmUsage'
import { useGraphStore } from '../../store/graphStore'
import { getErrorMessage } from '../../types/errors'
import { theme } from '../../theme'
import { formatContextScorePercent } from '../../utils/contextRelevanceFormat'

const TYPE_LABELS: Record<string, string> = {
  characters: 'Personnages',
  locations: 'Lieux',
  regions: 'Régions',
  themes: 'Thèmes',
  items: 'Objets',
  species: 'Espèces',
  communities: 'Communautés',
  other: 'Autre',
}

function labelForType(key: string): string {
  return TYPE_LABELS[key] ?? key
}

export type ContextRelevancePanelProps = {
  /**
   * Sans bordure haute : le panneau est regroupé dans un conteneur parent (ex. accordéon).
   */
  embedded?: boolean
}

export function ContextRelevancePanel({ embedded = false }: ContextRelevancePanelProps) {
  const dialogueId = useGraphStore((s) => s.documentId ?? s.dialogueMetadata.filename ?? null)
  const nodeId = useGraphStore((s) => s.selectedNodeId)

  const [detail, setDetail] = useState<ContextRelevanceReport | null>(null)
  const [history, setHistory] = useState<ContextRelevanceHistoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailMissing, setDetailMissing] = useState(false)

  useEffect(() => {
    if (!dialogueId || !nodeId) {
      setDetail(null)
      setHistory([])
      setDetailMissing(false)
      setError(null)
      return
    }

    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      setDetailMissing(false)
      try {
        const [d, h] = await Promise.all([
          llmUsageApi.getNodeContextRelevance(dialogueId, nodeId),
          llmUsageApi.getContextRelevanceHistory(dialogueId),
        ])
        if (!cancelled) {
          const present = d.record_present !== false
          if (present) {
            setDetail(d)
            setDetailMissing(false)
          } else {
            setDetail(null)
            setDetailMissing(true)
          }
          setHistory(h.entries)
        }
      } catch (e) {
        if (cancelled) return
        if (axios.isAxiosError(e) && e.response?.status === 404) {
          setDetail(null)
          setDetailMissing(true)
          try {
            const h = await llmUsageApi.getContextRelevanceHistory(dialogueId)
            if (!cancelled) setHistory(h.entries)
          } catch {
            if (!cancelled) setHistory([])
          }
        } else {
          setError(getErrorMessage(e))
          setDetail(null)
          setHistory([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [dialogueId, nodeId])

  const topRule = embedded ? 'none' : `1px solid ${theme.border.primary}`

  if (!dialogueId) {
    return (
      <div
        data-testid="context-relevance-panel"
        style={{
          padding: '0.6rem 0.75rem',
          fontSize: '0.8rem',
          color: theme.text.secondary,
          borderTop: topRule,
        }}
      >
        Chargez ou enregistrez un dialogue pour afficher la pertinence contexte.
      </div>
    )
  }

  if (!nodeId) {
    return (
      <div
        data-testid="context-relevance-panel"
        style={{
          padding: '0.6rem 0.75rem',
          fontSize: '0.8rem',
          color: theme.text.secondary,
          borderTop: topRule,
        }}
      >
        Sélectionnez un nœud du graphe pour voir la pertinence du contexte GDD.
      </div>
    )
  }

  return (
    <div
      data-testid="context-relevance-panel"
      style={{
        borderTop: topRule,
        padding: '0.6rem 0.75rem',
        flexShrink: 0,
        backgroundColor: theme.background.secondary,
      }}
    >
      <div
        style={{
          fontSize: '0.85rem',
          fontWeight: 700,
          marginBottom: '0.35rem',
          color: theme.text.primary,
        }}
      >
        Pertinence contexte
      </div>
      {loading && (
        <div style={{ fontSize: '0.8rem', color: theme.text.secondary }}>Chargement…</div>
      )}
      {error && (
        <div style={{ fontSize: '0.8rem', color: theme.state.error.color }}>{error}</div>
      )}
      {!loading && detailMissing && (
        <div style={{ fontSize: '0.8rem', color: theme.text.secondary }}>
          Aucune mesure pour ce nœud (pas encore de génération LLM enregistrée).
        </div>
      )}
      {!loading && detail && (
        <>
          <div
            data-testid="context-relevance-score"
            style={{ fontSize: '0.95rem', fontWeight: 600, color: theme.text.primary }}
          >
            Score : {formatContextScorePercent(detail.score_percent)}
            {detail.low_context_warning && (
              <span
                data-testid="context-relevance-warning"
                style={{
                  marginLeft: '0.5rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#c9a227',
                }}
              >
                Faible utilisation du contexte (seuil {detail.low_threshold_percent} %)
              </span>
            )}
          </div>
          {detail.low_context_warning && detail.suggestions_hints.length > 0 && (
            <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem', fontSize: '0.75rem' }}>
              {detail.suggestions_hints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: '0.45rem', fontSize: '0.75rem', color: theme.text.secondary }}>
            Breakdown :
            {Object.entries(detail.breakdown_by_type).map(([k, v]) => (
              <span key={k} style={{ marginLeft: '0.5rem' }}>
                {labelForType(k)} {formatContextScorePercent(v)}
              </span>
            ))}
          </div>
          {detail.reflected_types.length > 0 && (
            <div
              data-testid="context-relevance-reflected"
              style={{ marginTop: '0.35rem', fontSize: '0.72rem', color: theme.text.secondary }}
            >
              <span style={{ fontWeight: 600, color: theme.text.primary }}>Bien reflétés : </span>
              {detail.reflected_types.map((k) => labelForType(k)).join(', ')}
            </div>
          )}
          {detail.weak_types.length > 0 && (
            <div
              data-testid="context-relevance-weak"
              style={{ marginTop: '0.2rem', fontSize: '0.72rem', color: theme.text.secondary }}
            >
              <span style={{ fontWeight: 600, color: theme.text.primary }}>
                Peu ou pas détectés :{' '}
              </span>
              {detail.weak_types.map((k) => labelForType(k)).join(', ')}
            </div>
          )}
          <div style={{ marginTop: '0.25rem', fontSize: '0.7rem', color: theme.text.secondary }}>
            Méthode : {detail.method} · calcul {detail.computation_ms} ms
          </div>
        </>
      )}
      {history.length > 0 && (
        <details
          data-testid="context-relevance-history-details"
          style={{ marginTop: '0.55rem' }}
        >
          <summary
            style={{
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: theme.text.primary,
              listStyle: 'none',
            }}
          >
            Historique ({history.length})
          </summary>
          <ul
            data-testid="context-relevance-history"
            style={{
              margin: '0.25rem 0 0',
              paddingLeft: '1rem',
              maxHeight: '100px',
              overflowY: 'auto',
              fontSize: '0.7rem',
              color: theme.text.secondary,
            }}
          >
            {history.map((row) => (
              <li
                key={`${row.request_id}-${row.timestamp}`}
                title={`request_id: ${row.request_id}`}
              >
                {row.timestamp.slice(0, 19)} — nœud {row.node_id ?? '?'} — req {row.request_id} —{' '}
                {formatContextScorePercent(row.score_percent)}
                {row.low_context_warning ? ' ⚠' : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
