/** Menu déroulant auto-layout : espacement et direction Dagre (Story 17.9). */
import { Badge } from '../shared'
import { theme } from '../../theme'
import { GRAPH_TOOLBAR_DROPDOWN_Z_INDEX } from './graphToolbarConstants'
import type { GraphToolbarToolsRowProps } from './graphToolbarTypes'

export function GraphToolbarLayoutDropdown(props: GraphToolbarToolsRowProps) {
  const {
    isNarrowToolbar,
    chrome,
    chromeStyles,
    canEditGraph,
    showAutoLayoutDropdown,
    setShowAutoLayoutDropdown,
    autoLayoutDropdownRef,
    layoutDirection,
    layoutSpacingMode,
    setLayoutSpacingMode,
    handleAutoLayout,
  } = props
  const { graphChromeTouch, graphChromeTouchNarrow, effectiveButtonPadding, effectiveButtonFontSizeRem } =
    chromeStyles

  return (
    <div ref={autoLayoutDropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => canEditGraph && setShowAutoLayoutDropdown((v) => !v)}
        disabled={!canEditGraph}
        style={{
          ...(isNarrowToolbar ? graphChromeTouchNarrow : graphChromeTouch),
          padding: effectiveButtonPadding,
          border: `1px solid ${theme.border.primary}`,
          borderRadius: '6px',
          backgroundColor: theme.button.default.background,
          color: theme.button.default.color,
          cursor: canEditGraph ? 'pointer' : 'not-allowed',
          opacity: canEditGraph ? 1 : 0.6,
          fontSize: `${effectiveButtonFontSizeRem}rem`,
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          fontWeight: 600,
        }}
        title="Auto-layout (Dagre) — choisir la direction"
        aria-label="Auto-layout (Dagre) — choisir la direction"
      >
        <span aria-hidden>📐</span>
        {!isNarrowToolbar ? (
          <span style={{ textTransform: 'capitalize' }}>
            <Badge variant="neutral" size="sm">
              {layoutSpacingMode}
            </Badge>
          </span>
        ) : (
          <span style={{ textTransform: 'capitalize' }}>{layoutSpacingMode}</span>
        )}
        <span style={{ fontSize: '0.7em', opacity: 0.9 }}>▼</span>
      </button>
      {showAutoLayoutDropdown && (
        <div
          role="listbox"
          aria-label="Direction du layout"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '4px',
            minWidth: '100%',
            padding: '4px 0',
            border: `1px solid ${theme.input.border}`,
            borderRadius: '6px',
            backgroundColor: theme.input.background,
            color: theme.input.color,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            zIndex: GRAPH_TOOLBAR_DROPDOWN_Z_INDEX,
          }}
        >
          <div
            style={{
              padding: '0.4rem 0.75rem 0.25rem',
              fontSize: `${chrome.chipFontSizeRem}rem`,
              fontWeight: 700,
              color: theme.text.secondary,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Espacement
          </div>
          {(
            [
              { value: 'compact' as const, label: 'Compact' },
              { value: 'normal' as const, label: 'Normal' },
              { value: 'large' as const, label: 'Large' },
            ] as const
          ).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="option"
              aria-selected={layoutSpacingMode === value}
              onClick={() => {
                setLayoutSpacingMode(value)
                void handleAutoLayout(layoutDirection)
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: chrome.dropdownItemPadding,
                border: 'none',
                background:
                  layoutSpacingMode === value ? theme.button.default.background : 'transparent',
                color: theme.input.color,
                textAlign: 'left',
                fontSize: `${chrome.dropdownItemFontSizeRem}rem`,
                cursor: 'pointer',
              }}
            >
              {label}
              {layoutSpacingMode === value ? ' ✓' : ''}
            </button>
          ))}
          <div style={{ margin: '0.25rem 0', borderTop: `1px solid ${theme.border.primary}` }} />
          <div
            style={{
              padding: '0.15rem 0.75rem 0.25rem',
              fontSize: `${chrome.chipFontSizeRem}rem`,
              fontWeight: 700,
              color: theme.text.secondary,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Direction
          </div>
          {(
            [
              { value: 'TB' as const, label: 'TB (Haut-Bas)' },
              { value: 'LR' as const, label: 'LR (Gauche-Droite)' },
              { value: 'BT' as const, label: 'BT (Bas-Haut)' },
              { value: 'RL' as const, label: 'RL (Droite-Gauche)' },
            ] as const
          ).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="option"
              aria-selected={layoutDirection === value}
              onClick={() => {
                setShowAutoLayoutDropdown(false)
                void handleAutoLayout(value)
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: chrome.dropdownItemPadding,
                border: 'none',
                background:
                  layoutDirection === value ? theme.button.default.background : 'transparent',
                color: theme.input.color,
                textAlign: 'left',
                fontSize: `${chrome.dropdownItemFontSizeRem}rem`,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
