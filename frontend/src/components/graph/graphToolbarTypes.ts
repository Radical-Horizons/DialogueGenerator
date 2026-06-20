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

export type { GraphToolbarToolsRowProps } from './GraphToolbarToolsRow'
export type { GraphToolbarStatusRowProps } from './GraphToolbarStatusRow'
export type { GraphToolbarUndoRedoButtonsProps } from './GraphToolbarUndoRedoButtons'
