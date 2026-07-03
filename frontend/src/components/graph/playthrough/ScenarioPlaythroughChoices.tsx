/**
 * Liste de choix playthrough avec highlight branches non testées.
 */
import type { PlaythroughChoicePresentation } from '../../../utils/scenarioPlaythroughEngine'
import { theme } from '../../../theme'
import { playthroughChrome } from './playthroughChrome'

export interface ScenarioPlaythroughChoicesProps {
  choices: PlaythroughChoicePresentation[]
  onSelectChoice: (index: number) => void
  onContinue?: () => void
  continueTarget?: string
}

function choiceBorder(status: PlaythroughChoicePresentation['status']): string {
  switch (status) {
    case 'untested':
      return playthroughChrome.choiceAccent
    case 'tested':
      return theme.border.primary
    case 'masked':
    case 'effort_blocked':
      return theme.border.secondary
    default:
      return theme.border.primary
  }
}

export function ScenarioPlaythroughChoices({
  choices,
  onSelectChoice,
  onContinue,
  continueTarget,
}: ScenarioPlaythroughChoicesProps) {
  if (choices.length === 0 && continueTarget) {
    return (
      <div
        style={{
          padding: '1rem 1.25rem 1.5rem',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <button
          type="button"
          data-testid="playthrough-continue"
          onClick={onContinue}
          style={{
            padding: '12px 28px',
            fontSize: '1rem',
            fontWeight: 600,
            borderRadius: 8,
            border: `2px solid ${playthroughChrome.choiceAccent}`,
            background: theme.button.primary.background,
            color: theme.button.primary.color,
            cursor: 'pointer',
          }}
        >
          Continuer →
        </button>
      </div>
    )
  }

  if (choices.length === 0) return null

  return (
    <div
      data-testid="playthrough-choices"
      style={{
        padding: '0.75rem 1.25rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        alignItems: 'center',
        maxHeight: '42vh',
        overflowY: 'auto',
      }}
    >
      {choices.map((choice) => {
        const disabled = !choice.selectable
        return (
          <button
            key={choice.index}
            type="button"
            data-testid={`playthrough-choice-${choice.index}`}
            data-choice-status={choice.status}
            disabled={disabled}
            title={choice.disabledReason ?? choice.skillCheckSummary}
            onClick={() => onSelectChoice(choice.index)}
            style={{
              width: playthroughChrome.stageMaxWidth,
              textAlign: 'left',
              padding: '12px 16px',
              borderRadius: 8,
              border: `2px solid ${choiceBorder(choice.status)}`,
              boxShadow: choice.status === 'untested' ? playthroughChrome.choiceUntestedGlow : undefined,
              background:
                choice.status === 'untested'
                  ? 'rgba(100, 108, 255, 0.12)'
                  : theme.background.tertiary,
              color: disabled ? theme.text.tertiary : theme.text.primary,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.65 : 1,
              fontSize: '0.95rem',
              lineHeight: 1.4,
            }}
          >
            <span style={{ fontWeight: 600, marginRight: 8 }}>{choice.index + 1}.</span>
            {choice.text}
            {choice.status === 'untested' ? (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: playthroughChrome.choiceAccent,
                }}
              >
                Non testé
              </span>
            ) : null}
            {choice.skillCheckSummary ? (
              <div style={{ fontSize: '0.78rem', color: theme.text.secondary, marginTop: 4 }}>
                {choice.skillCheckSummary}
              </div>
            ) : null}
            {choice.disabledReason ? (
              <div style={{ fontSize: '0.78rem', color: theme.state.error.color, marginTop: 4 }}>
                {choice.disabledReason}
              </div>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
