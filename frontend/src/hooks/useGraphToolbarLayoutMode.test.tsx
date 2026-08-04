import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import {
  GRAPH_TOOLBAR_SINGLE_ROW_MIN_WIDTH_PX,
  graphToolbarChrome,
} from '../theme/responsiveChrome'
import * as narrowHook from './useNarrowInlineSize'
import {
  buildGraphToolbarRootStyle,
  useGraphToolbarLayoutMode,
} from './useGraphToolbarLayoutMode'

function LayoutHost({
  parentWidthPx,
  showSearchBar = false,
}: {
  parentWidthPx: number
  showSearchBar?: boolean
}) {
  const { toolbarRef, isNarrow, chrome, chromeStyles, rootLayout } =
    useGraphToolbarLayoutMode({ showSearchBar })

  return (
    <div style={{ width: `${parentWidthPx}px` }} data-testid="parent">
      <div
        ref={toolbarRef}
        data-testid="toolbar"
        data-narrow={String(isNarrow)}
        data-chrome={chrome === graphToolbarChrome.narrow ? 'narrow' : 'comfortable'}
        data-areas={rootLayout.gridTemplateAreas ?? 'none'}
        data-display={rootLayout.display}
        data-touch-min={String(chromeStyles.graphChromeTouchNarrow.minHeight)}
        data-button-padding={chromeStyles.effectiveButtonPadding}
        data-button-font={String(chromeStyles.effectiveButtonFontSizeRem)}
      />
    </div>
  )
}

describe('useGraphToolbarLayoutMode', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('appelle useNarrowInlineSize avec le seuil rangée unique 2e et measureParentClientWidth', () => {
    const spy = vi.spyOn(narrowHook, 'useNarrowInlineSize').mockReturnValue({
      ref: () => {},
      isNarrow: false,
    })
    render(<LayoutHost parentWidthPx={1100} />)
    expect(spy).toHaveBeenCalledWith(GRAPH_TOOLBAR_SINGLE_ROW_MIN_WIDTH_PX, {
      measureParentClientWidth: true,
    })
  })

  it('400px parent → isNarrow true, chrome narrow, touch 32px en narrow', () => {
    render(<LayoutHost parentWidthPx={400} />)
    const toolbar = screen.getByTestId('toolbar')
    expect(toolbar).toHaveAttribute('data-narrow', 'true')
    expect(toolbar).toHaveAttribute('data-chrome', 'narrow')
    expect(toolbar).toHaveAttribute('data-touch-min', '32')
    expect(toolbar.dataset.buttonPadding).toBe(graphToolbarChrome.narrow.buttonPadding)
    expect(Number(toolbar.dataset.buttonFont)).toBe(graphToolbarChrome.narrow.buttonFontSizeRem)
  })

  it('1100px parent → isNarrow false, chrome comfortable', () => {
    render(<LayoutHost parentWidthPx={1100} />)
    const toolbar = screen.getByTestId('toolbar')
    expect(toolbar).toHaveAttribute('data-narrow', 'false')
    expect(toolbar).toHaveAttribute('data-chrome', 'comfortable')
    expect(toolbar).toHaveAttribute('data-touch-min', '44')
    expect(toolbar.dataset.buttonPadding).toBe(graphToolbarChrome.comfortable.buttonPadding)
    expect(Number(toolbar.dataset.buttonFont)).toBe(
      graphToolbarChrome.comfortable.buttonFontSizeRem
    )
  })

  it(`seuil = GRAPH_TOOLBAR_SINGLE_ROW_MIN_WIDTH_PX (${GRAPH_TOOLBAR_SINGLE_ROW_MIN_WIDTH_PX})`, () => {
    expect(GRAPH_TOOLBAR_SINGLE_ROW_MIN_WIDTH_PX).toBe(980)
    render(<LayoutHost parentWidthPx={979} />)
    expect(screen.getByTestId('toolbar')).toHaveAttribute('data-narrow', 'true')
    cleanup()
    render(<LayoutHost parentWidthPx={980} />)
    expect(screen.getByTestId('toolbar')).toHaveAttribute('data-narrow', 'false')
  })

  it('rootLayout.gridTemplateAreas inclut search quand showSearchBar true en narrow', () => {
    render(<LayoutHost parentWidthPx={400} showSearchBar />)
    expect(screen.getByTestId('toolbar')).toHaveAttribute(
      'data-areas',
      '"header" "tools" "search"'
    )
  })

  it('rootLayout.gridTemplateAreas sans search → header + tools uniquement en narrow', () => {
    render(<LayoutHost parentWidthPx={400} showSearchBar={false} />)
    expect(screen.getByTestId('toolbar')).toHaveAttribute('data-areas', '"header" "tools"')
  })

  it('rootLayout confort → display flex, pas de gridTemplateAreas', () => {
    render(<LayoutHost parentWidthPx={1100} showSearchBar />)
    const toolbar = screen.getByTestId('toolbar')
    expect(toolbar).toHaveAttribute('data-display', 'flex')
    expect(toolbar).toHaveAttribute('data-areas', 'none')
  })
})

describe('buildGraphToolbarRootStyle', () => {
  it('applique flex nowrap et justify flex-end en confort', () => {
    const rootLayout = {
      display: 'flex' as const,
      alignItems: 'center' as const,
      justifyContent: 'flex-end' as const,
      flexWrap: 'nowrap' as const,
    }
    const style = buildGraphToolbarRootStyle(false, graphToolbarChrome.comfortable, rootLayout)
    expect(style.display).toBe('flex')
    expect(style.flexWrap).toBe('nowrap')
    expect(style.justifyContent).toBe('flex-end')
    expect(style.gridTemplateAreas).toBeUndefined()
  })

  it('applique grid et gridTemplateAreas en narrow', () => {
    const rootLayout = {
      display: 'grid' as const,
      gridTemplateAreas: '"header" "tools" "search"',
      gridTemplateColumns: 'minmax(0, 1fr)',
      alignItems: 'stretch' as const,
    }
    const style = buildGraphToolbarRootStyle(true, graphToolbarChrome.narrow, rootLayout)
    expect(style.display).toBe('grid')
    expect(style.gridTemplateAreas).toBe('"header" "tools" "search"')
    expect(style.gridTemplateColumns).toBe('minmax(0, 1fr)')
    expect(style.flexWrap).toBeUndefined()
  })
})
