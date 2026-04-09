import { memo } from 'react'
import { theme } from '../../theme'

export interface GraphActionsDropdownProps {
  canEditGraph: boolean
  isNarrow: boolean
  disabledReason?: string
  graphChromeTouch: React.CSSProperties
  buttonPadding: string
  buttonFontSizeRem: number
  groupGapRem: number
  actionsDropdownRef: React.RefObject<HTMLDivElement>
  actionsDropdownBtnRef: React.RefObject<HTMLButtonElement>
  showActionsDropdown: boolean
  setShowActionsDropdown: (next: boolean | ((v: boolean) => boolean)) => void
  renderMenuItems: () => React.ReactNode
}

export const GraphActionsDropdown = memo(function GraphActionsDropdown({
  canEditGraph,
  isNarrow,
  graphChromeTouch,
  buttonPadding,
  buttonFontSizeRem,
  actionsDropdownRef,
  actionsDropdownBtnRef,
  showActionsDropdown,
  setShowActionsDropdown,
  renderMenuItems,
}: GraphActionsDropdownProps) {
  return (
    <div
      ref={actionsDropdownRef}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      <button
        ref={actionsDropdownBtnRef}
        data-testid="btn-actions-dropdown"
        type="button"
        onClick={() => canEditGraph && setShowActionsDropdown((v) => !v)}
        disabled={!canEditGraph}
        style={{
          ...graphChromeTouch,
          padding: buttonPadding,
          border: `1px solid ${theme.border.primary}`,
          borderRadius: '6px',
          backgroundColor: theme.button.default.background,
          color: theme.button.default.color,
          cursor: canEditGraph ? 'pointer' : 'not-allowed',
          opacity: canEditGraph ? 1 : 0.6,
          fontSize: `${buttonFontSizeRem}rem`,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
        }}
        title="Actions sur le graphe"
      >
        {isNarrow ? '⋯' : 'Actions'}
        {!isNarrow && <span style={{ fontSize: '0.7rem' }}>▼</span>}
      </button>

      {showActionsDropdown && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '4px',
            minWidth: '220px',
            backgroundColor: theme.background.tertiary,
            border: `1px solid ${theme.border.primary}`,
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            zIndex: 50,
            overflow: 'hidden',
          }}
        >
          {renderMenuItems()}
        </div>
      )}
    </div>
  )
})

