/**
 * Panneau « Context dropping » : absence ou usage trop indirect du contexte GDD (FR44 / 4.10).
 */
import { useCallback, useMemo, useState } from 'react'
import { useGraphStore } from '../../store/graphStore'
import { useContextStore } from '../../store/contextStore'
import { theme } from '../../theme'
import * as graphAPI from '../../api/graph'
import { getErrorMessage } from '../../types/errors'
import type { ContextDroppingCaseItem, DetectContextDroppingResponse } from '../../types/graph'
import { GraphContextDroppingCaseList } from './GraphContextDroppingCaseList'
import { GraphContextDroppingSummary } from './GraphContextDroppingSummary'
import { ContextDroppingRulesEditor } from './ContextDroppingRulesEditor'
import { GraphToolFloatingShell } from './GraphToolFloatingShell'
import { buildContextDroppingInputLines } from './contextDroppingInputSummary'
import { toGraphNodePayloads, toGraphEdgePayloads } from '../../utils/graphPayload'

interface GraphContextDroppingPanelProps {
  onClose: () => void
}

export function GraphContextDroppingPanel({ onClose }: GraphContextDroppingPanelProps) {
  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)
  const jumpToNode = useGraphStore((s) => s.jumpToNode)
  const contextSelections = useContextStore((s) => s.selections)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<DetectContextDroppingResponse | null>(null)
  const [showRulesEditor, setShowRulesEditor] = useState(false)

  const inputLines = useMemo(
    () => buildContextDroppingInputLines({ ...contextSelections }),
    [contextSelections]
  )

  const runDetect = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await graphAPI.detectContextDropping({
        nodes: toGraphNodePayloads(nodes),
        edges: toGraphEdgePayloads(edges),
        context_selections: { ...contextSelections },
        scene_instruction: '',
      })
      setLast(res)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [nodes, edges, contextSelections])

  const onJump = (c: ContextDroppingCaseItem) => {
    if (c.node_id) jumpToNode(c.node_id)
  }

  return (
    <GraphToolFloatingShell
      title={<strong id="context-dropping-title">Context dropping</strong>}
      onClose={onClose}
      dataTestId="graph-context-dropping-panel"
      storageKey="context-dropping"
      initialOffset={{ top: 100, left: 80 }}
      width="min(440px, calc(100vw - 24px))"
      maxHeight="min(72vh, 600px)"
      closeButtonTestId="graph-context-dropping-close"
      headerEnd={
        <button
          type="button"
          data-testid="graph-context-dropping-settings"
          onClick={() => setShowRulesEditor((v) => !v)}
          title="Configurer les règles anti-context-dropping"
          style={{
            border: `1px solid ${theme.border.primary}`,
            borderRadius: 6,
            background: showRulesEditor ? theme.button.selected.background : theme.button.default.background,
            color: showRulesEditor ? theme.button.selected.color : theme.text.primary,
            cursor: 'pointer',
            padding: '0.25rem 0.5rem',
            fontSize: '0.8rem',
          }}
        >
          ⚙ Règles
        </button>
      }
    >
      {showRulesEditor && (
        <div style={{ marginBottom: 12 }}>
          <ContextDroppingRulesEditor onClose={() => setShowRulesEditor(false)} />
        </div>
      )}

      <div
        data-testid="graph-context-dropping-input"
        style={{
          marginBottom: 12,
          padding: '0.5rem 0.65rem',
          borderRadius: 6,
          border: `1px solid ${theme.border.secondary}`,
          backgroundColor: theme.background.tertiary,
        }}
      >
        <p style={{ fontWeight: 600, fontSize: '0.82rem', margin: '0 0 0.35rem' }}>Entrant analysé</p>
        <p style={{ fontSize: '0.74rem', color: theme.text.secondary, margin: '0 0 0.45rem' }}>
          Comparaison entre <strong>vos sélections dans le sélecteur de contexte</strong> (comme pour la
          génération) et le texte des <strong>lignes</strong> plus les <strong>libellés de choix</strong>{' '}
          des nœuds dialogue. Les locuteurs, titres de nœuds et alias non écrits dans ces champs ne comptent
          pas. Tout nom encore coché alors qu&apos;il ne participe pas à cette scène peut produire une
          alerte.
        </p>
        <ul
          style={{
            fontSize: '0.74rem',
            margin: 0,
            paddingLeft: '1.15rem',
            color: theme.text.secondary,
          }}
        >
          {inputLines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        data-testid="graph-context-dropping-detect"
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
        {loading ? 'Analyse…' : 'Détecter context dropping'}
      </button>

      {error ? (
        <div
          role="alert"
          data-testid="graph-context-dropping-error"
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
        <div data-testid="graph-context-dropping-report">
          <GraphContextDroppingSummary response={last} />
          <GraphContextDroppingCaseList cases={last.cases} onJumpCase={onJump} />
        </div>
      ) : null}
    </GraphToolFloatingShell>
  )
}
