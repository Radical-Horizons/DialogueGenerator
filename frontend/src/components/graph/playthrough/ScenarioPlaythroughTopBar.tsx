/**
 * Barre supérieure du mode playthrough VN.
 */
import type React from 'react'
import { theme } from '../../../theme'
import type { PlaythroughCoverage } from '../../../utils/scenarioPlaythroughEngine'
import { playthroughChrome } from './playthroughChrome'

export interface ScenarioPlaythroughTopBarProps {
  dialogueTitle: string
  coverage: PlaythroughCoverage
  showDevDrawer: boolean
  showGraphPeek: boolean
  onToggleDev: () => void
  onToggleGraph: () => void
  onReset: () => void
  onExit: () => void
}

export function ScenarioPlaythroughTopBar({
  dialogueTitle,
  coverage,
  showDevDrawer,
  showGraphPeek,
  onToggleDev,
  onToggleGraph,
  onReset,
  onExit,
}: ScenarioPlaythroughTopBarProps) {
  const btnStyle: React.CSSProperties = {
    padding: '6px 12px',
    borderRadius: 6,
    border: `1px solid ${theme.border.primary}`,
    background: theme.button.default.background,
    color: theme.text.primary,
    cursor: 'pointer',
    fontSize: '0.82rem',
    fontWeight: 600,
  }

  return (
    <header
      data-testid="playthrough-top-bar"
      style={{
        height: playthroughChrome.topBarHeight,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '0 14px',
        borderBottom: `1px solid ${theme.border.primary}`,
        backgroundColor: 'rgba(0, 0, 0, 0.35)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span style={{ fontSize: '1.1rem' }} aria-hidden>
          ▶
        </span>
        <span
          style={{
            fontWeight: 700,
            fontSize: '0.92rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {dialogueTitle}
        </span>
        <span
          data-testid="playthrough-coverage"
          style={{ fontSize: '0.78rem', color: theme.text.secondary, whiteSpace: 'nowrap' }}
        >
          {coverage.visitedNodeCount}/{coverage.totalDialogueNodes} nœuds ·{' '}
          {coverage.untestedChoiceCount} non testés
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          type="button"
          data-testid="playthrough-btn-dev"
          aria-pressed={showDevDrawer}
          onClick={onToggleDev}
          style={{
            ...btnStyle,
            ...(showDevDrawer
              ? { background: theme.button.selected.background, borderColor: theme.border.focus }
              : {}),
          }}
          title="Tiroir dev (D)"
        >
          Dev
        </button>
        <button
          type="button"
          data-testid="playthrough-btn-graph"
          aria-pressed={showGraphPeek}
          onClick={onToggleGraph}
          style={{
            ...btnStyle,
            ...(showGraphPeek
              ? { background: theme.button.selected.background, borderColor: theme.border.focus }
              : {}),
          }}
          title="Voir le graphe (G)"
        >
          Graphe
        </button>
        <button
          type="button"
          data-testid="playthrough-btn-reset"
          onClick={onReset}
          style={btnStyle}
          title="Rejouer depuis le début (R)"
        >
          ↺
        </button>
        <button
          type="button"
          data-testid="playthrough-btn-exit"
          onClick={onExit}
          style={{ ...btnStyle, borderColor: theme.state.error.border }}
          title="Quitter (Échap)"
        >
          ✕
        </button>
      </div>
    </header>
  )
}
