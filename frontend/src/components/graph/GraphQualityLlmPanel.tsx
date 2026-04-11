/**
 * Panneau « Qualité LLM » : évaluation juge + rapport + historique session (FR42).
 */
import { useCallback, useState } from 'react'
import { useGraphStore } from '../../store/graphStore'
import { theme } from '../../theme'
import * as graphAPI from '../../api/graph'
import { getErrorMessage } from '../../types/errors'
import type { EvaluateDialogueQualityResponse } from '../../types/graph'
import {
  SCORE_VARIANCE_SESSION_REMINDER,
  mergeHighScoreStrengths,
  mergeLowScoreSuggestions,
  qualityBandForOverallScore,
} from '../../utils/qualityLlmUi'
import { GraphQualityLlmHistorySparkline } from './GraphQualityLlmHistorySparkline'
import { GraphQualityLlmCriteriaList } from './GraphQualityLlmCriteriaList'
import { GraphToolFloatingShell } from './GraphToolFloatingShell'

interface GraphQualityLlmPanelProps {
  onClose: () => void
}

interface HistoryEntry {
  at: number
  score: number
}

/**
 * Overlay graphe : lance l’évaluation, affiche le rapport et l’historique session.
 */
export function GraphQualityLlmPanel({ onClose }: GraphQualityLlmPanelProps) {
  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<EvaluateDialogueQualityResponse | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])

  const runEvaluate = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await graphAPI.evaluateDialogueQuality({
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: n.data,
        })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          type: e.type,
          label: e.label,
          data: e.data,
        })),
      })
      setLast(res)
      setHistory((h) => [...h, { at: Date.now(), score: res.overall_score }])
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [nodes, edges])

  const band = last ? qualityBandForOverallScore(last.overall_score) : null
  const lowSuggestions =
    last && band === 'low'
      ? mergeLowScoreSuggestions(last.suggestions, last.criteria)
      : []
  const highStrengths =
    last && band === 'high'
      ? mergeHighScoreStrengths(last.strengths, last.criteria)
      : []

  return (
    <GraphToolFloatingShell
      title={<strong>Qualité LLM</strong>}
      onClose={onClose}
      dataTestId="graph-quality-llm-panel"
      storageKey="quality-llm"
      initialOffset={{ top: 56, left: 24 }}
      width="min(420px, calc(100vw - 24px))"
      maxHeight="min(72vh, 580px)"
      closeButtonTestId="graph-quality-llm-close"
    >
      <p style={{ margin: '0 0 0.5rem', color: theme.text.secondary, fontSize: '0.8rem' }}>
        {SCORE_VARIANCE_SESSION_REMINDER}
      </p>
      <button
        type="button"
        data-testid="graph-quality-llm-evaluate"
        disabled={loading || nodes.length === 0}
        onClick={() => void runEvaluate()}
        style={{
          padding: '0.5rem 1rem',
          borderRadius: 6,
          border: `1px solid ${theme.border.primary}`,
          backgroundColor:
            loading || nodes.length === 0
              ? theme.state.hover.background
              : theme.button.primary.background,
          color:
            loading || nodes.length === 0 ? theme.text.secondary : theme.button.primary.color,
          cursor: loading || nodes.length === 0 ? 'not-allowed' : 'pointer',
          marginBottom: '0.75rem',
        }}
      >
        {loading ? 'Évaluation…' : 'Évaluer la qualité'}
      </button>
      {error ? (
        <div
          role="alert"
          data-testid="graph-quality-llm-error"
          style={{
            padding: '0.5rem',
            borderRadius: 6,
            backgroundColor: theme.state.error.background,
            color: theme.state.error.color,
            marginBottom: '0.75rem',
          }}
        >
          {error}
        </div>
      ) : null}
      {history.length > 0 ? (
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.8rem', color: theme.text.secondary, marginBottom: 4 }}>
            Historique session ({history.length})
          </div>
          <div style={{ color: theme.text.primary }}>
            <GraphQualityLlmHistorySparkline history={history} />
          </div>
        </div>
      ) : null}
      {last ? (
        <div data-testid="graph-quality-llm-report">
          <div style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 4 }}>
            Score global : {last.overall_score} / 10
          </div>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: theme.text.secondary }}>
            Marge documentée ±{last.score_variance_margin} — {last.score_variance_note}
          </p>
          {band === 'low' ? (
            <div
              data-testid="graph-quality-llm-warning-low"
              style={{
                padding: '0.5rem',
                borderRadius: 6,
                backgroundColor: theme.state.warning.background,
                color: theme.state.warning.color,
                marginBottom: '0.5rem',
              }}
            >
              Qualité faible — considérer une régénération.
              {lowSuggestions.length > 0 ? (
                <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.2rem' }}>
                  {lowSuggestions.map((s, i) => (
                    <li key={`s-${i}-${s.slice(0, 24)}`}>{s}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {band === 'high' ? (
            <div
              data-testid="graph-quality-llm-positive-high"
              style={{
                padding: '0.5rem',
                borderRadius: 6,
                backgroundColor: theme.state.success.background,
                color: theme.state.success.color,
                marginBottom: '0.5rem',
              }}
            >
              Qualité excellente.
              {highStrengths.length > 0 ? (
                <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.2rem' }}>
                  {highStrengths.map((s, i) => (
                    <li key={`t-${i}-${s.slice(0, 24)}`}>{s}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {last.global_comment ? (
            <p style={{ margin: '0 0 0.75rem' }}>{last.global_comment}</p>
          ) : null}
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Critères</div>
          <GraphQualityLlmCriteriaList criteria={last.criteria} />
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.75rem', color: theme.text.secondary }}>
            Modèle : {last.model_id} ({last.provider})
          </p>
        </div>
      ) : null}
    </GraphToolFloatingShell>
  )
}
