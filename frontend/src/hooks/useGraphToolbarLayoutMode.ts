import type { CSSProperties, RefCallback } from 'react'
import { theme } from '../theme'
import { redesignHairline } from '../theme/redesignTokens'
import type {
  GraphToolbarChromeStyles,
  GraphToolbarChromeTokens,
} from '../components/graph/graphToolbarTypes'
import { useNarrowInlineSize } from './useNarrowInlineSize'
import {
  GRAPH_TOOLBAR_SINGLE_ROW_MIN_WIDTH_PX,
  graphToolbarChrome,
} from '../theme/responsiveChrome'

export type UseGraphToolbarLayoutModeOptions = {
  showSearchBar?: boolean
}

export type GraphToolbarRootLayout = {
  display: 'grid' | 'flex'
  gridTemplateAreas?: string
  gridTemplateColumns?: string
  flexWrap?: 'nowrap'
  alignItems: 'stretch' | 'center'
  justifyContent?: 'flex-end'
}

export interface UseGraphToolbarLayoutModeReturn {
  toolbarRef: RefCallback<HTMLDivElement>
  isNarrow: boolean
  chrome: GraphToolbarChromeTokens
  chromeStyles: GraphToolbarChromeStyles
  rootLayout: GraphToolbarRootLayout
}

function buildChromeStyles(
  isNarrow: boolean,
  chrome: GraphToolbarChromeTokens
): GraphToolbarChromeStyles {
  return {
    graphChromeTouch: {
      minWidth: chrome.touchMinPx,
      minHeight: chrome.touchMinPx,
      boxSizing: 'border-box',
    },
    graphChromeTouchNarrow: isNarrow
      ? {
          minWidth: 32,
          minHeight: 32,
          boxSizing: 'border-box',
        }
      : {
          minWidth: chrome.touchMinPx,
          minHeight: chrome.touchMinPx,
          boxSizing: 'border-box',
        },
    effectiveButtonPadding: chrome.buttonPadding,
    effectiveButtonFontSizeRem: chrome.buttonFontSizeRem,
  }
}

function buildRootLayout(isNarrow: boolean, showSearchBar: boolean): GraphToolbarRootLayout {
  if (!isNarrow) {
    return {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      flexWrap: 'nowrap',
    }
  }
  return {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gridTemplateAreas: showSearchBar ? '"header" "tools" "search"' : '"header" "tools"',
    alignItems: 'stretch',
  }
}

/** Styles racine du conteneur `data-testid="graph-editor-toolbar"`. */
export function buildGraphToolbarRootStyle(
  isNarrow: boolean,
  chrome: GraphToolbarChromeTokens,
  rootLayout: GraphToolbarRootLayout
): CSSProperties {
  return {
    flexShrink: 0,
    // Écran 2e (confort) : une rangée de 46px, filet hairline, gaps 14px.
    padding: isNarrow ? chrome.containerPadding : '0 18px',
    minHeight: isNarrow ? undefined : 46,
    borderBottom: `1px solid ${isNarrow ? theme.border.primary : redesignHairline.standard}`,
    backgroundColor: theme.background.panelHeader,
    display: rootLayout.display,
    gridTemplateColumns: rootLayout.gridTemplateColumns,
    gridTemplateAreas: rootLayout.gridTemplateAreas,
    gap: isNarrow ? `${chrome.containerGapRem}rem` : 14,
    rowGap: isNarrow ? `${chrome.containerGapRem}rem` : undefined,
    alignItems: rootLayout.alignItems,
    justifyContent: rootLayout.justifyContent,
    flexWrap: rootLayout.flexWrap,
    width: '100%',
    minWidth: 0,
  }
}

/**
 * Bascule layout narrow / confort (640px conteneur parent) pour la toolbar graphe.
 * Story 17.10 — extraction depuis GraphEditorHeader.
 */
export function useGraphToolbarLayoutMode(
  options?: UseGraphToolbarLayoutModeOptions
): UseGraphToolbarLayoutModeReturn {
  const showSearchBar = options?.showSearchBar ?? false
  const { ref: toolbarRef, isNarrow } = useNarrowInlineSize(
    GRAPH_TOOLBAR_SINGLE_ROW_MIN_WIDTH_PX,
    { measureParentClientWidth: true }
  )
  const chrome = isNarrow ? graphToolbarChrome.narrow : graphToolbarChrome.comfortable
  const chromeStyles = buildChromeStyles(isNarrow, chrome)
  const rootLayout = buildRootLayout(isNarrow, showSearchBar)

  return {
    toolbarRef,
    isNarrow,
    chrome,
    chromeStyles,
    rootLayout,
  }
}

/** Alias legacy (slug sprint « tri-state » — layout binaire uniquement). */
export const useGraphToolbarTriState = useGraphToolbarLayoutMode
