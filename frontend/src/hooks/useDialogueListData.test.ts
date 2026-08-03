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

  it('filtre par période et auteur (ET) et expose availableAuthors / reset (FR82)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0))

    mockList.mockResolvedValueOnce({
      dialogues: [
        {
          filename: 'recent_marc.json',
          file_path: '/data/recent_marc.json',
          size_bytes: 10,
          modified_time: '2026-06-14T08:00:00.000Z',
          created_at: '2026-06-14T08:00:00.000Z',
          title: 'Récent Marc',
          owner_id: 'u-marc',
          owner_username: 'marc',
        },
        {
          filename: 'old_marc.json',
          file_path: '/data/old_marc.json',
          size_bytes: 10,
          modified_time: '2026-01-01T08:00:00.000Z',
          created_at: '2026-01-01T08:00:00.000Z',
          title: 'Ancien Marc',
          owner_id: 'u-marc',
          owner_username: 'marc',
        },
        {
          filename: 'recent_luna.json',
          file_path: '/data/recent_luna.json',
          size_bytes: 10,
          modified_time: '2026-06-13T08:00:00.000Z',
          created_at: '2026-06-13T08:00:00.000Z',
          title: 'Récent Luna',
          owner_id: 'u-luna',
          owner_username: 'luna',
        },
      ],
      total: 3,
    })

    const { result } = renderHook(() => useDialogueListData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.availableAuthors.map((a) => a.username)).toEqual([
      'luna',
      'marc',
    ])

    act(() => {
      result.current.setDatePeriod('week')
    })
    expect(result.current.filteredDialogues.map((d) => d.filename)).toEqual([
      'recent_marc.json',
      'recent_luna.json',
    ])

    act(() => {
      result.current.setAuthorId('u-marc')
    })
    expect(result.current.filteredDialogues.map((d) => d.filename)).toEqual([
      'recent_marc.json',
    ])
    expect(result.current.hasActiveFilters).toBe(true)

    // Combinaison ET avec la recherche.
    act(() => {
      result.current.setSearchQuery('récent')
    })
    expect(result.current.filteredDialogues.map((d) => d.filename)).toEqual([
      'recent_marc.json',
    ])
    act(() => {
      result.current.setSearchQuery('luna')
    })
    expect(result.current.filteredDialogues).toHaveLength(0)

    act(() => {
      result.current.setSearchQuery('')
      result.current.setDatePeriod('year')
      result.current.setAuthorId(null)
    })
    // Année civile 2026 : les trois fixtures (janvier + juin) restent.
    expect(result.current.filteredCount).toBe(3)

    act(() => {
      result.current.resetFilters()
    })
    expect(result.current.datePeriod).toBe('all')
    expect(result.current.authorId).toBeNull()
    expect(result.current.filteredCount).toBe(3)

    vi.useRealTimers()
  })

  it('exclut les items sans owner_id d’un filtre auteur précis', async () => {
    mockList.mockResolvedValueOnce({
      dialogues: [
        {
          filename: 'owned.json',
          file_path: '/data/owned.json',
          size_bytes: 1,
          modified_time: '2026-06-01T00:00:00.000Z',
          created_at: '2026-06-01T00:00:00.000Z',
          owner_id: 'u1',
          owner_username: 'marc',
          title: 'Owned',
        },
        {
          filename: 'orphan.json',
          file_path: '/data/orphan.json',
          size_bytes: 1,
          modified_time: '2026-06-02T00:00:00.000Z',
          created_at: '2026-06-02T00:00:00.000Z',
          title: 'Orphan',
        },
      ],
      total: 2,
    })
    const { result } = renderHook(() => useDialogueListData())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      result.current.setAuthorId('u1')
    })
    expect(result.current.filteredDialogues.map((d) => d.filename)).toEqual([
      'owned.json',
    ])
  })

  it('filtre par personnage (speakers) insensible à la casse (FR81)', async () => {
    mockList.mockResolvedValueOnce({
      dialogues: [
        {
          filename: 'scene1.json',
          file_path: '/data/scene1.json',
          size_bytes: 10,
          modified_time: '2026-04-01T08:00:00.000Z',
          title: 'Scene 1',
          speakers: ['Uresaïr', 'Voknir'],
          search_text: 'bonjour',
        },
        {
          filename: 'scene2.json',
          file_path: '/data/scene2.json',
          size_bytes: 10,
          modified_time: '2026-04-02T08:00:00.000Z',
          title: 'Scene 2',
          speakers: ['Luna'],
          search_text: 'salut',
        },
      ],
      total: 2,
    })
    const { result } = renderHook(() => useDialogueListData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.setSearchQuery('URESAÏR')
    })

    expect(result.current.filteredDialogues).toHaveLength(1)
    expect(result.current.filteredDialogues[0]?.filename).toBe('scene1.json')
  })

  it('filtre par texte de réplique (search_text) (FR81)', async () => {
    mockList.mockResolvedValueOnce({
      dialogues: [
        {
          filename: 'scene1.json',
          file_path: '/data/scene1.json',
          size_bytes: 10,
          modified_time: '2026-04-01T08:00:00.000Z',
          title: 'Sans rapport',
          speakers: ['X'],
          search_text: 'vous êtes rentrée par mes fissures',
        },
        {
          filename: 'scene2.json',
          file_path: '/data/scene2.json',
          size_bytes: 10,
          modified_time: '2026-04-02T08:00:00.000Z',
          title: 'Autre',
          speakers: ['Y'],
          search_text: 'rien à voir ici',
        },
      ],
      total: 2,
    })
    const { result } = renderHook(() => useDialogueListData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.setSearchQuery('fissures')
    })

    expect(result.current.filteredDialogues).toHaveLength(1)
    expect(result.current.filteredDialogues[0]?.filename).toBe('scene1.json')
  })

  it('matche un personnage par sous-chaîne, majuscules, et sans casser sur champs null (FR81)', async () => {
    mockList.mockResolvedValueOnce({
      dialogues: [
        {
          filename: 'scene1.json',
          file_path: '/data/scene1.json',
          size_bytes: 10,
          modified_time: '2026-04-01T08:00:00.000Z',
          title: 'Rencontre',
          speakers: ['Uresaïr', 'Voknir'],
          search_text: 'vous êtes rentrée par mes fissures',
        },
        // Champs cherchables absents : le prédicat ne doit pas lever.
        {
          filename: 'autre.json',
          file_path: '/data/autre.json',
          size_bytes: 10,
          modified_time: '2026-04-02T08:00:00.000Z',
        },
      ],
      total: 2,
    })
    const { result } = renderHook(() => useDialogueListData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Sous-chaîne d'un personnage (« ures » ⊂ « Uresaïr »).
    act(() => {
      result.current.setSearchQuery('ures')
    })
    expect(result.current.filteredDialogues).toHaveLength(1)
    expect(result.current.filteredDialogues[0]?.filename).toBe('scene1.json')

    // Query en majuscules contre un search_text déjà minuscule.
    act(() => {
      result.current.setSearchQuery('FISSURES')
    })
    expect(result.current.filteredDialogues).toHaveLength(1)
    expect(result.current.filteredDialogues[0]?.filename).toBe('scene1.json')
  })

  it('matche un fragment de filename même si le titre diffère (non-régression nom)', async () => {
    mockList.mockResolvedValueOnce({
      dialogues: [
        {
          filename: 'quete_foret.json',
          file_path: '/data/quete_foret.json',
          size_bytes: 10,
          modified_time: '2026-04-01T08:00:00.000Z',
          title: 'Sans rapport',
          speakers: ['A'],
          search_text: 'zzz',
        },
        {
          filename: 'ville.json',
          file_path: '/data/ville.json',
          size_bytes: 10,
          modified_time: '2026-04-02T08:00:00.000Z',
          title: 'Autre',
          speakers: ['B'],
          search_text: 'yyy',
        },
      ],
      total: 2,
    })
    const { result } = renderHook(() => useDialogueListData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.setSearchQuery('  foret  ')
    })

    // Trim + fragment de filename : un seul résultat malgré espaces parasites.
    expect(result.current.filteredDialogues).toHaveLength(1)
    expect(result.current.filteredDialogues[0]?.filename).toBe('quete_foret.json')
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
