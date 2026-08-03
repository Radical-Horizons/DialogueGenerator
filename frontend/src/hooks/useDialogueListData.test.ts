/**
 * Tests du hook partagé `useDialogueListData`.
 *
 * Story 17.7 — extrait fetch + filter + sort de `UnityDialogueList`
 * pour mutualisation avec `DialogueCombobox`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import * as unityDialoguesAPI from '../api/unityDialogues'
import { useDialogueListData } from './useDialogueListData'

vi.mock('../api/unityDialogues', () => ({
  listUnityDialogues: vi.fn(),
}))

const mockList = vi.mocked(unityDialoguesAPI.listUnityDialogues)

const FIXTURE = [
  {
    filename: 'alpha.json',
    file_path: '/data/alpha.json',
    size_bytes: 1024,
    modified_time: '2026-04-01T08:00:00.000Z',
    title: 'Alpha Story',
  },
  {
    filename: 'bravo.json',
    file_path: '/data/bravo.json',
    size_bytes: 2048,
    modified_time: '2026-04-10T12:00:00.000Z',
    title: 'Bravo Tale',
  },
  {
    filename: 'charlie.json',
    file_path: '/data/charlie.json',
    size_bytes: 512,
    modified_time: '2026-03-25T09:00:00.000Z',
    title: 'Charlie Quest',
  },
] as const

describe('useDialogueListData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList.mockResolvedValue({ dialogues: [...FIXTURE], total: FIXTURE.length })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('charge la liste au montage et expose total/filteredCount', async () => {
    mockList.mockResolvedValueOnce({ dialogues: [...FIXTURE], total: 99 })
    const { result } = renderHook(() => useDialogueListData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.dialogues).toHaveLength(3)
    expect(result.current.total).toBe(99)
    expect(result.current.filteredCount).toBe(3)
    expect(result.current.error).toBeNull()
  })

  it('tri par date décroissante par défaut (date-desc)', async () => {
    const { result } = renderHook(() => useDialogueListData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const ordered = result.current.filteredDialogues.map((d) => d.filename)
    expect(ordered).toEqual(['bravo.json', 'alpha.json', 'charlie.json'])
  })

  it('tri par nom alphabétique (name-asc)', async () => {
    const { result } = renderHook(() => useDialogueListData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.setSortType('name-asc')
    })

    const ordered = result.current.filteredDialogues.map((d) => d.filename)
    expect(ordered).toEqual(['alpha.json', 'bravo.json', 'charlie.json'])
  })

  it('filtre par titre (case-insensitive) et met à jour filteredCount', async () => {
    const { result } = renderHook(() => useDialogueListData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.setSearchQuery('alpha')
    })

    expect(result.current.filteredDialogues).toHaveLength(1)
    expect(result.current.filteredDialogues[0]?.filename).toBe('alpha.json')
    expect(result.current.filteredCount).toBe(1)
    expect(result.current.total).toBe(3)
  })

  it('refresh() ré-appelle listUnityDialogues et observe les nouveaux items', async () => {
    const { result } = renderHook(() => useDialogueListData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(mockList).toHaveBeenCalledTimes(1)

    mockList.mockResolvedValueOnce({
      dialogues: [
        ...FIXTURE,
        {
          filename: 'delta.json',
          file_path: '/data/delta.json',
          size_bytes: 256,
          modified_time: '2026-04-15T10:00:00.000Z',
          title: 'Delta Drama',
        },
      ],
      total: 4,
    })

    await act(async () => {
      await result.current.refresh()
    })

    expect(mockList).toHaveBeenCalledTimes(2)
    expect(result.current.dialogues).toHaveLength(4)
    expect(result.current.total).toBe(4)
  })

  it('pagine la liste filtrée à 50/page et borne la page demandée', async () => {
    const many = Array.from({ length: 60 }, (_, index) => ({
      filename: `d_${String(index).padStart(3, '0')}.json`,
      file_path: `/data/d_${index}.json`,
      size_bytes: 1,
      modified_time: new Date(2026, 0, 1, 0, 0, 60 - index).toISOString(),
      title: `D ${index}`,
    }))
    mockList.mockResolvedValueOnce({ dialogues: many, total: 60 })
    const { result } = renderHook(() => useDialogueListData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.totalPages).toBe(2)
    expect(result.current.page).toBe(1)
    expect(result.current.paginatedDialogues).toHaveLength(50)

    act(() => {
      result.current.setPage(2)
    })
    expect(result.current.page).toBe(2)
    expect(result.current.paginatedDialogues).toHaveLength(10)

    // Une page au-delà des bornes est ramenée à la dernière page valide.
    act(() => {
      result.current.setPage(99)
    })
    expect(result.current.page).toBe(2)
  })

  it('revient à la page 1 quand la recherche change', async () => {
    const many = Array.from({ length: 60 }, (_, index) => ({
      filename: `item_${String(index).padStart(3, '0')}.json`,
      file_path: `/data/item_${index}.json`,
      size_bytes: 1,
      modified_time: new Date(2026, 0, 1, 0, 0, 60 - index).toISOString(),
      title: `Item ${index}`,
    }))
    mockList.mockResolvedValueOnce({ dialogues: many, total: 60 })
    const { result } = renderHook(() => useDialogueListData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.setPage(2)
    })
    expect(result.current.page).toBe(2)

    act(() => {
      result.current.setSearchQuery('item_0')
    })
    expect(result.current.page).toBe(1)
  })

  it('expose un message d\'erreur si l\'API échoue', async () => {
    mockList.mockRejectedValueOnce(new Error('boom'))

    const { result } = renderHook(() => useDialogueListData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toContain('boom')
    expect(result.current.dialogues).toHaveLength(0)
  })
})
