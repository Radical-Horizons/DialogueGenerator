/**
 * Migration des briefs du navigateur vers les templates serveur.
 *
 * Couvre les lignes « Migration au démarrage », « Migration rejouée » et
 * « Migration partielle » de la matrice I/O. Le risque tenu ici est la perte de
 * donnée utilisateur : la migration copie, ne déplace pas, et ne se déclare close
 * qu'en cas de succès complet.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  migrateLocalBriefsToTemplates,
  hasMigratedSceneBriefs,
} from './migrateLocalBriefsToTemplates'
import { listLocalSceneTemplates } from './localNamedTemplates'
import { createTemplateApi, listTemplatesApi } from '../api/templates'

vi.mock('../api/templates', () => ({
  createTemplateApi: vi.fn(),
  listTemplatesApi: vi.fn(),
}))

vi.mock('./localNamedTemplates', () => ({
  listLocalSceneTemplates: vi.fn(),
}))

const mockedList = vi.mocked(listLocalSceneTemplates)
const mockedListApi = vi.mocked(listTemplatesApi)
const mockedCreate = vi.mocked(createTemplateApi)

function localBrief(name: string, body = 'texte') {
  return { id: `local-${name}`, name, body, updatedAt: '2026-08-19T00:00:00Z' }
}

describe('migrateLocalBriefsToTemplates', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mockedListApi.mockResolvedValue([])
    mockedCreate.mockResolvedValue({ id: 'srv', warnings: [] } as never)
  })

  it('convertit chaque brief local en template privé', async () => {
    mockedList.mockReturnValue([localBrief('Brief A'), localBrief('Brief B')])

    const result = await migrateLocalBriefsToTemplates()

    expect(result).toEqual({ migrated: 2, skipped: 0, completed: true })
    expect(mockedCreate).toHaveBeenCalledTimes(2)
    expect(mockedCreate.mock.calls[0][0]).toMatchObject({
      name: 'Brief A',
      visibility: 'private',
      configuration: { instructions: 'texte' },
    })
    expect(hasMigratedSceneBriefs()).toBe(true)
  })

  it('ne rejoue rien une fois la migration close', async () => {
    mockedList.mockReturnValue([localBrief('Brief A')])
    await migrateLocalBriefsToTemplates()
    vi.clearAllMocks()

    const second = await migrateLocalBriefsToTemplates()

    expect(second).toEqual({ migrated: 0, skipped: 0, completed: true })
    expect(mockedListApi).not.toHaveBeenCalled()
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  it('ne recrée pas un brief dont le nom existe déjà côté serveur', async () => {
    mockedList.mockReturnValue([localBrief('Déjà passé'), localBrief('Nouveau')])
    mockedListApi.mockResolvedValue([{ name: 'Déjà passé' }] as never)

    const result = await migrateLocalBriefsToTemplates()

    expect(result).toMatchObject({ migrated: 1, skipped: 1 })
    expect(mockedCreate).toHaveBeenCalledTimes(1)
    expect(mockedCreate.mock.calls[0][0].name).toBe('Nouveau')
  })

  /**
   * Le cas qui protège la donnée : si le serveur lâche en cours de route, la migration
   * doit rester ouverte. La refermer perdrait définitivement les briefs non passés.
   */
  it('laisse la migration ouverte quand le serveur échoue en cours de route', async () => {
    mockedList.mockReturnValue([localBrief('A'), localBrief('B'), localBrief('C')])
    mockedCreate
      .mockResolvedValueOnce({ id: '1', warnings: [] } as never)
      .mockRejectedValueOnce(new Error('500'))

    await expect(migrateLocalBriefsToTemplates()).rejects.toThrow('500')

    expect(hasMigratedSceneBriefs()).toBe(false)
  })

  it('reprend sans doublon après un échec partiel', async () => {
    mockedList.mockReturnValue([localBrief('A'), localBrief('B')])
    mockedCreate
      .mockResolvedValueOnce({ id: '1', warnings: [] } as never)
      .mockRejectedValueOnce(new Error('500'))
    await expect(migrateLocalBriefsToTemplates()).rejects.toThrow()

    // Reprise : le serveur porte déjà « A », seul « B » doit partir.
    vi.clearAllMocks()
    mockedList.mockReturnValue([localBrief('A'), localBrief('B')])
    mockedListApi.mockResolvedValue([{ name: 'A' }] as never)
    mockedCreate.mockResolvedValue({ id: '2', warnings: [] } as never)

    const result = await migrateLocalBriefsToTemplates()

    expect(result).toMatchObject({ migrated: 1, skipped: 1, completed: true })
    expect(mockedCreate).toHaveBeenCalledTimes(1)
    expect(mockedCreate.mock.calls[0][0].name).toBe('B')
  })

  it('se clôt sans appel réseau quand il n’y a rien à migrer', async () => {
    mockedList.mockReturnValue([])

    const result = await migrateLocalBriefsToTemplates()

    expect(result).toEqual({ migrated: 0, skipped: 0, completed: true })
    expect(mockedListApi).not.toHaveBeenCalled()
    expect(hasMigratedSceneBriefs()).toBe(true)
  })
})
