/**
 * Tests playthrough state dans graphViewStore.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { Node } from 'reactflow'
import { useGraphViewStore } from '../store/graphViewStore'

function reset() {
  useGraphViewStore.setState({
    dialoguePreviewActive: false,
    previewEffectHistory: [],
    visibilityEvalState: { flags: {}, reputation: {} },
    scenarioPlaythrough: {
      active: false,
      currentNodeId: null,
      history: [],
      visitedNodeIds: {},
      visitedChoiceKeys: {},
      forcedSkillCheckIssue: null,
      showDevDrawer: false,
      showGraphPeek: false,
      transientMessage: null,
    },
  })
}

describe('graphViewStore playthrough', () => {
  beforeEach(() => reset())

  it('enterScenarioPlaythrough positionne START et active le mode', () => {
    const nodes: Node[] = [
      {
        id: 'START',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'START', line: 'Hello' },
      },
    ]
    useGraphViewStore.getState().enterScenarioPlaythrough({ flags: {}, reputation: {} }, nodes, [])
    const s = useGraphViewStore.getState()
    expect(s.dialoguePreviewActive).toBe(true)
    expect(s.scenarioPlaythrough.active).toBe(true)
    expect(s.scenarioPlaythrough.currentNodeId).toBe('START')
    expect(s.scenarioPlaythrough.visitedNodeIds.START).toBe(true)
  })

  it('exitScenarioPlaythrough réinitialise tout', () => {
    const nodes: Node[] = [
      {
        id: 'START',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'START' },
      },
    ]
    useGraphViewStore.getState().enterScenarioPlaythrough({ flags: { x: true }, reputation: {} }, nodes, [])
    useGraphViewStore.getState().exitScenarioPlaythrough()
    const s = useGraphViewStore.getState()
    expect(s.scenarioPlaythrough.active).toBe(false)
    expect(s.visibilityEvalState.flags).toEqual({})
  })

  it('consumePreviewEffort décrémente le pool', () => {
    useGraphViewStore.getState().consumePreviewEffort(3)
    expect(useGraphViewStore.getState().previewGameSystemsState.effortPool).toBe(7)
  })
})
