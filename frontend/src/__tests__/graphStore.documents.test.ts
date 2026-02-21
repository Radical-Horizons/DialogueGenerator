/**
 * Tests store SoT document + layout, load/save via API documents.
 * Story 16.4 Task 1.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGraphStore } from '../store/graphStore'
import * as documentsAPI from '../api/documents'

vi.mock('../api/documents', () => ({
  getDocument: vi.fn(),
  getLayout: vi.fn(),
  putDocument: vi.fn(),
  putLayout: vi.fn(),
}))

const sampleDocument = {
  schemaVersion: '1.1.0',
  nodes: [
    { id: 'START', speaker: 'NPC', line: 'Hello', nextNode: 'END' },
    { id: 'END', line: '' },
  ],
}

const sampleLayout = { nodes: { START: { x: 100, y: 200 }, END: { x: 100, y: 350 } } }

describe('graphStore - document SoT load/save', () => {
  beforeEach(() => {
    vi.mocked(documentsAPI.getDocument).mockReset()
    vi.mocked(documentsAPI.getLayout).mockReset()
    vi.mocked(documentsAPI.putDocument).mockReset()
    vi.mocked(documentsAPI.putLayout).mockReset()
    useGraphStore.getState().resetGraph()
  })

  describe('loadDialogueByDocumentId', () => {
    it('sets document, layout, revisions and projects nodes/edges', async () => {
      vi.mocked(documentsAPI.getDocument).mockResolvedValue({
        document: sampleDocument,
        schemaVersion: '1.1.0',
        revision: 2,
      })
      vi.mocked(documentsAPI.getLayout).mockResolvedValue({
        layout: sampleLayout,
        revision: 1,
      })
      const { loadDialogueByDocumentId } = useGraphStore.getState()
      await loadDialogueByDocumentId('test-doc')
      const state = useGraphStore.getState()
      expect(state.document).toEqual(sampleDocument)
      expect(state.layout).toEqual(sampleLayout)
      expect(state.documentRevision).toBe(2)
      expect(state.layoutRevision).toBe(1)
      expect(state.documentId).toBe('test-doc')
      expect(state.nodes.length).toBeGreaterThanOrEqual(2)
      expect(state.edges.some((e) => e.source === 'START' && e.target === 'END')).toBe(true)
    })

    it('handles 404 layout as empty layout', async () => {
      vi.mocked(documentsAPI.getDocument).mockResolvedValue({
        document: sampleDocument,
        schemaVersion: '1.1.0',
        revision: 1,
      })
      vi.mocked(documentsAPI.getLayout).mockRejectedValue({ response: { status: 404 } })
      const { loadDialogueByDocumentId } = useGraphStore.getState()
      await loadDialogueByDocumentId('test-doc')
      const state = useGraphStore.getState()
      expect(state.document).toEqual(sampleDocument)
      expect(state.layout).toEqual({})
      expect(state.layoutRevision).toBe(1)
      expect(state.nodes.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('saveDialogue with document SoT', () => {
    it('calls putDocument and putLayout when document is set', async () => {
      vi.mocked(documentsAPI.getDocument).mockResolvedValue({
        document: sampleDocument,
        schemaVersion: '1.1.0',
        revision: 1,
      })
      vi.mocked(documentsAPI.getLayout).mockResolvedValue({ layout: sampleLayout, revision: 1 })
      vi.mocked(documentsAPI.putDocument).mockResolvedValue({ revision: 2 })
      vi.mocked(documentsAPI.putLayout).mockResolvedValue({ revision: 2 })
      const { loadDialogueByDocumentId, saveDialogue } = useGraphStore.getState()
      await loadDialogueByDocumentId('test-doc')
      await saveDialogue()
      expect(documentsAPI.putDocument).toHaveBeenCalledWith(
        'test-doc',
        expect.objectContaining({
          document: expect.objectContaining({ schemaVersion: '1.1.0', nodes: expect.any(Array) }),
          revision: 1,
        })
      )
      expect(documentsAPI.putLayout).toHaveBeenCalledWith(
        'test-doc',
        expect.objectContaining({
          layout: expect.objectContaining({ nodes: expect.any(Object) }),
          revision: 1,
        })
      )
    })

    it('sends state.document and state.layout (SoT) to API, not re-serialized projection', async () => {
      vi.mocked(documentsAPI.getDocument).mockResolvedValue({
        document: sampleDocument,
        schemaVersion: '1.1.0',
        revision: 1,
      })
      vi.mocked(documentsAPI.getLayout).mockResolvedValue({ layout: sampleLayout, revision: 1 })
      vi.mocked(documentsAPI.putDocument).mockResolvedValue({ revision: 2 })
      vi.mocked(documentsAPI.putLayout).mockResolvedValue({ revision: 2 })
      const { loadDialogueByDocumentId, saveDialogue, updateNode } = useGraphStore.getState()
      await loadDialogueByDocumentId('test-doc')
      updateNode('START', { data: { line: 'Patched line', speaker: 'NPC' } })
      const stateBeforeSave = useGraphStore.getState()
      const expectedDocument = stateBeforeSave.document
      const expectedLayout = stateBeforeSave.layout
      await saveDialogue()
      expect(documentsAPI.putDocument).toHaveBeenCalledWith(
        'test-doc',
        expect.objectContaining({
          document: expectedDocument,
          revision: 1,
        })
      )
      expect(documentsAPI.putLayout).toHaveBeenCalledWith(
        'test-doc',
        expect.objectContaining({
          layout: expectedLayout,
          revision: 1,
        })
      )
    })

    it('updates revisions and clears hasUnsavedChanges on success', async () => {
      vi.mocked(documentsAPI.getDocument).mockResolvedValue({
        document: sampleDocument,
        schemaVersion: '1.1.0',
        revision: 7,
      })
      vi.mocked(documentsAPI.getLayout).mockResolvedValue({ layout: sampleLayout, revision: 9 })
      vi.mocked(documentsAPI.putDocument).mockResolvedValue({ revision: 8 })
      vi.mocked(documentsAPI.putLayout).mockResolvedValue({ revision: 10 })

      const { loadDialogueByDocumentId, saveDialogue, updateNode } = useGraphStore.getState()
      await loadDialogueByDocumentId('test-doc')

      // Mark unsaved changes
      updateNode('START', { data: { line: 'Dirty', speaker: 'NPC' } })
      expect(useGraphStore.getState().hasUnsavedChanges).toBe(true)

      await saveDialogue()

      const state = useGraphStore.getState()
      expect(documentsAPI.putDocument).toHaveBeenCalledTimes(1)
      expect(documentsAPI.putLayout).toHaveBeenCalledTimes(1)
      expect(state.documentRevision).toBe(8)
      expect(state.layoutRevision).toBe(10)
      expect(state.hasUnsavedChanges).toBe(false)
      expect(state.lastSaveError).toBeNull()
      expect(state.syncStatus).toBe('synced')
      expect(typeof state.lastSavedAt).toBe('number')
    })
  })

  describe('Task 2.2 - edit via document then re-project', () => {
    it('updateNode in document SoT updates document then re-projects (line/speaker)', async () => {
      vi.mocked(documentsAPI.getDocument).mockResolvedValue({
        document: sampleDocument,
        schemaVersion: '1.1.0',
        revision: 1,
      })
      vi.mocked(documentsAPI.getLayout).mockResolvedValue({
        layout: sampleLayout,
        revision: 1,
      })
      const { loadDialogueByDocumentId, updateNode } = useGraphStore.getState()
      await loadDialogueByDocumentId('test-doc')
      const startNodeBefore = useGraphStore.getState().nodes.find((n) => n.id === 'START')
      expect(startNodeBefore?.data?.line).toBe('Hello')

      updateNode('START', { data: { line: 'Hello world', speaker: 'NPC' } })

      const state = useGraphStore.getState()
      const startUnity = state.document?.nodes?.find((n: { id: string }) => n.id === 'START')
      expect(startUnity?.line).toBe('Hello world')
      expect(startUnity?.speaker).toBe('NPC')
      const startNode = state.nodes.find((n) => n.id === 'START')
      expect(startNode?.data?.line).toBe('Hello world')
      expect(startNode?.id).toBe('START')
    })

    it('updateNode in document SoT preserves stable ids (no panel reset)', async () => {
      const docWithChoice = {
        schemaVersion: '1.1.0',
        nodes: [
          { id: 'START', speaker: 'X', line: 'Hi', choices: [{ choiceId: 'opt', text: 'Go', targetNode: 'END' }] },
          { id: 'END', line: '' },
        ],
      }
      vi.mocked(documentsAPI.getDocument).mockResolvedValue({
        document: docWithChoice,
        schemaVersion: '1.1.0',
        revision: 1,
      })
      vi.mocked(documentsAPI.getLayout).mockResolvedValue({
        layout: { nodes: { START: { x: 0, y: 0 }, END: { x: 0, y: 150 } } },
        revision: 1,
      })
      const { loadDialogueByDocumentId, updateNode } = useGraphStore.getState()
      await loadDialogueByDocumentId('doc-edit')
      const edgeIdBefore = useGraphStore.getState().edges.find(
        (e) => e.source === 'START' && e.target === 'END' && e.data?.choiceId === 'opt'
      )?.id

      updateNode('START', { data: { line: 'Updated line', speaker: 'X', choices: [{ choiceId: 'opt', text: 'Go', targetNode: 'END' }] } })

      const state = useGraphStore.getState()
      expect(state.document?.nodes?.find((n: { id: string }) => n.id === 'START')?.line).toBe('Updated line')
      const edgeAfter = state.edges.find(
        (e) => e.source === 'START' && e.target === 'END' && e.data?.choiceId === 'opt'
      )
      expect(edgeAfter?.id).toBe(edgeIdBefore)
      expect(edgeAfter?.sourceHandle).toBe('choice:opt')
    })

    it('updateNode on TestNode in document SoT patches document choice then re-projects', async () => {
      const docWithTest = {
        schemaVersion: '1.1.0',
        nodes: [
          {
            id: 'START',
            speaker: 'X',
            line: 'Try',
            choices: [
              {
                choiceId: 'skill',
                text: 'Roll',
                test: { formula: '1d20' },
                testSuccessNode: 'END',
                testFailureNode: 'END',
              },
            ],
          },
          { id: 'END', line: '' },
        ],
      }
      vi.mocked(documentsAPI.getDocument).mockResolvedValue({
        document: docWithTest,
        schemaVersion: '1.1.0',
        revision: 1,
      })
      vi.mocked(documentsAPI.getLayout).mockResolvedValue({
        layout: { nodes: { START: { x: 0, y: 0 }, END: { x: 0, y: 150 } } },
        revision: 1,
      })
      const { loadDialogueByDocumentId, updateNode } = useGraphStore.getState()
      await loadDialogueByDocumentId('doc-test')
      const testNodeId = useGraphStore.getState().nodes.find((n) => n.type === 'testNode')?.id
      expect(testNodeId).toBe('test:skill')

      updateNode(testNodeId!, { data: { test: { formula: '2d20' } } })

      const state = useGraphStore.getState()
      const startNode = state.document?.nodes?.find((n: { id: string }) => n.id === 'START')
      const choice = (startNode?.choices as { test?: { formula?: string } }[])?.[0]
      expect(choice?.test).toEqual({ formula: '2d20' })
      const testNode = state.nodes.find((n) => n.id === 'test:skill')
      expect(testNode?.data?.test).toEqual({ formula: '2d20' })
    })
  })

  describe('Task 3.2 - no panel reset after edit (AC 4)', () => {
    it('editing line/speaker in document SoT keeps selectedNodeId and node ids stable', async () => {
      vi.mocked(documentsAPI.getDocument).mockResolvedValue({
        document: sampleDocument,
        schemaVersion: '1.1.0',
        revision: 1,
      })
      vi.mocked(documentsAPI.getLayout).mockResolvedValue({
        layout: sampleLayout,
        revision: 1,
      })
      const { loadDialogueByDocumentId, setSelectedNode, updateNode } = useGraphStore.getState()
      await loadDialogueByDocumentId('test-doc')
      setSelectedNode('START')
      const idsBefore = useGraphStore.getState().nodes.map((n) => n.id)

      updateNode('START', { data: { line: 'Edited line', speaker: 'NPC' } })

      const state = useGraphStore.getState()
      expect(state.selectedNodeId).toBe('START')
      expect(state.nodes.map((n) => n.id).sort()).toEqual(idsBefore.sort())
      expect(state.nodes.find((n) => n.id === 'START')?.data?.line).toBe('Edited line')
    })
  })

  describe('projection stable IDs (Task 2.1)', () => {
    it('loads document with choiceId and projects stable handle/test/edge ids', async () => {
      const docWithChoiceId = {
        schemaVersion: '1.1.0',
        nodes: [
          {
            id: 'START',
            speaker: 'NPC',
            line: 'Hello',
            choices: [
              { choiceId: 'accept', text: 'Accept', targetNode: 'END' },
              { choiceId: 'refuse', text: 'Refuse', targetNode: 'END' },
            ],
          },
          { id: 'END', line: '' },
        ],
      }
      vi.mocked(documentsAPI.getDocument).mockResolvedValue({
        document: docWithChoiceId,
        schemaVersion: '1.1.0',
        revision: 1,
      })
      vi.mocked(documentsAPI.getLayout).mockResolvedValue({
        layout: { nodes: { START: { x: 0, y: 0 }, END: { x: 0, y: 150 } } },
        revision: 1,
      })
      const { loadDialogueByDocumentId } = useGraphStore.getState()
      await loadDialogueByDocumentId('doc-choiceid')
      const state = useGraphStore.getState()
      const choiceEdge = state.edges.find(
        (e) => e.source === 'START' && e.target === 'END' && e.data?.choiceId === 'accept'
      )
      expect(choiceEdge?.sourceHandle).toBe('choice:accept')
      expect(choiceEdge?.id).toBe('e:START:choice:accept')
    })
  })
})
