/**
 * Panneau « AI slop » : détection heuristique GPT-isms, répétitions, génériques (FR43).
 */
import { useCallback, useEffect, useState } from 'react'
import { useGraphStore } from '../../store/graphStore'
import { theme } from '../../theme'
import * as graphAPI from '../../api/graph'
import { getErrorMessage } from '../../types/errors'
import type { AiSlopOccurrenceItem, DetectAiSlopResponse } from '../../types/graph'
import {
  loadSlopDetectionOptions,
  parseKeywordLine,
  saveSlopDetectionOptions,
  type AiSlopDetectionOptionsState,
} from '../../utils/slopDetectionSettings'
import { GraphToolFloatingShell } from './GraphToolFloatingShell'

interface GraphAiSlopPanelProps {
  onClose: () => void
}

function kindLabel(k: AiSlopOccurrenceItem['kind']): string {
  switch (k) {
    case 'gpt_ism':
      return 'GPT-ism'
    case 'repetition':
      return 'Répétition'
    case 'generic_phrase':
      return 'Générique'
    default:
      return k
  }
}

export function GraphAiSlopPanel({ onClose }: GraphAiSlopPanelProps) {
  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)
  const jumpToNode = useGraphStore((s) => s.jumpToNode)

  const [opts, setOpts] = useState<AiSlopDetectionOptionsState>(() => loadSlopDetectionOptions())
  const [keywordDraft, setKeywordDraft] = useState(() => loadSlopDetectionOptions().custom_keywords.join(', '))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<DetectAiSlopResponse | null>(null)

  useEffect(() => {
    saveSlopDetectionOptions(opts)
  }, [opts])

  const runDetect = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await graphAPI.detectAiSlop({
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
        options: opts,
      })
      setLast(res)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [nodes, edges, opts])

  const applyKeywordsFromDraft = () => {
    const kws = parseKeywordLine(keywordDraft)
    setOpts((o) => ({ ...o, custom_keywords: kws }))
  }

  const visibleOccurrences = last
    ? last.occurrences.filter((o) => {
        if (o.kind === 'repetition' && !opts.include_repetitions) return false
        if (o.kind === 'gpt_ism' && !opts.include_gpt_isms) return false
        if (o.kind === 'generic_phrase' && !opts.include_generic_phrases) return false
        return true
      })
    : []

  return (
    <GraphToolFloatingShell
      title={<strong>AI slop</strong>}
      onClose={onClose}
      dataTestId="graph-ai-slop-panel"
      storageKey="ai-slop"
      initialOffset={{ top: 56, left: 460 }}
      width="min(420px, calc(100vw - 24px))"
      maxHeight="min(72vh, 580px)"
      closeButtonTestId="graph-ai-slop-close"
    >

      <section style={{ marginBottom: '0.65rem' }} aria-labelledby="slop-settings-title">
        <div id="slop-settings-title" style={{ fontWeight: 600, marginBottom: 6 }}>
          Paramètres détection
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <input
            type="checkbox"
            data-testid="slop-toggle-gpt"
            checked={opts.include_gpt_isms}
            onChange={(e) => setOpts((o) => ({ ...o, include_gpt_isms: e.target.checked }))}
          />
          GPT-isms
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <input
            type="checkbox"
            data-testid="slop-toggle-repetitions"
            checked={opts.include_repetitions}
            onChange={(e) => setOpts((o) => ({ ...o, include_repetitions: e.target.checked }))}
          />
          Répétitions
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <input
            type="checkbox"
            data-testid="slop-toggle-generic"
            checked={opts.include_generic_phrases}
            onChange={(e) => setOpts((o) => ({ ...o, include_generic_phrases: e.target.checked }))}
          />
          Phrases génériques
        </label>
        <label style={{ fontSize: '0.78rem', color: theme.text.secondary, display: 'block' }}>
          Mots-clés / lignes (séparés par virgule ou ligne)
        </label>
        <textarea
          data-testid="slop-keywords-draft"
          value={keywordDraft}
          onChange={(e) => setKeywordDraft(e.target.value)}
          onBlur={applyKeywordsFromDraft}
          rows={2}
          style={{
            width: '100%',
            marginTop: 4,
            marginBottom: 4,
            fontSize: '0.8rem',
            borderRadius: 4,
            border: `1px solid ${theme.border.primary}`,
            background: theme.background.default,
            color: theme.text.primary,
          }}
        />
        <button
          type="button"
          data-testid="slop-keywords-apply"
          onClick={applyKeywordsFromDraft}
          style={{
            fontSize: '0.75rem',
            padding: '0.25rem 0.5rem',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Appliquer mots-clés
        </button>
      </section>

      <button
        type="button"
        data-testid="graph-ai-slop-detect"
        disabled={loading || nodes.length === 0}
        onClick={() => void runDetect()}
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
        {loading ? 'Détection…' : 'Détecter slop'}
      </button>

      {error ? (
        <div
          role="alert"
          data-testid="graph-ai-slop-error"
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

      {last ? (
        <div data-testid="graph-ai-slop-report">
          {last.message ? (
            <p style={{ fontSize: '0.8rem', color: theme.text.secondary }}>{last.message}</p>
          ) : null}
          <div data-testid="graph-ai-slop-summary" style={{ marginBottom: '0.5rem' }}>
            {opts.include_gpt_isms ? <div>{last.summary_gpt_isms}</div> : null}
            {opts.include_repetitions ? <div>{last.summary_repetitions}</div> : null}
            {opts.include_generic_phrases ? <div>{last.summary_generic_phrases}</div> : null}
          </div>
          {visibleOccurrences.length > 0 ? (
            <ul
              data-testid="graph-ai-slop-occurrences"
              style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.82rem' }}
            >
              {visibleOccurrences.slice(0, 40).map((o, i) => (
                <li key={`${o.node_id}-${o.field}-${i}`} style={{ marginBottom: 6 }}>
                  <button
                    type="button"
                    data-testid="graph-ai-slop-jump"
                    onClick={() => jumpToNode(o.node_id)}
                    style={{
                      display: 'block',
                      textAlign: 'left',
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      color: theme.border.focus,
                      cursor: 'pointer',
                      padding: 0,
                      fontSize: '0.82rem',
                    }}
                  >
                    [{kindLabel(o.kind)}] {o.node_display_id ?? o.node_id} — {o.matched_span}
                  </button>
                  <span style={{ color: theme.text.secondary }}>{o.suggestion}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </GraphToolFloatingShell>
  )
}
