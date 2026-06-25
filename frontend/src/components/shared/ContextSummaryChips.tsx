/**
 * Résumé compact du contexte avec chips (PJ, PNJ, Région, etc.).
 */
import { theme } from '../../theme'
import type { SceneSelection } from '../../types/generation'
import { useContextStore } from '../../store/contextStore'
import { resolveLocationDisplayName } from '../../utils/gddEntityNames'

interface ContextSummaryChipsProps {
  sceneSelection: SceneSelection
  tags?: string[]
  className?: string
  style?: React.CSSProperties
}

export function ContextSummaryChips({
  sceneSelection,
  tags = [],
  className,
  style,
}: ContextSummaryChipsProps) {
  const locations = useContextStore((state) => state.locations)
  const chips: Array<{ label: string; value: string | null }> = []

  if (sceneSelection.characterA) {
    chips.push({ label: 'PJ', value: sceneSelection.characterA })
  }
  if (sceneSelection.characterB) {
    chips.push({ label: 'PNJ', value: sceneSelection.characterB })
  }
  if (sceneSelection.sceneRegion) {
    chips.push({
      label: 'Région',
      value: resolveLocationDisplayName(sceneSelection.sceneRegion, locations),
    })
  }
  if (sceneSelection.subLocation) {
    chips.push({
      label: 'Sous-lieu',
      value: resolveLocationDisplayName(sceneSelection.subLocation, locations),
    })
  }
  if (tags.length > 0) {
    tags.forEach((tag) => chips.push({ label: 'Tag', value: tag }))
  }

  if (chips.length === 0) {
    return null
  }

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.5rem',
        padding: '0.75rem',
        backgroundColor: theme.background.tertiary,
        borderRadius: '4px',
        border: `1px solid ${theme.border.primary}`,
        ...style,
      }}
    >
      {chips.map((chip, index) => (
        <div
          key={`${chip.label}-${chip.value}-${index}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0.25rem 0.75rem',
            backgroundColor: theme.state.selected.background,
            color: theme.text.primary,
            borderRadius: '16px',
            fontSize: '0.85rem',
            border: `1px solid ${theme.button.primary.background}`,
          }}
        >
          <span style={{ fontWeight: 500, marginRight: '0.25rem' }}>
            {chip.label}:
          </span>
          <span>{chip.value}</span>
        </div>
      ))}
    </div>
  )
}

