/**
 * Tests unitaires pour graphViewStore — contrôleur de vue du graphe.
 * Vérifie chaque commande : focus, fitView, edge-label-edit, context menu,
 * prompt viewer, AI generation, flush protocol, dialogue deleted.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useGraphViewStore } from '../store/graphViewStore'

function reset() {
  useGraphViewStore.setState({
    reactFlowInstance: null,
    focusQueue: [],
    pendingFitView: false,
    pendingFitViewNodeIds: null,
    edgeLabelEditRequest: null,
    contextMenuRequest: null,
    promptViewerNodeId: null,
    aiGenerationNodeId: null,
    flushRequested: false,
    flushCompleted: false,
    saveRequested: false,
    dialogueDeleted: null,
    visibilityEvalState: { flags: {}, reputation: {} },
    dialoguePreviewActive: false,
    previewEffectHistory: [],
    previewCatalogById: undefined,
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

describe('graphViewStore', () => {
  beforeEach(() => reset())

  describe('focusNode / focusQueue / clearFocus', () => {
    it('enqueue plusieurs focus sans écraser (FIFO)', () => {
      expect(useGraphViewStore.getState().focusQueue).toEqual([])
      useGraphViewStore.getState().focusNode('a')
      useGraphViewStore.getState().focusNode('b')
      expect(useGraphViewStore.getState().focusQueue).toEqual(['a', 'b'])
      useGraphViewStore.getState().dequeueFocus()
      expect(useGraphViewStore.getState().focusQueue).toEqual(['b'])
      useGraphViewStore.getState().clearFocus()
      expect(useGraphViewStore.getState().focusQueue).toEqual([])
    })
  })

  describe('requestFitView / clearFitView', () => {
    it('toggles pendingFitView flag', () => {
      expect(useGraphViewStore.getState().pendingFitView).toBe(false)
      useGraphViewStore.getState().requestFitView()
      expect(useGraphViewStore.getState().pendingFitView).toBe(true)
      useGraphViewStore.getState().clearFitView()
      expect(useGraphViewStore.getState().pendingFitView).toBe(false)
    })
  })

  describe('requestFitViewOnNodeIds (FR41)', () => {
    it('déduplique et ignore les ids vides', () => {
      useGraphViewStore.getState().requestFitViewOnNodeIds(['a', 'a', '', 'b'])
      expect(useGraphViewStore.getState().pendingFitViewNodeIds).toEqual(['a', 'b'])
      useGraphViewStore.getState().clearFitViewNodeIdsRequest()
      expect(useGraphViewStore.getState().pendingFitViewNodeIds).toBeNull()
    })
  })

  describe('requestEdgeLabelEdit / clearEdgeLabelEdit', () => {
    it('sets and clears edgeLabelEditRequest', () => {
      expect(useGraphViewStore.getState().edgeLabelEditRequest).toBeNull()
      useGraphViewStore.getState().requestEdgeLabelEdit('edge-abc')
      expect(useGraphViewStore.getState().edgeLabelEditRequest).toEqual({ edgeId: 'edge-abc' })
      useGraphViewStore.getState().clearEdgeLabelEdit()
      expect(useGraphViewStore.getState().edgeLabelEditRequest).toBeNull()
    })
  })

  describe('openContextMenu / closeContextMenu', () => {
    it('sets and clears contextMenuRequest with coordinates', () => {
      expect(useGraphViewStore.getState().contextMenuRequest).toBeNull()
      useGraphViewStore.getState().openContextMenu('node-7', 120, 340)
      expect(useGraphViewStore.getState().contextMenuRequest).toEqual({
        nodeId: 'node-7',
        x: 120,
        y: 340,
      })
      useGraphViewStore.getState().closeContextMenu()
      expect(useGraphViewStore.getState().contextMenuRequest).toBeNull()
    })
  })

  describe('openPromptViewer / closePromptViewer', () => {
    it('sets and clears promptViewerNodeId', () => {
      expect(useGraphViewStore.getState().promptViewerNodeId).toBeNull()
      useGraphViewStore.getState().openPromptViewer('node-99')
      expect(useGraphViewStore.getState().promptViewerNodeId).toBe('node-99')
      useGraphViewStore.getState().closePromptViewer()
      expect(useGraphViewStore.getState().promptViewerNodeId).toBeNull()
    })
  })

  describe('openAIGeneration / closeAIGeneration', () => {
    it('sets and clears aiGenerationNodeId', () => {
      expect(useGraphViewStore.getState().aiGenerationNodeId).toBeNull()
      useGraphViewStore.getState().openAIGeneration('node-gen')
      expect(useGraphViewStore.getState().aiGenerationNodeId).toBe('node-gen')
      useGraphViewStore.getState().closeAIGeneration()
      expect(useGraphViewStore.getState().aiGenerationNodeId).toBeNull()
    })
  })

  describe('registerReactFlowInstance', () => {
    it('stores the instance', () => {
      const fakeInstance = { fitView: () => {} } as unknown as import('reactflow').ReactFlowInstance
      expect(useGraphViewStore.getState().reactFlowInstance).toBeNull()
      useGraphViewStore.getState().registerReactFlowInstance(fakeInstance)
      expect(useGraphViewStore.getState().reactFlowInstance).toBe(fakeInstance)
    })
  })

  describe('flush protocol', () => {
    it('follows the sequence: requestFlush → confirmFlush → requestSave → clearSaveRequest', () => {
      const s = () => useGraphViewStore.getState()

      expect(s().flushRequested).toBe(false)
      expect(s().flushCompleted).toBe(false)
      expect(s().saveRequested).toBe(false)

      s().requestFlush()
      expect(s().flushRequested).toBe(true)
      expect(s().flushCompleted).toBe(false)

      s().confirmFlush()
      expect(s().flushRequested).toBe(false)
      expect(s().flushCompleted).toBe(true)

      s().requestSave()
      expect(s().saveRequested).toBe(true)

      s().clearSaveRequest()
      expect(s().saveRequested).toBe(false)
    })

    it('resetFlush clears all flush flags', () => {
      const s = () => useGraphViewStore.getState()
      s().requestFlush()
      s().requestSave()
      s().resetFlush()
      expect(s().flushRequested).toBe(false)
      expect(s().flushCompleted).toBe(false)
      expect(s().saveRequested).toBe(false)
    })
  })

  describe('notifyDialogueDeleted / clearDialogueDeleted', () => {
    it('sets and clears dialogueDeleted filename', () => {
      expect(useGraphViewStore.getState().dialogueDeleted).toBeNull()
      useGraphViewStore.getState().notifyDialogueDeleted('test.json')
      expect(useGraphViewStore.getState().dialogueDeleted).toBe('test.json')
      useGraphViewStore.getState().clearDialogueDeleted()
      expect(useGraphViewStore.getState().dialogueDeleted).toBeNull()
    })
  })

  describe('Story 9.4 dialogue preview', () => {
    it('enterDialoguePreview active l’état et exitDialoguePreview réinitialise', () => {
      useGraphViewStore.getState().enterScenarioPlaythrough(
        { flags: { F: true }, reputation: { 'a::b': 2 } },
        [
          {
            id: 'START',
            type: 'dialogueNode',
            position: { x: 0, y: 0 },
            data: { id: 'START' },
          },
        ],
        [],
      )
      expect(useGraphViewStore.getState().dialoguePreviewActive).toBe(true)
      expect(useGraphViewStore.getState().scenarioPlaythrough.active).toBe(true)
      expect(useGraphViewStore.getState().visibilityEvalState.flags.F).toBe(true)
      useGraphViewStore.getState().exitDialoguePreview()
      expect(useGraphViewStore.getState().dialoguePreviewActive).toBe(false)
      expect(useGraphViewStore.getState().scenarioPlaythrough.active).toBe(false)
      expect(useGraphViewStore.getState().visibilityEvalState.flags).toEqual({})
    })
  })
})
