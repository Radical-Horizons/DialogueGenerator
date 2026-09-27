/**
 * Résumé compact du contexte avec chips (PJ, PNJ, Région, etc.).
 */
import { redesignAccent, redesignRadius, redesignSpacing, redesignText } from '../../theme/redesignTokens'
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
        gap: `${redesignSpacing.xs}px`,
        ...style,
      }}
    >
      {chips.map((chip, index) => {
        // Les tags sont des étiquettes libres : chip neutre. Le reste décrit la scène sélectionnée.
        const isNeutral = chip.label === 'Tag'
        return (
          <div
            key={`${chip.label}-${chip.value}-${index}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              boxSizing: 'border-box',
              height: 22,
              padding: '0 8px',
              borderRadius: `${redesignRadius.chip}px`,
              border: `1px solid ${isNeutral ? 'rgba(255, 255, 255, 0.12)' : 'rgba(79, 127, 255, 0.4)'}`,
              backgroundColor: isNeutral ? 'transparent' : 'rgba(79, 127, 255, 0.1)',
              color: isNeutral ? redesignText.muted : redesignAccent.light,
              fontSize: '11px',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontWeight: 500, marginRight: redesignSpacing.xs }}>
              {chip.label}:
            </span>
            <span>{chip.value}</span>
          </div>
        )
      })}
    </div>
  )
}

