/**
 * Migration des profils d'auteur du navigateur vers le serveur.
 *
 * Même contrat que celle des briefs : copie, marqueur au succès complet, reprise par
 * nom. Le risque tenu est la perte de donnée utilisateur.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  migrateLocalAuthorProfiles,
  hasMigratedAuthorProfiles,
} from './migrateLocalAuthorProfiles'
import { createAuthorProfileApi, listAuthorProfilesApi } from '../api/authorProfiles'

vi.mock('../api/authorProfiles', () => ({
  createAuthorProfileApi: vi.fn(),
  listAuthorProfilesApi: vi.fn(),
}))

const mockedList = vi.mocked(listAuthorProfilesApi)
const mockedCreate = vi.mocked(createAuthorProfileApi)

const LEGACY_AUTHOR_KEY = 'dialogue_generator_named_templates_author_v1'

function localProfile(name: string, body = 'voix') {
  return { id: `local-${name}`, name, body, updatedAt: '2026-08-19T00:00:00Z' }
}

function seedLocalProfiles(...profiles: ReturnType<typeof localProfile>[]): void {
  localStorage.setItem(LEGACY_AUTHOR_KEY, JSON.stringify(profiles))
}

describe('migrateLocalAuthorProfiles', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mockedList.mockResolvedValue([])
    mockedCreate.mockResolvedValue({ id: 'srv' } as never)
  })

  it('convertit chaque profil local en profil serveur privé', async () => {
    seedLocalProfiles(localProfile('Voix A'), localProfile('Voix B'))

    const result = await migrateLocalAuthorProfiles()

    expect(result).toEqual({ migrated: 2, skipped: 0, completed: true })
    expect(mockedCreate).toHaveBeenCalledTimes(2)
    expect(mockedCreate.mock.calls[0][0]).toMatchObject({
      name: 'Voix A',
      content: 'voix',
      visibility: 'private',
    })
    expect(hasMigratedAuthorProfiles()).toBe(true)
  })

  it('ne rejoue rien une fois la migration close', async () => {
    seedLocalProfiles(localProfile('Voix A'))
    await migrateLocalAuthorProfiles()
    vi.clearAllMocks()

    const second = await migrateLocalAuthorProfiles()

    expect(second).toEqual({ migrated: 0, skipped: 0, completed: true })
    expect(mockedList).not.toHaveBeenCalled()
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  it('ne recrée pas un profil dont le nom existe déjà côté serveur', async () => {
    seedLocalProfiles(localProfile('Déjà passé'), localProfile('Nouveau'))
    mockedList.mockResolvedValue([{ name: 'Déjà passé' }] as never)

    const result = await migrateLocalAuthorProfiles()

    expect(result).toMatchObject({ migrated: 1, skipped: 1 })
    expect(mockedCreate.mock.calls[0][0].name).toBe('Nouveau')
  })

  /** Si le serveur lâche, la migration doit rester ouverte : la refermer perdrait le reste. */
  it('laisse la migration ouverte quand le serveur échoue en cours de route', async () => {
    seedLocalProfiles(localProfile('A'), localProfile('B'))
    mockedCreate
      .mockResolvedValueOnce({ id: '1' } as never)
      .mockRejectedValueOnce(new Error('500'))

    await expect(migrateLocalAuthorProfiles()).rejects.toThrow('500')

    expect(hasMigratedAuthorProfiles()).toBe(false)
  })

  it('se clôt sans appel réseau quand il n’y a rien à migrer', async () => {
    const result = await migrateLocalAuthorProfiles()

    expect(result).toEqual({ migrated: 0, skipped: 0, completed: true })
    expect(mockedList).not.toHaveBeenCalled()
    expect(hasMigratedAuthorProfiles()).toBe(true)
  })

  it('ignore une clé héritée illisible sans lever', async () => {
    localStorage.setItem(LEGACY_AUTHOR_KEY, 'pas du JSON')

    const result = await migrateLocalAuthorProfiles()

    expect(result).toEqual({ migrated: 0, skipped: 0, completed: true })
  })
})
