/**
 * Liste d'erreurs ou avertissements validation schéma Unity (Story 5.3 / FR51).
 */
import { theme } from '../../theme'
import type { SchemaValidationIssue } from '../../types/graph'

interface SchemaValidationIssueListProps {
  title: string
  issues: SchemaValidationIssue[]
  variant: 'error' | 'warning'
  onIssueClick?: (issue: SchemaValidationIssue) => void
  testIdPrefix: string
}

const VARIANT_STYLES = {
  error: { color: theme.text.primary, cursor: 'pointer' as const },
  warning: { color: theme.text.secondary, cursor: 'default' as const },
} as const

export function SchemaValidationIssueList({
  title,
  issues,
  variant,
  onIssueClick,
  testIdPrefix,
}: SchemaValidationIssueListProps) {
  if (issues.length === 0) return null

  return (
    <section data-testid={`${testIdPrefix}-section`} style={{ marginTop: 8 }}>
      <p
        data-testid={`${testIdPrefix}-summary`}
        style={{ margin: '0 0 4px', fontSize: '0.82rem', fontWeight: 600, color: theme.text.primary }}
      >
        {title}
      </p>
      <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.82rem' }}>
        {issues.map((issue, idx) => (
          <li
            key={`${issue.code}-${idx}`}
            data-testid={`${testIdPrefix}-item`}
            onClick={
              variant === 'error' && onIssueClick ? () => onIssueClick(issue) : undefined
            }
            style={{
              marginBottom: 4,
              ...VARIANT_STYLES[variant],
            }}
            title={variant === 'error' && onIssueClick ? 'Cliquer pour localiser le nœud' : undefined}
          >
            {issue.message}
          </li>
        ))}
      </ul>
    </section>
  )
}
