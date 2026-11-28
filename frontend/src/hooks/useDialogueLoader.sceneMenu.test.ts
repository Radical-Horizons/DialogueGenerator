/**
 * Ce que le chargeur fait des gestes de la fiche de scène : renommage et suppression.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDialogueLoader } from './useDialogueLoader'
import { useGraphStore } from '../store/graphStore'
import { useGraphViewStore } from '../store/graphViewStore'
import type { UnityDialogueListRef } from '../components/unityDialogues/UnityDialogueList'

vi.mock('../api/unityDialogues', () => ({
  getUnityDialogue: vi.fn(),
}))

const toast = vi.fn()

type SaveDialogue = ReturnType<typeof useGraphStore.getState>['saveDialogue']

function loaded(overrides: Record<string, unknown> = {}) {
  useGraphStore.setState({
    nodes: [{ id: 'n1', type: 'dialogueNode', position: { x: 0, y: 0 }, data: {} }],
    edges: [],
    documentId: 'dial',
    dialogueMetadata: { filename: 'dial', title: 'D', node_count: 1, edge_count: 0 },
    ...overrides,
  })
}

beforeEach(() => {
  toast.mockReset()
  useGraphStore.getState().resetGraph()
  useGraphViewStore.getState().clearDialogueDeleted()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useDialogueLoader — fiche de scène', () => {
  it('un titre enregistré relit la bibliothèque une fois, après la pause', async () => {
    vi.useFakeTimers()
    const saveDialogue = vi.fn(async () => {
      useGraphStore.setState({ hasUnsavedChanges: false })
      return { success: true, filename: 'dial', titleChanged: true }
    })
    loaded({ saveDialogue: saveDialogue as unknown as SaveDialogue, hasUnsavedChanges: true })
    const { result } = renderHook(() => useDialogueLoader(toast, null))
    const refresh = vi.fn()
    ;(result.current.dialogueListRef as { current: UnityDialogueListRef | null }).current = {
      refresh,
    }

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    // Une seconde frappe avant la fin de la pause repousse la relecture.
    await act(async () => {
      useGraphStore.setState((s) => ({ hasUnsavedChanges: true, clientSeq: s.clientSeq + 1 }))
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(saveDialogue).toHaveBeenCalledTimes(2)
    expect(refresh).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('dialogue affiché supprimé : le graphe se vide et l’appelant est prévenu', () => {
    const onDeleted = vi.fn()
    loaded()
    renderHook(() => useDialogueLoader(toast, null, onDeleted))

    act(() => useGraphViewStore.getState().notifyDialogueDeleted('autre.json'))
    expect(onDeleted).not.toHaveBeenCalled()

    act(() => useGraphViewStore.getState().notifyDialogueDeleted('dial.json'))

    expect(onDeleted).toHaveBeenCalledTimes(1)
    expect(useGraphStore.getState().documentId).toBeNull()
  })
})
