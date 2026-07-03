/**
 * Tests bouton playthrough toolbar + raccourci P.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GraphToolbarToolsGroup } from '../components/graph/GraphToolbarToolsRow'
import type { GraphToolbarToolsRowProps } from '../components/graph/GraphToolbarToolsRow'
import { graphToolbarChrome } from '../theme/responsiveChrome'

function buildMinimalToolsProps(
  overrides: Partial<GraphToolbarToolsRowProps> = {},
): GraphToolbarToolsRowProps {
  const chrome = graphToolbarChrome.comfortable
  return {
    mode: 'comfort-tools',
    isNarrowToolbar: false,
    chrome,
    chromeStyles: {
      graphChromeTouch: {},
      graphChromeTouchNarrow: {},
      effectiveButtonPadding: chrome.buttonPadding,
      effectiveButtonFontSizeRem: chrome.buttonFontSizeRem,
    },
    canEditGraph: true,
    hasActiveDialogue: true,
    isStandalone: false,
    canUndoNow: false,
    canRedoNow: false,
    undo: vi.fn(),
    redo: vi.fn(),
    showSearchBar: false,
    setShowSearchBar: vi.fn(),
    setHighlightedNodes: vi.fn(),
    showAutoLayoutDropdown: false,
    setShowAutoLayoutDropdown: vi.fn(),
    autoLayoutDropdownRef: { current: null },
    layoutDirection: 'TB',
    layoutSpacingMode: 'normal',
    setLayoutSpacingMode: vi.fn(),
    handleAutoLayout: vi.fn(),
    showActionsDropdown: false,
    setShowActionsDropdown: vi.fn(),
    actionsDropdownRef: { current: null },
    actionsDropdownBtnRef: { current: null },
    showValidationToolsDropdown: false,
    setShowValidationToolsDropdown: vi.fn(),
    validationToolsDropdownRef: { current: null },
    renderActionsMenuItems: () => null,
    renderQualityMenuItems: () => null,
    showShortcutsTooltip: false,
    setShowShortcutsTooltip: vi.fn(),
    selectedNodeId: null,
    scenarioPlaythroughActive: false,
    onToggleScenarioPlaythrough: vi.fn(),
    ...overrides,
  }
}

describe('GraphEditor playthrough toolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('affiche le bouton ▶ Jouer', () => {
    render(<GraphToolbarToolsGroup {...buildMinimalToolsProps()} />)
    expect(screen.getByTestId('btn-scenario-playthrough')).toBeInTheDocument()
    expect(screen.getByTestId('btn-scenario-playthrough')).toHaveTextContent('Jouer')
  })

  it('appelle onToggleScenarioPlaythrough au clic', () => {
    const onToggle = vi.fn()
    render(
      <GraphToolbarToolsGroup
        {...buildMinimalToolsProps({ onToggleScenarioPlaythrough: onToggle })}
      />,
    )
    screen.getByTestId('btn-scenario-playthrough').click()
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
