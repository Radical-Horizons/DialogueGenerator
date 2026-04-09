/**
 * Panneau simulation de flux : dead ends, cul-de-sacs et couverture (FR46 + FR47).
 */
import { useCallback, useState } from 'react'
import { useGraphStore } from '../../store/graphStore'
import { useGraphViewStore } from '../../store/graphViewStore'
import { theme } from '../../theme'
import * as graphAPI from '../../api/graph'
import { getErrorMessage } from '../../types/errors'
import type { SimulateFlowResponse, ValidationErrorDetail } from '../../types/graph'
import { CoverageSection } from './CoverageSection'

interface FlowSimulationPanelProps {
  onClose: () => void
}

interface SimulationItemListProps {
  items: ValidationErrorDetail[]
  titleId: string
  icon: string
  singular: string
  plural: string
  itemTestId: string
  color: string
}

function SimulationItemList({
  items,
  titleId,
  icon,
  singular,
  plural,
  itemTestId,
  color,
}: SimulationItemListProps) {
  const requestFitViewOnNodeIds = useGraphViewStore((s) => s.requestFitViewOnNodeIds)

  if (items.length === 0) return null
  return (
    <section aria-labelledby={titleId}>
      <div id={titleId} style={{ fontWeight: 600, marginBottom: 4, color }}>
        {icon} {items.length} {items.length > 1 ? plural : singular}
      </div>
      <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.82rem' }}>
        {items.map((item) => (
          <li key={item.node_id} style={{ marginBottom: 4 }}>
            <button
              type="button"
              data-testid={itemTestId}
              onClick={() => item.node_id && requestFitViewOnNodeIds([item.node_id])}
              style={{
                background: 'transparent',
                border: 'none',
                color: theme.border.focus,
                cursor: 'pointer',
                padding: 0,
                fontSize: '0.82rem',
                textAlign: 'left',
                width: '100%',
              }}
            >
              {item.message}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function FlowSimulationPanel({ onClose }: FlowSimulationPanelProps) {
  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<SimulateFlowResponse | null>(null)

  const runSimulation = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await graphAPI.simulateFlow({
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type ?? 'dialogueNode',
          position: n.position,
          data: n.data,
        })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          type: e.type,
          label: typeof e.label === 'string' ? e.label : undefined,
          data: e.data as Record<string, unknown> | undefined,
        })),
      })
      setLast(res)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [nodes, edges])

  const hasResults = last !== null
  const isEmpty = hasResults && last.dead_ends.length === 0 && last.cul_de_sacs.length === 0

  return (
    <div
      data-testid="flow-simulation-panel"
      style={{
        position: 'absolute',
        top: 80,
        left: 800,
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
        <strong>Simulation de flux</strong>
        <button
          type="button"
          data-testid="flow-simulation-close"
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

      <p style={{ fontSize: '0.8rem', color: theme.text.secondary, marginBottom: '0.5rem' }}>
        Détecte les nœuds inatteignables (dead ends) et les cul-de-sacs (nœuds sans sortie
        non-END).
      </p>

      <button
        type="button"
        data-testid="flow-simulation-run"
        disabled={loading || nodes.length === 0}
        onClick={() => void runSimulation()}
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
        {loading ? 'Simulation…' : 'Simuler le flux'}
      </button>

      {error ? (
        <div
          role="alert"
          data-testid="flow-simulation-error"
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

      {hasResults ? (
        <div data-testid="flow-simulation-report">
          {last.coverage && (
            <div style={{ marginBottom: '0.75rem' }}>
              <CoverageSection coverage={last.coverage} />
            </div>
          )}
          {isEmpty ? (
            <p
              data-testid="flow-simulation-ok"
              style={{ color: theme.text.secondary, fontSize: '0.85rem' }}
            >
              ✅ Aucun problème détecté
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <SimulationItemList
                items={last.dead_ends}
                titleId="flow-dead-ends-title"
                icon="🚫"
                singular="dead end"
                plural="dead ends"
                itemTestId="flow-simulation-dead-end-item"
                color={theme.state.error.color}
              />
              <SimulationItemList
                items={last.cul_de_sacs}
                titleId="flow-cul-de-sacs-title"
                icon="⚠️"
                singular="cul-de-sac"
                plural="cul-de-sacs"
                itemTestId="flow-simulation-cul-de-sac-item"
                color="#f57c00"
              />
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
