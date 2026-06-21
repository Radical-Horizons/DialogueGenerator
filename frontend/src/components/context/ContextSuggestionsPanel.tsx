/**
 * Panneau dépliant permanent de suggestions automatiques de contexte GDD (Story 3.3).
 * Toujours visible — affiche le compteur dans le header. Vide si aucune entité sélectionnée.
 */
import { useContextStore } from '../../store/contextStore'
import type { SuggestionEntityType, SuggestionItem } from '../../types/api'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import { ContextPanelAccordionSection } from './ContextPanelAccordion'

const TYPE_LABEL: Record<SuggestionEntityType, string> = {
  character: 'Personnages',
  location: 'Lieux',
  item: 'Objets',
  species: 'Espèces',
  community: 'Communautés',
}

function groupByType(suggestions: SuggestionItem[]): Map<SuggestionEntityType, SuggestionItem[]> {
  const groups = new Map<SuggestionEntityType, SuggestionItem[]>()
  for (const sg of suggestions) {
    const existing = groups.get(sg.type) ?? []
    existing.push(sg)
    groups.set(sg.type, existing)
  }
  return groups
}

export function ContextSuggestionsPanel() {
  const {
    suggestions,
    acceptSuggestion,
    ignoreSuggestion,
    acceptAllSuggestionsByType,
    ignoreAllSuggestionsByType,
  } = useContextStore()

  const groups = groupByType(suggestions)

  return (
    <ContextPanelAccordionSection
      testId="context-suggestions-panel"
      summaryTestId="context-suggestions-panel-toggle"
      title="Suggestions"
      badgeCount={suggestions.length}
      muted={suggestions.length === 0}
      bodyStyle={{ padding: '0 0.75rem 0.5rem' }}
    >
      {suggestions.length === 0 ? (
        <p
          style={{
            margin: 0,
            padding: '0.25rem 0',
            color: theme.text.secondary,
            fontSize: remSize('small'),
            fontStyle: 'italic',
          }}
        >
          Sélectionnez une entité pour voir les suggestions liées.
        </p>
      ) : (
        Array.from(groups.entries()).map(([type, items]) => {
          const label = TYPE_LABEL[type]
          return (
            <div key={type} style={{ marginBottom: '0.4rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '0.2rem',
                }}
              >
                <span style={{ fontWeight: 500, color: theme.text.primary }}>{label}</span>
                <span>
                  <button
                    aria-label={`Accepter tout ${label}`}
                    onClick={() => acceptAllSuggestionsByType(type)}
                    style={groupActionStyle}
                  >
                    ✓ Tout
                  </button>
                  <button
                    aria-label={`Ignorer tout ${label}`}
                    onClick={() => ignoreAllSuggestionsByType(type)}
                    style={{ ...groupActionStyle, marginLeft: '0.25rem' }}
                  >
                    ✕ Tout
                  </button>
                </span>
              </div>

              {items.map((sg) => (
                <div
                  key={sg.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    paddingLeft: '0.5rem',
                    marginBottom: '0.15rem',
                  }}
                >
                  <span style={{ flex: 1, color: theme.text.primary }}>{sg.name}</span>
                  <button
                    aria-label={`Accepter ${sg.name}`}
                    onClick={() => acceptSuggestion(type, sg.name)}
                    style={acceptStyle}
                  >
                    ✓
                  </button>
                  <button
                    aria-label={`Ignorer ${sg.name}`}
                    onClick={() => ignoreSuggestion(type, sg.name)}
                    style={ignoreStyle}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )
        })
      )}
    </ContextPanelAccordionSection>
  )
}

const baseButtonStyle: React.CSSProperties = {
  border: 'none',
  cursor: 'pointer',
  borderRadius: '3px',
  padding: '1px 6px',
  fontSize: remSize('caption'),
  fontWeight: 600,
}

const acceptStyle: React.CSSProperties = {
  ...baseButtonStyle,
  backgroundColor: theme.state.success?.background ?? '#2d6a4f',
  color: '#fff',
}

const ignoreStyle: React.CSSProperties = {
  ...baseButtonStyle,
  backgroundColor: theme.state.error.background,
  color: theme.state.error.color,
}

const groupActionStyle: React.CSSProperties = {
  ...baseButtonStyle,
  backgroundColor: theme.background.tertiary,
  color: theme.text.secondary,
}
