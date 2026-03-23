/**
 * Tests unitaires pour runGraphTransaction.
 * Vérifie le contrat : undo snapshot, sync doc, markDirty, et les options skip.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Node, Edge } from 'reactflow'
import { runGraphTransaction } from '../store/utils/runGraphTransaction'
import type { GraphState } from '../store/types/graphState'

function createMockState(overrides?: Partial<GraphState>) {
  const state: Partial<GraphState> = {
    nodes: [{ id: 'n1', position: { x: 0, y: 0 }, data: {} }] as Node[],
    edges: [{ id: 'e1', source: 'n1', target: 'n2' }] as Edge[],
    document: null,
    layout: {},
    _pushUndoSnapshot: vi.fn(),
    markDirty: vi.fn(),
    ...overrides,
  }
  return state as GraphState
}

describe('runGraphTransaction', () => {
  let state: GraphState
  let get: () => GraphState
  let set: (partial: Partial<GraphState>) => void
  let setArg: Partial<GraphState> | undefined

  beforeEach(() => {
    state = createMockState()
    get = () => state
    setArg = undefined
    set = (partial) => {
      setArg = partial
      Object.assign(state, partial)
    }
  })

  it('calls _pushUndoSnapshot before mutation', () => {
    const order: string[] = []
    ;(state._pushUndoSnapshot as ReturnType<typeof vi.fn>).mockImplementation(() => order.push('undo'))
    
    runGraphTransaction(get, set, () => {
      order.push('mutate')
      return { nodes: state.nodes }
    })

    expect(order).toEqual(['undo', 'mutate'])
  })

  it('calls markDirty after set', () => {
    runGraphTransaction(get, set, () => ({ nodes: state.nodes }))
    expect(state.markDirty).toHaveBeenCalledTimes(1)
  })

  it('skips undo when skipUndo=true', () => {
    runGraphTransaction(get, set, () => ({ nodes: state.nodes }), { skipUndo: true })
    expect(state._pushUndoSnapshot).not.toHaveBeenCalled()
  })

  it('skips markDirty when skipMarkDirty=true', () => {
    runGraphTransaction(get, set, () => ({ nodes: state.nodes }), { skipMarkDirty: true })
    expect(state.markDirty).not.toHaveBeenCalled()
  })

  it('passes mutated nodes/edges through set', () => {
    const newNodes = [{ id: 'n2', position: { x: 10, y: 20 }, data: {} }] as Node[]
    runGraphTransaction(get, set, () => ({ nodes: newNodes }))
    expect(setArg).toBeDefined()
    expect((setArg as { nodes: Node[] }).nodes).toBe(newNodes)
  })

  it('does not call syncDocAndLayout when document is null', () => {
    const newNodes = [{ id: 'n2', position: { x: 10, y: 20 }, data: {} }] as Node[]
    runGraphTransaction(get, set, () => ({ nodes: newNodes }))
    expect(setArg).toBeDefined()
    expect((setArg as Record<string, unknown>).document).toBeUndefined()
  })

  it('calls syncDocAndLayout when document exists', () => {
    state = createMockState({ document: { entries: [] } as unknown as null })
    get = () => state
    const newNodes = [{ id: 'n2', position: { x: 10, y: 20 }, data: { nodeType: 'dialogue', id: 'n2', line: 'test', speaker: 'npc' } }] as Node[]
    runGraphTransaction(get, set, () => ({ nodes: newNodes }))
    expect(setArg).toBeDefined()
    expect((setArg as Record<string, unknown>).document).toBeDefined()
    expect((setArg as Record<string, unknown>).layout).toBeDefined()
  })

  it('skips syncDocAndLayout when skipSyncDoc=true even with document', () => {
    state = createMockState({ document: { entries: [] } as unknown as null })
    get = () => state
    runGraphTransaction(get, set, () => ({ nodes: state.nodes }), { skipSyncDoc: true })
    expect((setArg as Record<string, unknown>).document).toBeUndefined()
  })
})
