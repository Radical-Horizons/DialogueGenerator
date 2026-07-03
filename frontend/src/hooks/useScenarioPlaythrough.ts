/**
 * Hook d'orchestration du mode playthrough Visual Novel.
 */
import { useCallback } from 'react'
import { useGraphStore } from '../store/graphStore'
import { useGraphViewStore } from '../store/graphViewStore'
import type { VisibilityEvalState } from '../types/visibilityConditions'
import { collectKeysFromGraphNodes } from '../utils/collectPreviewKeys'
import {
  applyPlaythroughChoice,
  createPlaythroughSnapshot,
  resolvePlaythroughStep,
} from '../utils/scenarioPlaythroughEngine'

function buildInitialEvalState(
  bindings: Array<{ flagId: string; initialValue: boolean | number | string }>,
  nodes: Parameters<typeof collectKeysFromGraphNodes>[0],
): VisibilityEvalState {
  const flags: VisibilityEvalState['flags'] = {}
  for (const b of bindings) {
    flags[b.flagId] = b.initialValue
  }
  const { flagIds, reputationKeys } = collectKeysFromGraphNodes(nodes)
  for (const fid of flagIds) {
    if (flags[fid] === undefined) flags[fid] = false
  }
  const reputation: VisibilityEvalState['reputation'] = {}
  for (const key of reputationKeys) {
    reputation[key] = 0
  }
  return { flags, reputation }
}

export interface UseScenarioPlaythroughResult {
  enterScenarioPlaythrough: () => void
  exitScenarioPlaythrough: () => void
  resetScenarioPlaythrough: () => void
  selectChoice: (choiceIndex: number) => void
  continueLinear: () => void
  goBack: () => void
  jumpToNode: (nodeId: string) => void
}

/**
 * Actions de navigation playthrough (VN mode).
 */
export function useScenarioPlaythrough(): UseScenarioPlaythroughResult {
  const dialogueFlagBindings = useGraphStore((s) => s.dialogueFlagBindings)
  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)

  const enterScenarioPlaythrough = useCallback(() => {
    const initial = buildInitialEvalState(dialogueFlagBindings, nodes)
    useGraphViewStore.getState().enterScenarioPlaythrough(initial, nodes, edges)
  }, [dialogueFlagBindings, nodes, edges])

  const exitScenarioPlaythrough = useCallback(() => {
    useGraphViewStore.getState().exitScenarioPlaythrough()
  }, [])

  const resetScenarioPlaythrough = useCallback(() => {
    const initial = buildInitialEvalState(dialogueFlagBindings, nodes)
    useGraphViewStore.getState().enterScenarioPlaythrough(initial, nodes, edges)
  }, [dialogueFlagBindings, nodes, edges])

  const navigateToNode = useCallback(
    (nextNodeId: string | null, skillMessage?: string) => {
      if (!nextNodeId) return
      const store = useGraphViewStore.getState()
      store.markPlaythroughVisitedNode(nextNodeId)
      store.setPlaythroughCurrentNode(nextNodeId)
      store.focusNode(nextNodeId)
      if (skillMessage) {
        store.setPlaythroughTransientMessage(skillMessage)
        window.setTimeout(() => {
          useGraphViewStore.getState().setPlaythroughTransientMessage(null)
        }, 1800)
      }
      const step = resolvePlaythroughStep(
        nextNodeId,
        { nodes, edges },
        {
          evalState: store.visibilityEvalState,
          gameSystemsState: store.previewGameSystemsState,
          visitedChoiceKeys: store.scenarioPlaythrough.visitedChoiceKeys,
          forcedSkillCheckIssue: store.scenarioPlaythrough.forcedSkillCheckIssue,
          catalogById: store.previewCatalogById,
        },
      )
      if (step?.kind === 'test' && step.autoAdvanceTarget) {
        window.setTimeout(() => {
          navigateToNode(step.autoAdvanceTarget ?? null, step.testSummary)
        }, skillMessage ? 1200 : 400)
      }
    },
    [nodes, edges],
  )

  const selectChoice = useCallback(
    (choiceIndex: number) => {
      const store = useGraphViewStore.getState()
      const nodeId = store.scenarioPlaythrough.currentNodeId
      if (!nodeId) return

      const snapshot = createPlaythroughSnapshot(
        store.visibilityEvalState,
        store.previewGameSystemsState,
        store.previewEffectHistory,
      )
      store.pushPlaythroughHistory({ nodeId, snapshot })

      const result = applyPlaythroughChoice(
        nodeId,
        choiceIndex,
        { nodes, edges },
        store.visibilityEvalState,
        store.previewGameSystemsState,
        store.previewCatalogById,
        store.scenarioPlaythrough.forcedSkillCheckIssue,
      )

      if ('error' in result) {
        store.popPlaythroughHistory()
        store.appendPreviewEffectHistory([result.error])
        return
      }

      useGraphViewStore.setState({
        visibilityEvalState: result.nextEvalState,
        previewGameSystemsState: result.nextGameSystemsState,
        previewEffectHistory: [
          ...store.previewEffectHistory,
          ...result.effectLines,
        ],
      })
      store.markPlaythroughVisitedChoice(result.choiceKey)
      navigateToNode(result.nextNodeId, result.skillMessage)
    },
    [nodes, edges, navigateToNode],
  )

  const continueLinear = useCallback(() => {
    const store = useGraphViewStore.getState()
    const nodeId = store.scenarioPlaythrough.currentNodeId
    if (!nodeId) return
    const step = resolvePlaythroughStep(
      nodeId,
      { nodes, edges },
      {
        evalState: store.visibilityEvalState,
        gameSystemsState: store.previewGameSystemsState,
        visitedChoiceKeys: store.scenarioPlaythrough.visitedChoiceKeys,
        forcedSkillCheckIssue: store.scenarioPlaythrough.forcedSkillCheckIssue,
        catalogById: store.previewCatalogById,
      },
    )
    if (!step?.continueTarget) return

    const snapshot = createPlaythroughSnapshot(
      store.visibilityEvalState,
      store.previewGameSystemsState,
      store.previewEffectHistory,
    )
    store.pushPlaythroughHistory({ nodeId, snapshot })
    navigateToNode(step.continueTarget)
  }, [nodes, edges, navigateToNode])

  const goBack = useCallback(() => {
    const store = useGraphViewStore.getState()
    const entry = store.popPlaythroughHistory()
    if (!entry) return
    store.restorePlaythroughSnapshot(entry.snapshot)
    store.setPlaythroughCurrentNode(entry.nodeId)
    store.focusNode(entry.nodeId)
  }, [])

  const jumpToNode = useCallback(
    (targetId: string) => {
      const store = useGraphViewStore.getState()
      const currentId = store.scenarioPlaythrough.currentNodeId
      if (currentId) {
        const snapshot = createPlaythroughSnapshot(
          store.visibilityEvalState,
          store.previewGameSystemsState,
          store.previewEffectHistory,
        )
        store.pushPlaythroughHistory({ nodeId: currentId, snapshot })
      }
      navigateToNode(targetId)
    },
    [navigateToNode],
  )

  return {
    enterScenarioPlaythrough,
    exitScenarioPlaythrough,
    resetScenarioPlaythrough,
    selectChoice,
    continueLinear,
    goBack,
    jumpToNode,
  }
}
