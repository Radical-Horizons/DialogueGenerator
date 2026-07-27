import type { CSSProperties, ReactNode } from 'react'
import type { graphToolbarChrome } from '../../theme/responsiveChrome'

/** Tokens chrome toolbar confort ou narrow (Story 17.9). */
export type GraphToolbarChromeTokens =
  | (typeof graphToolbarChrome)['comfortable']
  | (typeof graphToolbarChrome)['narrow']

/** Styles tactiles partagés entre sous-composants toolbar. */
export interface GraphToolbarChromeStyles {
  graphChromeTouch: CSSProperties
  graphChromeTouchNarrow: CSSProperties
  effectiveButtonPadding: string
  effectiveButtonFontSizeRem: number
}

/** Slot titre / retour / sélecteur dialogue (Story 17.7). */
export interface GraphToolbarTitleBlockProps {
  isNarrowToolbar: boolean
  headerSelector?: ReactNode
  isStandalone: boolean
  onBack?: () => void
  chrome: GraphToolbarChromeTokens
  chromeStyles: GraphToolbarChromeStyles
  canEditGraph: boolean
  canUndoNow: boolean
  canRedoNow: boolean
  undo: () => void
  redo: () => void
  hasActiveDialogue: boolean
  showSearchBar: boolean
  setShowSearchBar: React.Dispatch<React.SetStateAction<boolean>>
  setHighlightedNodes: (ids: string[]) => void
}

/**
 * Props de la rangée outils, partagées par ses sous-composants.
 *
 * Définies ici et non dans `GraphToolbarToolsRow` : les enfants extraits en Story 17.9+
 * les consomment, et `GraphToolbarToolsRow` les importe — les héberger dans le parent
 * créerait un cycle d'import entre le parent et chacun de ses enfants.
 */
export interface GraphToolbarToolsRowProps {
  mode: 'comfort-tools' | 'narrow-actions'
  isNarrowToolbar: boolean
  chrome: GraphToolbarChromeTokens
  chromeStyles: GraphToolbarChromeStyles
  canEditGraph: boolean
  /** Menu Actions (export) — peut rester ouvert en mode invité lecture seule. */
  canOpenGraphActions?: boolean
  hasActiveDialogue: boolean
  isStandalone: boolean
  onBack?: () => void
  canUndoNow: boolean
  canRedoNow: boolean
  undo: () => void
  redo: () => void
  showSearchBar: boolean
  setShowSearchBar: React.Dispatch<React.SetStateAction<boolean>>
  setHighlightedNodes: (ids: string[]) => void
  showAutoLayoutDropdown: boolean
  setShowAutoLayoutDropdown: React.Dispatch<React.SetStateAction<boolean>>
  autoLayoutDropdownRef: React.RefObject<HTMLDivElement>
  layoutDirection: 'TB' | 'LR' | 'BT' | 'RL'
  layoutSpacingMode: 'compact' | 'normal' | 'large'
  setLayoutSpacingMode: (mode: 'compact' | 'normal' | 'large') => void
  handleAutoLayout: (direction: 'TB' | 'LR' | 'BT' | 'RL') => void | Promise<void>
  showActionsDropdown: boolean
  setShowActionsDropdown: React.Dispatch<React.SetStateAction<boolean>>
  actionsDropdownRef: React.RefObject<HTMLDivElement>
  actionsDropdownBtnRef: React.RefObject<HTMLButtonElement>
  showValidationToolsDropdown: boolean
  setShowValidationToolsDropdown: React.Dispatch<React.SetStateAction<boolean>>
  validationToolsDropdownRef: React.RefObject<HTMLDivElement>
  renderActionsMenuItems: () => React.ReactNode
  renderQualityMenuItems: () => React.ReactNode
  showShortcutsTooltip: boolean
  setShowShortcutsTooltip: React.Dispatch<React.SetStateAction<boolean>>
  selectedNodeId: string | null
  /** Mode playthrough VN actif. */
  scenarioPlaythroughActive?: boolean
  onToggleScenarioPlaythrough?: () => void
}

export type { GraphToolbarStatusRowProps } from './GraphToolbarStatusRow'
export type { GraphToolbarUndoRedoButtonsProps } from './GraphToolbarUndoRedoButtons'
