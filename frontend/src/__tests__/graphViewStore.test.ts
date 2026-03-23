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
    pendingFocusNodeId: null,
    pendingFitView: false,
    edgeLabelEditRequest: null,
    contextMenuRequest: null,
    promptViewerNodeId: null,
    aiGenerationNodeId: null,
    flushRequested: false,
    flushCompleted: false,
    saveRequested: false,
    dialogueDeleted: null,
  })
}

describe('graphViewStore', () => {
  beforeEach(() => reset())

  describe('focusNode / clearFocus', () => {
    it('sets and clears pendingFocusNodeId', () => {
      expect(useGraphViewStore.getState().pendingFocusNodeId).toBeNull()
      useGraphViewStore.getState().focusNode('node-42')
      expect(useGraphViewStore.getState().pendingFocusNodeId).toBe('node-42')
      useGraphViewStore.getState().clearFocus()
      expect(useGraphViewStore.getState().pendingFocusNodeId).toBeNull()
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
})
