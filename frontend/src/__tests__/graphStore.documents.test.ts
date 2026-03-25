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
      expect(state.layout).toEqual({
        nodes: {
          START: { x: 0, y: 0 },
          END: { x: 0, y: 150 },
        },
      })
      expect(state.layoutRevision).toBe(1)
      expect(state.nodes.length).toBeGreaterThanOrEqual(2)
    })

    it('préserve les positions Y du layout fichier pour 5 branches plates (pas de redistribution au load)', async () => {
      const docWithFiveChoices = {
        schemaVersion: '1.1.0',
        nodes: [
          {
            id: 'START',
            speaker: 'NPC',
            line: 'Choose',
            choices: Array.from({ length: 5 }, (_, index) => ({
              choiceId: `choice-${index}`,
              text: `Option ${index + 1}`,
              targetNode: `NODE_${index}`,
            })),
          },
          ...Array.from({ length: 5 }, (_, index) => ({
            id: `NODE_${index}`,
            speaker: 'NPC',
            line: `Child ${index + 1}`,
          })),
        ],
      }
      const flatLayout = {
        nodes: {
          START: { x: 0, y: 0 },
          NODE_0: { x: 0, y: 320 },
          NODE_1: { x: 220, y: 320 },
          NODE_2: { x: 440, y: 320 },
          NODE_3: { x: 660, y: 320 },
          NODE_4: { x: 880, y: 320 },
        },
      }
      vi.mocked(documentsAPI.getDocument).mockResolvedValue({
        document: docWithFiveChoices,
        schemaVersion: '1.1.0',
        revision: 1,
      })
      vi.mocked(documentsAPI.getLayout).mockResolvedValue({
        layout: flatLayout,
        revision: 1,
      })

      const { loadDialogueByDocumentId } = useGraphStore.getState()
      await loadDialogueByDocumentId('doc-five-choices')

      const state = useGraphStore.getState()
      const childYValues = Array.from({ length: 5 }, (_, index) =>
        state.nodes.find((node) => node.id === `NODE_${index}`)!.position.y
      )
      const persistedYValues = Array.from({ length: 5 }, (_, index) =>
        ((state.layout?.nodes as Record<string, { x: number; y: number }>)?.[`NODE_${index}`] as {
          x: number
          y: number
        }).y
      )

      expect(childYValues.every((y) => y === 320)).toBe(true)
      expect(persistedYValues.every((y) => y === 320)).toBe(true)
    })

    it('ne déclenche pas putDocument/putLayout au seul chargement (pas de save implicite)', async () => {
      vi.mocked(documentsAPI.getDocument).mockResolvedValue({
        document: sampleDocument,
        schemaVersion: '1.1.0',
        revision: 1,
      })
      vi.mocked(documentsAPI.getLayout).mockResolvedValue({
        layout: sampleLayout,
        revision: 1,
      })
      const { loadDialogueByDocumentId } = useGraphStore.getState()
      await loadDialogueByDocumentId('test-doc')
      expect(documentsAPI.putDocument).not.toHaveBeenCalled()
      expect(documentsAPI.putLayout).not.toHaveBeenCalled()
      expect(useGraphStore.getState().hasUnsavedChanges).toBe(false)
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

    it('reconstruit le layout sauvegardé depuis les positions courantes, même si state.layout est stale', async () => {
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
      const stateBeforeSave = useGraphStore.getState()
      const startPosition = stateBeforeSave.nodes.find((node) => node.id === 'START')!.position
      useGraphStore.setState({
        layout: {
          ...sampleLayout,
          nodes: {
            ...sampleLayout.nodes,
            START: { x: 999, y: 999 },
          },
        },
      })

      await saveDialogue()
      expect(documentsAPI.putDocument).toHaveBeenCalledWith(
        'test-doc',
        expect.objectContaining({
          document: stateBeforeSave.document,
          revision: 1,
        })
      )
      expect(documentsAPI.putLayout).toHaveBeenCalledWith(
        'test-doc',
        expect.objectContaining({
          layout: expect.objectContaining({
            nodes: expect.objectContaining({
              START: startPosition,
            }),
          }),
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
      expect(testNodeId).toBe('test-node-START-choice-0')

      updateNode(testNodeId!, { data: { test: { formula: '2d20' } } })

      const state = useGraphStore.getState()
      const startNode = state.document?.nodes?.find((n: { id: string }) => n.id === 'START')
      const choice = (startNode?.choices as { test?: { formula?: string } }[])?.[0]
      expect(choice?.test).toEqual({ formula: '2d20' })
      const testNode = state.nodes.find((n) => n.id === 'test-node-START-choice-0')
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
