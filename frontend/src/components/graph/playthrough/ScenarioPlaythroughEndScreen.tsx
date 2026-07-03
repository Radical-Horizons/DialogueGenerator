/**
 * Écran de fin + récap couverture playthrough.
 */
import { theme } from '../../../theme'
import type { PlaythroughCoverage } from '../../../utils/scenarioPlaythroughEngine'
import { playthroughChrome } from './playthroughChrome'

export interface ScenarioPlaythroughEndScreenProps {
  coverage: PlaythroughCoverage
  onReplay: () => void
  onExit: () => void
}

export function ScenarioPlaythroughEndScreen({
  coverage,
  onReplay,
  onExit,
}: ScenarioPlaythroughEndScreenProps) {
  const testedPct =
    coverage.totalAccessibleChoiceCount > 0
      ? Math.round(
          ((coverage.totalAccessibleChoiceCount - coverage.untestedChoiceCount) /
            coverage.totalAccessibleChoiceCount) *
            100,
        )
      : 100

  return (
    <div
      data-testid="playthrough-end-screen"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        gap: '1.25rem',
      }}
    >
      <div style={{ fontSize: '2.5rem' }} aria-hidden>
        🏁
      </div>
      <h2 style={{ margin: 0, color: theme.text.primary, fontSize: '1.5rem' }}>Fin du dialogue</h2>
      <div
        style={{
          maxWidth: playthroughChrome.stageMaxWidth,
          textAlign: 'center',
          color: theme.text.secondary,
          fontSize: '0.95rem',
          lineHeight: 1.5,
        }}
      >
        <p style={{ margin: '0 0 0.5rem' }}>
          Nœuds visités : {coverage.visitedNodeCount} / {coverage.totalDialogueNodes}
        </p>
        <p style={{ margin: 0 }}>
          Choix testés : {testedPct}% ({coverage.untestedChoiceCount} branche
          {coverage.untestedChoiceCount !== 1 ? 's' : ''} restante
          {coverage.untestedChoiceCount !== 1 ? 's' : ''})
        </p>
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <button
          type="button"
          data-testid="playthrough-end-replay"
          onClick={onReplay}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: `2px solid ${playthroughChrome.choiceAccent}`,
            background: theme.button.primary.background,
            color: theme.button.primary.color,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Rejouer
        </button>
        <button
          type="button"
          data-testid="playthrough-end-exit"
          onClick={onExit}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: `1px solid ${theme.border.primary}`,
            background: theme.button.default.background,
            color: theme.text.primary,
            cursor: 'pointer',
          }}
        >
          Quitter
        </button>
      </div>
    </div>
  )
}
