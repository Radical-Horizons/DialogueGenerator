/**
 * Panneau « Context dropping » : absence ou usage trop indirect du contexte GDD (FR44).
 */
import { useCallback, useState } from 'react'
import { useGraphStore } from '../../store/graphStore'
import { useContextStore } from '../../store/contextStore'
import { theme } from '../../theme'
import * as graphAPI from '../../api/graph'
import { getErrorMessage } from '../../types/errors'
import type { ContextDroppingCaseItem, DetectContextDroppingResponse } from '../../types/graph'
import { GraphContextDroppingCaseList } from './GraphContextDroppingCaseList'
import { GraphContextDroppingSummary } from './GraphContextDroppingSummary'

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

  const runDetect = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await graphAPI.detectContextDropping({
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
        context_selections: contextSelections as Record<string, unknown>,
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
    <div
      data-testid="graph-context-dropping-panel"
      style={{
        position: 'absolute',
        top: 80,
        left: 400,
        width: 'min(380px, calc(100% - 32px))',
        maxHeight: 'min(520px, 70vh)',
        overflowY: 'auto',
        backgroundColor: theme.background.panel,
        border: `1px solid ${theme.border.primary}`,
        borderRadius: 8,
        padding: '0.75rem',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
        zIndex: 1001,
        color: theme.text.primary,
        fontSize: '0.88rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <strong id="context-dropping-title">Context dropping</strong>
        <button
          type="button"
          data-testid="graph-context-dropping-close"
          onClick={onClose}
          style={{
            border: `1px solid ${theme.border.primary}`,
            borderRadius: 6,
            background: theme.button.default.background,
            color: theme.text.primary,
            cursor: 'pointer',
            padding: '0.25rem 0.5rem',
          }}
        >
          Fermer
        </button>
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
    </div>
  )
}
