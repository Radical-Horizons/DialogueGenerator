/** Menu déroulant des outils qualité et validation (Story 17.9). */
import { GraphActionsDropdown } from './GraphActionsDropdown'
import type { GraphToolbarToolsRowProps } from './graphToolbarTypes'

export function GraphToolbarQualityDropdown(props: GraphToolbarToolsRowProps) {
  const {
    isNarrowToolbar: isNarrow,
    canEditGraph,
    chrome,
    chromeStyles,
    validationToolsDropdownRef,
    showValidationToolsDropdown,
    setShowValidationToolsDropdown,
    renderQualityMenuItems,
  } = props
  const { graphChromeTouch, graphChromeTouchNarrow, effectiveButtonPadding, effectiveButtonFontSizeRem } =
    chromeStyles

  return (
    <GraphActionsDropdown
      canEditGraph={canEditGraph}
      isNarrow={isNarrow}
      graphChromeTouch={isNarrow ? graphChromeTouchNarrow : graphChromeTouch}
      buttonPadding={isNarrow ? chrome.buttonPadding : effectiveButtonPadding}
      buttonFontSizeRem={isNarrow ? chrome.buttonFontSizeRem : effectiveButtonFontSizeRem}
      groupGapRem={chrome.groupGapRem}
      actionsDropdownRef={validationToolsDropdownRef}
      showActionsDropdown={showValidationToolsDropdown}
      setShowActionsDropdown={setShowValidationToolsDropdown}
      renderMenuItems={renderQualityMenuItems}
      dropdownLabel="Qualités"
      dropdownTestId="btn-quality-dropdown"
      dropdownTitle="Outils qualité et validation du dialogue"
    />
  )
}
