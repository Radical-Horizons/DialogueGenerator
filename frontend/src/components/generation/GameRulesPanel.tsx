/**
 * Règles systémiques appliquées au dialogue — section du tiroir de réglages.
 *
 * Extrait de `SystemPromptEditor` : ces règles décrivent comment le LLM traite
 * la scène, pas ce qu'on lui demande d'écrire. Elles ne sont donc pas un onglet.
 */
import { theme } from '../../theme'

export interface GameRulesPanelProps {
  gameRules: string
  onGameRulesChange: (rules: string) => void
}

export function GameRulesPanel({ gameRules, onGameRulesChange }: GameRulesPanelProps) {
  return (
    <div style={{ padding: '1rem' }}>
      <details>
        <summary style={{ cursor: 'pointer', color: theme.text.primary, fontWeight: 600 }}>
          Règles systémiques appliquées au dialogue
        </summary>
        <div style={{ marginTop: '0.75rem' }}>
          <textarea
            id="game-rules-textarea"
            value={gameRules}
            onChange={(e) => onGameRulesChange(e.target.value)}
            rows={8}
            placeholder="Ex: Influence/Respect uniquement quand la relation PNJ le justifie. Axes de réputation: Admiration, Prestige, Crainte. Inclure des options liées aux traits requis et aux gains systémiques quand pertinent."
            style={{
              width: '100%',
              padding: '0.65rem 0.75rem',
              boxSizing: 'border-box',
              backgroundColor: theme.input.background,
              border: `1px solid ${theme.input.border}`,
              color: theme.input.color,
              borderRadius: '6px',
              fontFamily: 'inherit',
              fontSize: '0.9rem',
              resize: 'vertical',
              lineHeight: 1.55,
            }}
          />
        </div>
      </details>
    </div>
  )
}
