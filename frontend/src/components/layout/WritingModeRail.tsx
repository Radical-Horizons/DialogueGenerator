/**
 * Rails latéraux du mode écriture (écran 2c).
 *
 * Les panneaux sont repliés mais rien n'est perdu : le rail gauche garde le
 * compteur de fiches et leurs initiales, le rail droit le total de tokens.
 * Un clic ramène le panneau correspondant.
 */
import { redesignAccent, redesignFont, redesignHairline, redesignText } from '../../theme/redesignTokens'
import { entityInitials } from '../../utils/entityInitials'

const RAIL_WIDTH_PX = 52
/** Au-delà, les puces déborderaient la hauteur utile du rail. */
const MAX_RAIL_CHIPS = 5

export interface WritingModeRailProps {
  side: 'left' | 'right'
  onExpand: () => void
  ariaLabel: string
  /** Rail gauche : noms des fiches sélectionnées. */
  entityNames?: string[]
  /** Rail droit : total de tokens du prompt. */
  tokenCount?: number | null
}

function formatTokensCompact(value: number): string {
  return value >= 1000 ? `${Math.round(value / 1000)}K` : String(value)
}

export function WritingModeRail({
  side,
  onExpand,
  ariaLabel,
  entityNames = [],
  tokenCount = null,
}: WritingModeRailProps) {
  const chips = entityNames.slice(0, MAX_RAIL_CHIPS)
  const overflow = entityNames.length - chips.length

  return (
    <div
      data-testid={`writing-mode-rail-${side}`}
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        [side]: 0,
        width: RAIL_WIDTH_PX,
        zIndex: 40,
        borderRight: side === 'left' ? `1px solid ${redesignHairline.standard}` : undefined,
        borderLeft: side === 'right' ? `1px solid ${redesignHairline.standard}` : undefined,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '16px 0',
        gap: 14,
        pointerEvents: 'none',
      }}
    >
      {side === 'left' && entityNames.length > 0 && (
        <span
          data-testid="writing-rail-count"
          style={{ fontFamily: redesignFont.mono, fontSize: '10px', color: redesignAccent.base }}
        >
          {entityNames.length}
        </span>
      )}
      {side === 'right' && (
        <button
          type="button"
          onClick={onExpand}
          aria-label={ariaLabel}
          title={ariaLabel}
          style={{
            border: 'none',
            background: 'none',
            padding: 0,
            cursor: 'pointer',
            fontSize: 13,
            color: redesignText.label,
            pointerEvents: 'auto',
          }}
        >
          ‹
        </button>
      )}

      <span aria-hidden style={{ width: 18, height: 1, background: 'rgba(255,255,255,0.12)' }} />

      {side === 'left' &&
        chips.map((name) => (
          <span
            key={name}
            title={name}
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.1)',
              fontFamily: redesignFont.mono,
              fontSize: '9.5px',
              color: redesignText.muted,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {entityInitials(name)}
          </span>
        ))}
      {side === 'left' && overflow > 0 && (
        <span style={{ fontFamily: redesignFont.mono, fontSize: '9.5px', color: redesignText.label }}>
          +{overflow}
        </span>
      )}

      {side === 'right' && tokenCount != null && (
        <span
          data-testid="writing-rail-tokens"
          style={{ fontFamily: redesignFont.mono, fontSize: '10px', color: redesignText.muted }}
        >
          {formatTokensCompact(tokenCount)}
        </span>
      )}

      <div style={{ flex: 1 }} />

      {side === 'left' && (
        <button
          type="button"
          onClick={onExpand}
          aria-label={ariaLabel}
          title={ariaLabel}
          style={{
            border: 'none',
            background: 'none',
            padding: 0,
            cursor: 'pointer',
            fontSize: 13,
            color: redesignText.label,
            pointerEvents: 'auto',
          }}
        >
          ›
        </button>
      )}
    </div>
  )
}
