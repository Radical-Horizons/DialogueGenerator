/**
 * Overlay plein écran — mode Visual Novel playthrough scénario.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGraphStore } from '../../../store/graphStore'
import { useGraphViewStore } from '../../../store/graphViewStore'
import { useScenarioPlaythrough } from '../../../hooks/useScenarioPlaythrough'
import { useKeyboardShortcuts } from '../../../hooks/useKeyboardShortcuts'
import {
  computePlaythroughCoverage,
  resolvePlaythroughStep,
} from '../../../utils/scenarioPlaythroughEngine'
import { JumpToNodeModal } from '../JumpToNodeModal'
import { ScenarioPlaythroughTopBar } from './ScenarioPlaythroughTopBar'
import { ScenarioPlaythroughStage } from './ScenarioPlaythroughStage'
import { ScenarioPlaythroughChoices } from './ScenarioPlaythroughChoices'
import { ScenarioPlaythroughEndScreen } from './ScenarioPlaythroughEndScreen'
import { ScenarioPlaythroughDevDrawer } from './ScenarioPlaythroughDevDrawer'
import { PLAYTHROUGH_OVERLAY_Z_INDEX, playthroughChrome } from './playthroughChrome'
import { theme } from '../../../theme'

export interface ScenarioPlaythroughOverlayProps {
  dialogueTitle: string
  onExit: () => void
}

export function ScenarioPlaythroughOverlay({ dialogueTitle, onExit }: ScenarioPlaythroughOverlayProps) {
  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)
  const active = useGraphViewStore((s) => s.scenarioPlaythrough.active)
  const currentNodeId = useGraphViewStore((s) => s.scenarioPlaythrough.currentNodeId)
  const visitedNodeIds = useGraphViewStore((s) => s.scenarioPlaythrough.visitedNodeIds)
  const visitedChoiceKeys = useGraphViewStore((s) => s.scenarioPlaythrough.visitedChoiceKeys)
  const showDevDrawer = useGraphViewStore((s) => s.scenarioPlaythrough.showDevDrawer)
  const showGraphPeek = useGraphViewStore((s) => s.scenarioPlaythrough.showGraphPeek)
  const transientMessage = useGraphViewStore((s) => s.scenarioPlaythrough.transientMessage)
  const visibilityEvalState = useGraphViewStore((s) => s.visibilityEvalState)
  const previewGameSystemsState = useGraphViewStore((s) => s.previewGameSystemsState)
  const forcedSkillCheckIssue = useGraphViewStore((s) => s.scenarioPlaythrough.forcedSkillCheckIssue)
  const catalogById = useGraphViewStore((s) => s.previewCatalogById)
  const toggleDevDrawer = useGraphViewStore((s) => s.togglePlaythroughDevDrawer)
  const toggleGraphPeek = useGraphViewStore((s) => s.togglePlaythroughGraphPeek)

  const {
    selectChoice,
    continueLinear,
    goBack,
    jumpToNode,
    resetScenarioPlaythrough,
    exitScenarioPlaythrough,
  } = useScenarioPlaythrough()

  const [showJumpModal, setShowJumpModal] = useState(false)
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  const runtimeCtx = useMemo(
    () => ({
      evalState: visibilityEvalState,
      gameSystemsState: previewGameSystemsState,
      visitedChoiceKeys,
      forcedSkillCheckIssue,
      catalogById,
    }),
    [
      visibilityEvalState,
      previewGameSystemsState,
      visitedChoiceKeys,
      forcedSkillCheckIssue,
      catalogById,
    ],
  )

  const step = useMemo(() => {
    if (!currentNodeId) return null
    return resolvePlaythroughStep(currentNodeId, { nodes, edges }, runtimeCtx)
  }, [currentNodeId, nodes, edges, runtimeCtx])

  const coverage = useMemo(
    () =>
      computePlaythroughCoverage(
        { nodes, edges },
        visibilityEvalState,
        visitedNodeIds,
        visitedChoiceKeys,
      ),
    [nodes, edges, visibilityEvalState, visitedNodeIds, visitedChoiceKeys],
  )

  const selectableChoiceIndices = useMemo(
    () => (step?.choices ?? []).filter((c) => c.selectable).map((c) => c.index),
    [step?.choices],
  )

  const handleExit = useCallback(() => {
    if (
      coverage.visitedNodeCount > 1 &&
      !window.confirm('Quitter le mode jeu ? La progression de test ne sera pas sauvegardée.')
    ) {
      return
    }
    exitScenarioPlaythrough()
    onExit()
  }, [coverage.visitedNodeCount, exitScenarioPlaythrough, onExit])

  const handleReset = useCallback(() => {
    if (window.confirm('Rejouer depuis le début ?')) {
      resetScenarioPlaythrough()
    }
  }, [resetScenarioPlaythrough])

  useEffect(() => {
    if (!active || showGraphPeek) return
    overlayRef.current?.focus()
  }, [active, showGraphPeek, currentNodeId])

  useEffect(() => {
    if (!active || !currentNodeId) return
    if (step?.kind === 'test' && step.autoAdvanceTarget) {
      const timer = window.setTimeout(() => {
        jumpToNode(step.autoAdvanceTarget!)
      }, 600)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [active, currentNodeId, step, jumpToNode])

  useKeyboardShortcuts(
    [
      {
        key: '1',
        handler: () => {
          if (selectableChoiceIndices.includes(0)) selectChoice(0)
        },
        description: 'Choisir option 1',
        enabled: active && !showGraphPeek && selectableChoiceIndices.includes(0),
        preventDefault: true,
      },
      {
        key: '2',
        handler: () => {
          if (selectableChoiceIndices.includes(1)) selectChoice(1)
        },
        description: 'Choisir option 2',
        enabled: active && !showGraphPeek && selectableChoiceIndices.includes(1),
        preventDefault: true,
      },
      {
        key: '3',
        handler: () => {
          if (selectableChoiceIndices.includes(2)) selectChoice(2)
        },
        description: 'Choisir option 3',
        enabled: active && !showGraphPeek && selectableChoiceIndices.includes(2),
        preventDefault: true,
      },
      {
        key: '4',
        handler: () => {
          if (selectableChoiceIndices.includes(3)) selectChoice(3)
        },
        description: 'Choisir option 4',
        enabled: active && !showGraphPeek && selectableChoiceIndices.includes(3),
        preventDefault: true,
      },
      {
        key: 'enter',
        handler: () => continueLinear(),
        description: 'Continuer',
        enabled: active && !showGraphPeek && Boolean(step?.continueTarget),
        preventDefault: true,
      },
      {
        key: 'space',
        handler: () => continueLinear(),
        description: 'Continuer',
        enabled: active && !showGraphPeek && Boolean(step?.continueTarget),
        preventDefault: true,
      },
      {
        key: 'backspace',
        handler: () => goBack(),
        description: 'Retour arrière',
        enabled: active && !showGraphPeek,
        preventDefault: true,
      },
      {
        key: 'alt+arrowleft',
        handler: () => goBack(),
        description: 'Retour arrière',
        enabled: active && !showGraphPeek,
        preventDefault: true,
      },
      {
        key: 'r',
        handler: () => handleReset(),
        description: 'Rejouer',
        enabled: active && !showGraphPeek,
        preventDefault: true,
      },
      {
        key: 'd',
        handler: () => toggleDevDrawer(),
        description: 'Tiroir dev',
        enabled: active && !showGraphPeek,
        preventDefault: true,
      },
      {
        key: 'g',
        handler: () => toggleGraphPeek(),
        description: 'Voir graphe',
        enabled: active,
        preventDefault: true,
      },
      {
        key: 'j',
        handler: () => setShowJumpModal(true),
        description: 'Aller au nœud',
        enabled: active && !showGraphPeek,
        preventDefault: true,
      },
      {
        key: '?',
        handler: () => setShowShortcutsHelp((v) => !v),
        description: 'Aide raccourcis',
        enabled: active && !showGraphPeek,
        preventDefault: true,
      },
      {
        key: 'escape',
        handler: () => {
          if (showJumpModal) {
            setShowJumpModal(false)
            return
          }
          if (showDevDrawer) {
            toggleDevDrawer()
            return
          }
          handleExit()
        },
        description: 'Quitter',
        enabled: active,
        preventDefault: true,
      },
    ],
    [
      active,
      showGraphPeek,
      selectableChoiceIndices,
      step?.continueTarget,
      showJumpModal,
      showDevDrawer,
      selectChoice,
      continueLinear,
      goBack,
      handleReset,
      toggleDevDrawer,
      toggleGraphPeek,
      handleExit,
    ],
  )

  if (!active) return null

  if (showGraphPeek) {
    return (
      <div
        data-testid="playthrough-graph-peek-bar"
        style={{
          position: 'fixed',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: PLAYTHROUGH_OVERLAY_Z_INDEX,
          display: 'flex',
          gap: 8,
        }}
      >
        <button
          type="button"
          data-testid="playthrough-return-to-game"
          onClick={() => toggleGraphPeek()}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: `2px solid ${playthroughChrome.choiceAccent}`,
            background: theme.button.primary.background,
            color: theme.button.primary.color,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          }}
        >
          ← Retour au jeu
        </button>
      </div>
    )
  }

  const content = (
    <div
      ref={overlayRef}
      data-testid="scenario-playthrough-overlay"
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Preview scénario — mode jeu"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: PLAYTHROUGH_OVERLAY_Z_INDEX,
        display: 'flex',
        flexDirection: 'column',
        background: playthroughChrome.overlayBackground,
        outline: 'none',
      }}
    >
      <ScenarioPlaythroughTopBar
        dialogueTitle={dialogueTitle}
        coverage={coverage}
        showDevDrawer={showDevDrawer}
        showGraphPeek={showGraphPeek}
        onToggleDev={() => toggleDevDrawer()}
        onToggleGraph={() => toggleGraphPeek()}
        onReset={handleReset}
        onExit={handleExit}
      />

      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            marginRight: showDevDrawer ? 'min(380px, 30vw)' : 0,
            transition: 'margin-right 0.2s ease',
          }}
        >
          {step?.kind === 'end' ? (
            <ScenarioPlaythroughEndScreen
              coverage={coverage}
              onReplay={handleReset}
              onExit={handleExit}
            />
          ) : (
            <>
              <ScenarioPlaythroughStage step={step} transientMessage={transientMessage} />
              <ScenarioPlaythroughChoices
                choices={step?.choices ?? []}
                continueTarget={step?.continueTarget}
                onSelectChoice={selectChoice}
                onContinue={continueLinear}
              />
            </>
          )}
        </div>

        <ScenarioPlaythroughDevDrawer
          open={showDevDrawer}
          onClose={() => toggleDevDrawer()}
        />
      </div>

      {showShortcutsHelp ? (
        <div
          data-testid="playthrough-shortcuts-help"
          style={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            padding: '12px 14px',
            borderRadius: 8,
            backgroundColor: theme.background.panel,
            border: `1px solid ${theme.border.primary}`,
            fontSize: '0.78rem',
            color: theme.text.secondary,
            maxWidth: 280,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6, color: theme.text.primary }}>Raccourcis</div>
          <div>1–4 : choix · Entrée : continuer</div>
          <div>Retour arrière · R : reset · D : dev</div>
          <div>G : graphe · J : jump · ? : aide · Échap : quitter</div>
        </div>
      ) : null}

      <JumpToNodeModal
        isOpen={showJumpModal}
        onClose={() => setShowJumpModal(false)}
        onSelectNodeId={(nodeId) => {
          jumpToNode(nodeId)
          setShowJumpModal(false)
        }}
      />
    </div>
  )

  return createPortal(content, document.body)
}
