/**
 * Fil d'Ariane compact : personnage › dialogue › nœud (zone graphe).
 */
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import { useGraphContextBreadcrumb } from '../../hooks/useGraphContextBreadcrumb'

export function GraphContextBreadcrumb() {
  const { contextLabel, dialogueLabel, nodeLabel } = useGraphContextBreadcrumb()
  const segments = [contextLabel, dialogueLabel, nodeLabel].filter(
    (s): s is string => Boolean(s)
  )

  if (segments.length === 0) return null

  return (
    <nav
      data-testid="graph-context-breadcrumb"
      aria-label="Contexte d'édition"
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.35rem',
        padding: '0.35rem 0.75rem',
        borderBottom: `1px solid ${theme.border.primary}`,
        backgroundColor: theme.background.secondary,
        fontSize: remSize('caption'),
        color: theme.text.secondary,
        minWidth: 0,
      }}
    >
      {segments.map((segment, index) => (
        <span
          key={`${segment}-${index}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}
        >
          {index > 0 && (
            <span aria-hidden style={{ color: theme.text.tertiary, flexShrink: 0 }}>
              ›
            </span>
          )}
          <span
            title={segment}
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: index === segments.length - 1 ? 'min(280px, 40vw)' : 'min(200px, 30vw)',
              color: index === segments.length - 1 ? theme.text.primary : theme.text.secondary,
              fontWeight: index === segments.length - 1 ? 600 : 400,
            }}
          >
            {segment}
          </span>
        </span>
      ))}
    </nav>
  )
}
