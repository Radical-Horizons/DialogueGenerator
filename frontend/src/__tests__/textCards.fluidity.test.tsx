/**
 * Story 20.2 : ce que le prototype sort du chemin du glisser et de la frappe à 500 répliques,
 * sans rien changer au document, aux positions ni à l'annulation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { Node, NodeChange } from 'reactflow'
import fixture from '../../../e2e/fixtures/perf-graph-500.json'
import * as documentsAPI from '../api/documents'
import * as graphAPI from '../api/graph'
import { useReactFlowHandlers } from '../hooks/useReactFlowHandlers'
import { useGraphStore } from '../store/graphStore'
import { useGraphViewStore } from '../store/graphViewStore'
import { useUiLayoutStore } from '../store/uiLayoutStore'
import { cloneJson } from '../utils/cloneJson'
import * as journal from '../utils/graphJournal'
import {
  createQuietTask,
  queueJournalAck,
  queueJournalPending,
  QUIET_WORK_DELAY_MS,
} from '../utils/quietWork'

vi.mock('../api/documents', () => ({
  getDocument: vi.fn(),
  getLayout: vi.fn(),
  putDocument: vi.fn(),
  putLayout: vi.fn(),
  putDocumentKeepalive: vi.fn(),
  putLayoutKeepalive: vi.fn(),
}))

vi.mock('../api/graph', () => ({
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

vi.mock('../utils/graphJournal', () => ({
  setPending: vi.fn(),
  acknowledgeSnapshot: vi.fn(),
}))

const document = {
  schemaVersion: '1.1.0',
  nodes: [
    { id: 'START', speaker: 'PNJ', line: 'Bonjour', choices: [{ choiceId: 'c0', text: 'Oui', targetNode: 'node-a' }] },
    { id: 'node-a', speaker: 'PNJ', line: 'Bien', choices: [{ choiceId: 'c1', text: 'Encore', targetNode: 'node-b' }] },
    { id: 'node-b', speaker: 'PNJ', line: 'Fin', nextNode: 'END' },
  ],
}

const stored = {
  START: { x: 0, y: 0 },
  'node-a': { x: 500, y: 0 },
  'node-b': { x: 1000, y: 0 },
}

async function openDocument(prototype: boolean) {
  useUiLayoutStore.setState({ textCardsPrototype: prototype, textCardsTestBars: false })
  vi.mocked(documentsAPI.getDocument).mockResolvedValue({ document, schemaVersion: '1.1.0', revision: 1 })
  vi.mocked(documentsAPI.getLayout).mockResolvedValue({
    layout: prototype ? { nodes: {}, nodesLR: stored } : { nodes: stored },
    revision: 1,
  })
  await useGraphStore.getState().loadDialogueByDocumentId('doc')
}

const nodeById = (id: string) => useGraphStore.getState().nodes.find((n) => n.id === id) as Node

function editLine(line: string) {
  const node = nodeById('START')
  useGraphStore.getState().updateNode('START', { data: { ...node.data, line } })
}

beforeEach(() => {
  vi.mocked(documentsAPI.putDocument).mockReset().mockResolvedValue({ revision: 2 })
  vi.mocked(documentsAPI.putLayout).mockReset().mockResolvedValue({ revision: 2 })
  vi.mocked(graphAPI.validateGraph).mockReset().mockResolvedValue({ errors: [], warnings: [] } as never)
  vi.mocked(journal.setPending).mockReset().mockResolvedValue(undefined)
  vi.mocked(journal.acknowledgeSnapshot).mockReset().mockResolvedValue(undefined)
  useGraphStore.getState().resetGraph()
  useGraphViewStore.setState({ dragPositions: null })
})

afterEach(() => {
  vi.useRealTimers()
  useUiLayoutStore.setState({ textCardsPrototype: false })
})

describe('prototype : glisser', () => {
  const render = () =>
    renderHook(() => useReactFlowHandlers({ current: true }))

  it('sans début de glisser de nœud (rectangle de sélection, flèches), le store reçoit tout', async () => {
    await openDocument(true)
    const { result, unmount } = render()

    act(() => result.current.onNodesChange([move({ x: 30, y: 45 })]))
    await vi.waitFor(() => expect(nodeById('START').position).toEqual({ x: 30, y: 45 }))
    expect(useGraphViewStore.getState().dragPositions).toBeNull()

    act(() =>
      result.current.onNodesChange([
        { id: 'node-a', type: 'position', position: { x: 515, y: 15 }, dragging: false },
      ])
    )
    expect(nodeById('node-a').position).toEqual({ x: 515, y: 15 })
    expect(useGraphViewStore.getState().dragPositions).toBeNull()
    expect(useGraphStore.getState().hasUnsavedChanges).toBe(true)
    unmount()
  })

  const move = (position: { x: number; y: number }): NodeChange => ({
    id: 'START',
    type: 'position',
    position,
    dragging: true,
  })

  it('garde le store du graphe intact pendant le geste et écrit tout le groupe au lâcher', async () => {
    await openDocument(true)
    const { result, unmount } = render()
    const nodesBefore = useGraphStore.getState().nodes
    const seqBefore = useGraphStore.getState().clientSeq

    act(() => result.current.onNodeDragStart({ ctrlKey: false } as React.MouseEvent, nodeById('START')))
    act(() => result.current.onNodesChange([move({ x: 30, y: 45 })]))
    await vi.waitFor(() =>
      expect(useGraphViewStore.getState().dragPositions).toEqual({
        START: { x: 30, y: 45 },
        'node-a': { x: 530, y: 45 },
        'node-b': { x: 1030, y: 45 },
      })
    )
    expect(useGraphStore.getState().nodes).toBe(nodesBefore)

    let writes = 0
    const unsubscribe = useGraphStore.subscribe((state, previous) => {
      if (state.nodes !== previous.nodes) writes++
    })
    act(() =>
      result.current.onNodeDragStop({} as React.MouseEvent, {
        ...nodeById('START'),
        position: { x: 60, y: 90 },
      })
    )
    unsubscribe()

    expect(writes).toBe(1)
    expect(useGraphViewStore.getState().dragPositions).toBeNull()
    expect(nodeById('node-b').position).toEqual({ x: 1060, y: 90 })
    expect(
      (useGraphStore.getState().layout as { nodes: typeof stored }).nodes['node-a']
    ).toEqual({ x: 560, y: 90 })
    expect(useGraphStore.getState().clientSeq).toBe(seqBefore + 1)

    act(() => useGraphStore.getState().undo())
    expect(nodeById('node-b').position).toEqual(stored['node-b'])
    unmount()
  })

  it('drapeau éteint : chaque image du glisser écrit toujours dans le store', async () => {
    await openDocument(false)
    const { result, unmount } = render()

    act(() => result.current.onNodeDragStart({ ctrlKey: true } as React.MouseEvent, nodeById('START')))
    act(() => result.current.onNodesChange([move({ x: 30, y: 45 })]))
    await vi.waitFor(() => expect(nodeById('START').position).toEqual({ x: 30, y: 45 }))
    expect(useGraphViewStore.getState().dragPositions).toBeNull()
    unmount()
  })
})

describe('prototype : travaux différés à la pause', () => {
  it('enregistre tout de suite, puis journalise et valide après la pause', async () => {
    await openDocument(true)
    vi.useFakeTimers()
    editLine('Une suite')
    editLine('Une suite tapée')
    expect(journal.setPending).not.toHaveBeenCalled()

    await useGraphStore.getState().saveDialogue()
    expect(documentsAPI.putDocument).toHaveBeenCalledTimes(1)
    expect(useGraphStore.getState().hasUnsavedChanges).toBe(false)
    expect(graphAPI.validateGraph).not.toHaveBeenCalled()
    expect(journal.acknowledgeSnapshot).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(QUIET_WORK_DELAY_MS)
    expect(graphAPI.validateGraph).toHaveBeenCalledTimes(1)
    expect(journal.acknowledgeSnapshot).toHaveBeenCalledTimes(1)
    // L'accusé couvre l'état en attente : rien à réécrire derrière lui.
    expect(journal.setPending).not.toHaveBeenCalled()
  })

  it('ne valide pas si la saisie a repris ou si le graphe a été vidé entre-temps', async () => {
    await openDocument(true)
    vi.useFakeTimers()
    editLine('Une suite')
    await useGraphStore.getState().saveDialogue()
    editLine('Une suite reprise')
    await vi.advanceTimersByTimeAsync(QUIET_WORK_DELAY_MS)
    expect(graphAPI.validateGraph).not.toHaveBeenCalled()

    await useGraphStore.getState().saveDialogue()
    useGraphStore.getState().resetGraph()
    await vi.advanceTimersByTimeAsync(QUIET_WORK_DELAY_MS)
    expect(graphAPI.validateGraph).not.toHaveBeenCalled()
  })

  it('drapeau éteint : journal à chaque modification et validation avec l’enregistrement', async () => {
    await openDocument(false)
    editLine('Une suite')
    expect(journal.setPending).toHaveBeenCalledTimes(1)
    await useGraphStore.getState().saveDialogue()
    expect(journal.acknowledgeSnapshot).toHaveBeenCalledTimes(1)
    expect(graphAPI.validateGraph).toHaveBeenCalledTimes(1)
  })

  const snapshot = (ackSeq: number) => ({
    nodes: [],
    edges: [],
    metadata: { title: '', node_count: 0, edge_count: 0 },
    ackSeq,
  })
  const pending = (seq: number) => ({ ...snapshot(0), seq })

  it('un état plus récent que l’accusé reste en attente, écrit après lui', async () => {
    vi.useFakeTimers()
    queueJournalPending('doc', pending(3))
    queueJournalAck('doc', snapshot(2))
    await vi.advanceTimersByTimeAsync(QUIET_WORK_DELAY_MS)

    expect(journal.acknowledgeSnapshot).toHaveBeenCalledWith('doc', snapshot(2))
    expect(journal.setPending).toHaveBeenCalledWith('doc', pending(3))
    expect(vi.mocked(journal.acknowledgeSnapshot).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(journal.setPending).mock.invocationCallOrder[0]
    )
  })

  it('changer de document ou masquer la page écrit sans attendre', async () => {
    vi.useFakeTimers()
    queueJournalPending('premier', pending(1))
    queueJournalPending('second', pending(1))
    await vi.advanceTimersByTimeAsync(0)
    expect(journal.setPending).toHaveBeenCalledWith('premier', pending(1))

    window.dispatchEvent(new Event('pagehide'))
    await vi.advanceTimersByTimeAsync(0)
    expect(journal.setPending).toHaveBeenCalledWith('second', pending(1))
  })

  it('une saisie continue repousse le travail, jamais au-delà du délai maximal', () => {
    vi.useFakeTimers()
    const work = vi.fn()
    const task = createQuietTask(1000, 3000)
    for (let i = 0; i < 4; i++) {
      task.schedule(work)
      vi.advanceTimersByTime(700)
    }
    expect(work).not.toHaveBeenCalled()
    task.schedule(work)
    vi.advanceTimersByTime(200)
    expect(work).toHaveBeenCalledTimes(1)
  })
})

describe('cloneJson', () => {
  it('rend la même chose qu’un aller-retour JSON, en copie indépendante', () => {
    const odd = {
      a: undefined,
      b: [undefined, NaN, Infinity, null, () => 1],
      c: { d: new Date(0), e: 'é « » \n', f: -0, g: false, h: {} },
      i: () => 1,
    }
    for (const value of [odd, fixture]) {
      const copy = cloneJson(value)
      expect(copy).toStrictEqual(JSON.parse(JSON.stringify(value)))
      expect(copy).not.toBe(value)
    }
    const copy = cloneJson(fixture)
    expect(copy.nodes[0]).not.toBe(fixture.nodes[0])
  })
})
