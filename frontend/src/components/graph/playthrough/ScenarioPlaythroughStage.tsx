/**
 * Zone speaker + réplique (Visual Novel).
 */
import type { PlaythroughStep } from '../../../utils/scenarioPlaythroughEngine'
import { theme } from '../../../theme'
import { playthroughChrome } from './playthroughChrome'

export interface ScenarioPlaythroughStageProps {
  step: PlaythroughStep | null
  transientMessage: string | null
}

export function ScenarioPlaythroughStage({ step, transientMessage }: ScenarioPlaythroughStageProps) {
  if (!step) {
    return (
      <div
        data-testid="playthrough-stage-empty"
        style={{ color: theme.text.secondary, textAlign: 'center', padding: '2rem' }}
      >
        Aucun nœud de départ trouvé dans ce dialogue.
      </div>
    )
  }

  if (step.kind === 'end') {
    return null
  }

  const speaker = step.speaker?.trim()
  const line = step.line?.trim() || '(réplique vide)'

  return (
    <div
      data-testid="playthrough-stage"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: '2rem 1.25rem 1rem',
        minHeight: 0,
      }}
    >
      {transientMessage ? (
        <div
          data-testid="playthrough-transient-message"
          role="status"
          style={{
            marginBottom: '1rem',
            padding: '10px 16px',
            borderRadius: 8,
            backgroundColor: theme.state.info?.background ?? 'rgba(100, 108, 255, 0.15)',
            border: `1px solid ${playthroughChrome.choiceAccent}`,
            color: theme.text.primary,
            fontSize: '0.9rem',
            maxWidth: playthroughChrome.stageMaxWidth,
          }}
        >
          {transientMessage}
        </div>
      ) : null}
      {step.kind === 'test' && step.testSummary ? (
        <div
          data-testid="playthrough-test-banner"
          style={{
            marginBottom: '1rem',
            fontSize: '0.88rem',
            color: theme.text.secondary,
          }}
        >
          Test : {step.testSummary}
        </div>
      ) : null}
      <div
        style={{
          width: playthroughChrome.stageMaxWidth,
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
          border: `1px solid ${theme.border.primary}`,
          borderRadius: 12,
          padding: '1.25rem 1.5rem',
          backdropFilter: 'blur(8px)',
        }}
      >
        {speaker ? (
          <div
            data-testid="playthrough-speaker"
            style={{
              fontWeight: 700,
              fontSize: '0.95rem',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: playthroughChrome.speakerColor,
              marginBottom: '0.65rem',
            }}
          >
            {speaker}
          </div>
        ) : null}
        <p
          data-testid="playthrough-line"
          style={{
            margin: 0,
            fontSize: playthroughChrome.lineFontSize,
            lineHeight: 1.55,
            color: theme.text.primary,
            whiteSpace: 'pre-wrap',
          }}
        >
          {line}
        </p>
      </div>
    </div>
  )
}
