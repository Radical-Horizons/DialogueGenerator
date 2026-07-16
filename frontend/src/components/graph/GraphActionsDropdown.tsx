import { memo } from 'react'
import { theme } from '../../theme'
import {
  GRAPH_TOOLBAR_DROPDOWN_MAX_HEIGHT,
  GRAPH_TOOLBAR_DROPDOWN_Z_INDEX,
} from './graphToolbarConstants'

export interface GraphActionsDropdownProps {
  canEditGraph: boolean
  /** Si défini, contrôle l’ouverture du menu (ex. invité : export sans édition). */
  menuEnabled?: boolean
  isNarrow: boolean
  disabledReason?: string
  graphChromeTouch: React.CSSProperties
  buttonPadding: string
  buttonFontSizeRem: number
  groupGapRem: number
  actionsDropdownRef: React.RefObject<HTMLDivElement>
  actionsDropdownBtnRef?: React.RefObject<HTMLButtonElement>
  showActionsDropdown: boolean
  setShowActionsDropdown: (next: boolean | ((v: boolean) => boolean)) => void
  renderMenuItems: () => React.ReactNode
  /** Libellé du déclencheur (défaut : Actions). */
  dropdownLabel?: string
  /** data-testid du déclencheur. */
  dropdownTestId?: string
  /** title / aria-label du déclencheur. */
  dropdownTitle?: string
}

export const GraphActionsDropdown = memo(function GraphActionsDropdown({
  canEditGraph,
  menuEnabled,
  isNarrow,
  graphChromeTouch,
  buttonPadding,
  buttonFontSizeRem,
  actionsDropdownRef,
  actionsDropdownBtnRef,
  showActionsDropdown,
  setShowActionsDropdown,
  renderMenuItems,
  dropdownLabel = 'Actions',
  dropdownTestId = 'btn-actions-dropdown',
  dropdownTitle = 'Actions sur le graphe',
}: GraphActionsDropdownProps) {
  const isMenuEnabled = menuEnabled ?? canEditGraph
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
        data-testid={dropdownTestId}
        type="button"
        aria-label={dropdownLabel}
        aria-haspopup="menu"
        aria-expanded={showActionsDropdown}
        onClick={() => isMenuEnabled && setShowActionsDropdown((v) => !v)}
        disabled={!isMenuEnabled}
        style={{
          ...graphChromeTouch,
          padding: buttonPadding,
          border: `1px solid ${theme.border.primary}`,
          borderRadius: '6px',
          backgroundColor: theme.button.default.background,
          color: theme.button.default.color,
          cursor: isMenuEnabled ? 'pointer' : 'not-allowed',
          opacity: isMenuEnabled ? 1 : 0.6,
          fontSize: `${buttonFontSizeRem}rem`,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
        }}
        title={dropdownTitle}
      >
        {isNarrow ? '⋯' : dropdownLabel}
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
            zIndex: GRAPH_TOOLBAR_DROPDOWN_Z_INDEX,
            maxHeight: GRAPH_TOOLBAR_DROPDOWN_MAX_HEIGHT,
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          {renderMenuItems()}
        </div>
      )}
    </div>
  )
})

