/**
 * Liste détaillée des cas context dropping (FR44).
 */
import { theme } from '../../theme'
import type { ContextDroppingCaseItem } from '../../types/graph'

export function GraphContextDroppingCaseList({
  cases,
  onJumpCase,
}: {
  cases: ContextDroppingCaseItem[]
  onJumpCase: (c: ContextDroppingCaseItem) => void
}) {
  if (!cases.length) return null
  return (
    <ul
      data-testid="graph-context-dropping-cases"
      aria-labelledby="context-dropping-title"
      style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.82rem' }}
    >
      {cases.slice(0, 60).map((c, i) => (
        <li key={`${c.context_label}-${i}`} style={{ marginBottom: 8 }}>
          <button
            type="button"
            data-testid="graph-context-dropping-jump"
            onClick={() => onJumpCase(c)}
            disabled={!c.node_id}
            style={{
              display: 'block',
              textAlign: 'left',
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: c.node_id ? theme.border.focus : theme.text.secondary,
              cursor: c.node_id ? 'pointer' : 'default',
              padding: 0,
              fontSize: '0.82rem',
            }}
          >
            [{c.kind}] {c.node_display_id ?? c.node_id ?? '—'} — {c.context_label}
          </button>
          <span style={{ color: theme.text.secondary }}>{c.suggestion}</span>
        </li>
      ))}
    </ul>
  )
}
