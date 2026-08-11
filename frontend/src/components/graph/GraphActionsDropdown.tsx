import { memo } from 'react'
import { theme } from '../../theme'
import {
  GRAPH_TOOLBAR_DROPDOWN_MAX_HEIGHT,
  GRAPH_TOOLBAR_DROPDOWN_Z_INDEX,
} from './graphToolbarConstants'
import { graphToolbarChevronStyle, graphToolbarTextEntryStyle } from './graphToolbarTextEntry'

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
  /** `text` : entrée texte de la rangée 2e (sans bordure, zone tactile conservée). */
  triggerVariant?: 'default' | 'text'
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
  triggerVariant = 'default',
}: GraphActionsDropdownProps) {
  const isMenuEnabled = menuEnabled ?? canEditGraph
  const triggerStyle =
    triggerVariant === 'text'
      ? graphToolbarTextEntryStyle({
          touch: graphChromeTouch,
          disabled: !isMenuEnabled,
          active: showActionsDropdown,
        })
      : {
          ...graphChromeTouch,
          padding: buttonPadding,
          border: `1px solid ${theme.border.primary}`,
          borderRadius: '6px',
          backgroundColor: theme.button.default.background,
          color: theme.button.default.color,
          cursor: isMenuEnabled ? ('pointer' as const) : ('not-allowed' as const),
          opacity: isMenuEnabled ? 1 : 0.6,
          fontSize: `${buttonFontSizeRem}rem`,
          display: 'inline-flex' as const,
          alignItems: 'center' as const,
          gap: '0.35rem',
        }
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
        style={triggerStyle}
        title={dropdownTitle}
      >
        {isNarrow ? '⋯' : dropdownLabel}
        {!isNarrow && (
          <span style={triggerVariant === 'text' ? graphToolbarChevronStyle : { fontSize: '0.7rem' }}>
            ▾
          </span>
        )}
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

