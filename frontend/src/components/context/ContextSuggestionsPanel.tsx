/**
 * Panneau de suggestions automatiques de contexte GDD (Story 3.3 — règles basées sur relations).
 * Affiché sous ContextSelector lorsque des suggestions sont disponibles dans le store.
 */
import { useContextStore } from '../../store/contextStore'
import type { SuggestionEntityType, SuggestionItem } from '../../types/api'
import { theme } from '../../theme'

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

  if (suggestions.length === 0) return null

  const groups = groupByType(suggestions)

  return (
    <div
      data-testid="context-suggestions-panel"
      style={{
        borderTop: `1px solid ${theme.border.primary}`,
        padding: '0.5rem',
        backgroundColor: theme.background.secondary,
        fontSize: '0.85rem',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: '0.4rem', color: theme.text.secondary }}>
        Suggestions ({suggestions.length})
      </div>

      {Array.from(groups.entries()).map(([type, items]) => {
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
      })}
    </div>
  )
}

const baseButtonStyle: React.CSSProperties = {
  border: 'none',
  cursor: 'pointer',
  borderRadius: '3px',
  padding: '1px 6px',
  fontSize: '0.78rem',
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
