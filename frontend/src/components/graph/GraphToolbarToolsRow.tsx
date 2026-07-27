/**
 * Rangée outils du graphe : compose les sous-composants toolbar (Story 17.9).
 */
import { theme } from '../../theme'
import { GraphActionsDropdown } from './GraphActionsDropdown'
import { GraphToolbarUndoRedoButtons } from './GraphToolbarUndoRedoButtons'
import { GraphToolbarPlaythroughButton } from './GraphToolbarPlaythroughButton'
import { GraphToolbarFocusNodeButton } from './GraphToolbarFocusNodeButton'
import { GraphToolbarShortcutsButton } from './GraphToolbarShortcutsButton'
import { GraphToolbarLayoutDropdown } from './GraphToolbarLayoutDropdown'
import { GraphToolbarQualityDropdown } from './GraphToolbarQualityDropdown'
import type { GraphToolbarToolsRowProps } from './graphToolbarTypes'

export type { GraphToolbarToolsRowProps } from './graphToolbarTypes'

/** Groupe layout + dropdowns + raccourcis (confort ou embarqué narrow status row). */
export function GraphToolbarToolsGroup(props: GraphToolbarToolsRowProps) {
  const {
    isNarrowToolbar,
    chrome,
    chromeStyles,
    canEditGraph,
    showActionsDropdown,
    setShowActionsDropdown,
    actionsDropdownRef,
    actionsDropdownBtnRef,
    renderActionsMenuItems,
    showShortcutsTooltip,
    setShowShortcutsTooltip,
    selectedNodeId,
    hasActiveDialogue,
  } = props
  const { graphChromeTouch, effectiveButtonPadding, effectiveButtonFontSizeRem } = chromeStyles
  const actionsMenuEnabled = props.canOpenGraphActions ?? canEditGraph

  return (
    <>
      <GraphToolbarPlaythroughButton
        isNarrowToolbar={isNarrowToolbar}
        chromeStyles={chromeStyles}
        hasActiveDialogue={hasActiveDialogue}
        active={Boolean(props.scenarioPlaythroughActive)}
        onToggle={props.onToggleScenarioPlaythrough}
      />
      <GraphToolbarLayoutDropdown {...props} />
      <GraphToolbarFocusNodeButton
        isNarrowToolbar={isNarrowToolbar}
        chromeStyles={chromeStyles}
        selectedNodeId={selectedNodeId}
        hasActiveDialogue={hasActiveDialogue}
      />
      {!isNarrowToolbar && (
        <GraphActionsDropdown
          canEditGraph={canEditGraph}
          menuEnabled={actionsMenuEnabled}
          isNarrow={false}
          graphChromeTouch={graphChromeTouch}
          buttonPadding={effectiveButtonPadding}
          buttonFontSizeRem={effectiveButtonFontSizeRem}
          groupGapRem={chrome.groupGapRem}
          actionsDropdownRef={actionsDropdownRef}
          actionsDropdownBtnRef={actionsDropdownBtnRef}
          showActionsDropdown={showActionsDropdown}
          setShowActionsDropdown={setShowActionsDropdown}
          renderMenuItems={renderActionsMenuItems}
        />
      )}
      {!isNarrowToolbar && <GraphToolbarQualityDropdown {...props} />}
      <GraphToolbarShortcutsButton
        isNarrowToolbar={isNarrowToolbar}
        chrome={chrome}
        chromeStyles={chromeStyles}
        showShortcutsTooltip={showShortcutsTooltip}
        setShowShortcutsTooltip={setShowShortcutsTooltip}
      />
    </>
  )
}

/** Rangée actions narrow ou groupe outils confort. */
export function GraphToolbarToolsRow(props: GraphToolbarToolsRowProps) {
  const {
    mode,
    chrome,
    chromeStyles,
    canEditGraph,
    hasActiveDialogue,
    isStandalone,
    onBack,
    canUndoNow,
    canRedoNow,
    undo,
    redo,
    showSearchBar,
    setShowSearchBar,
    setHighlightedNodes,
    showActionsDropdown,
    setShowActionsDropdown,
    actionsDropdownRef,
    actionsDropdownBtnRef,
    renderActionsMenuItems,
  } = props
  const { graphChromeTouchNarrow } = chromeStyles

  if (mode === 'narrow-actions') {
    return (
      <div
        data-testid="graph-toolbar-row-actions"
        style={{
          display: 'flex',
          gap: `${chrome.groupGapRem}rem`,
          alignItems: 'center',
          justifyContent: 'flex-start',
          flexWrap: 'wrap',
          minWidth: 0,
        }}
      >
        {isStandalone && onBack && (
          <button
            type="button"
            onClick={onBack}
            style={{
              ...graphChromeTouchNarrow,
              padding: chrome.buttonPadding,
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '6px',
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              cursor: 'pointer',
              fontSize: `${chrome.buttonFontSizeRem}rem`,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
            aria-label="Retour"
            title="Retour"
          >
            <span aria-hidden>←</span>
            Retour
          </button>
        )}
        {canEditGraph && (
          <GraphToolbarUndoRedoButtons
            variant="narrow-labeled"
            chrome={chrome}
            chromeStyles={chromeStyles}
            canUndoNow={canUndoNow}
            canRedoNow={canRedoNow}
            undo={undo}
            redo={redo}
          />
        )}
        {!showSearchBar && (
          <button
            type="button"
            data-testid="btn-search-graph"
            onClick={() =>
              setShowSearchBar((v) => {
                if (v) setHighlightedNodes([])
                return !v
              })
            }
            disabled={!hasActiveDialogue}
            style={{
              ...graphChromeTouchNarrow,
              padding: chrome.buttonPadding,
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '6px',
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              cursor: !hasActiveDialogue ? 'not-allowed' : 'pointer',
              opacity: !hasActiveDialogue ? 0.6 : 1,
              fontSize: `${chrome.buttonFontSizeRem}rem`,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
            title="Rechercher dans le graphe (Ctrl+F)"
            aria-label="Rechercher"
          >
            <span aria-hidden>🔍</span>
            Recherche
          </button>
        )}
        <GraphToolbarPlaythroughButton
          isNarrowToolbar
          chromeStyles={chromeStyles}
          hasActiveDialogue={hasActiveDialogue}
          active={Boolean(props.scenarioPlaythroughActive)}
          onToggle={props.onToggleScenarioPlaythrough}
        />
        <GraphToolbarFocusNodeButton
          isNarrowToolbar
          chromeStyles={chromeStyles}
          selectedNodeId={props.selectedNodeId}
          hasActiveDialogue={hasActiveDialogue}
        />
        <GraphActionsDropdown
          canEditGraph={canEditGraph}
          menuEnabled={props.canOpenGraphActions ?? canEditGraph}
          isNarrow={false}
          graphChromeTouch={graphChromeTouchNarrow}
          buttonPadding={chrome.buttonPadding}
          buttonFontSizeRem={chrome.buttonFontSizeRem}
          groupGapRem={chrome.groupGapRem}
          actionsDropdownRef={actionsDropdownRef}
          actionsDropdownBtnRef={actionsDropdownBtnRef}
          showActionsDropdown={showActionsDropdown}
          setShowActionsDropdown={setShowActionsDropdown}
          renderMenuItems={renderActionsMenuItems}
        />
        <GraphToolbarQualityDropdown {...props} />
      </div>
    )
  }

  return <GraphToolbarToolsGroup {...props} />
}
