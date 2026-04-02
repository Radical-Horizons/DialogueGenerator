/**
 * Story 2.13 FR34 AC #1 #5: useGraphToolbar.handleAutoLayout appelle applyAutoLayout avec la direction.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGraphToolbar } from '../hooks/useGraphToolbar'
import { useGraphStore } from '../store/graphStore'

vi.mock('../api/graph', () => ({
  loadGraph: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  generateNode: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

const toastMock = vi.fn()
const handleSaveMock = vi.fn().mockResolvedValue(undefined)

describe('useGraphToolbar - handleAutoLayout (Story 2.13)', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
    toastMock.mockClear()
    handleSaveMock.mockClear()
  })

  it('handleAutoLayout(direction) calls store.applyAutoLayout("dagre", direction)', async () => {
    const store = useGraphStore.getState()
    const applySpy = vi.spyOn(store, 'applyAutoLayout').mockResolvedValue(undefined)

    const { result } = renderHook(() =>
      useGraphToolbar(toastMock, 'test.json', handleSaveMock, false)
    )

    await act(async () => {
      await result.current.handleAutoLayout('LR')
    })

    expect(applySpy).toHaveBeenCalledWith('dagre', 'LR')
    applySpy.mockRestore()
  })

  it('handleAutoLayout() without arg uses default layoutDirection TB', async () => {
    const store = useGraphStore.getState()
    const applySpy = vi.spyOn(store, 'applyAutoLayout').mockResolvedValue(undefined)

    const { result } = renderHook(() =>
      useGraphToolbar(toastMock, 'test.json', handleSaveMock, false)
    )

    await act(async () => {
      await result.current.handleAutoLayout()
    })

    expect(applySpy).toHaveBeenCalledWith('dagre', 'TB')
    applySpy.mockRestore()
  })
})
