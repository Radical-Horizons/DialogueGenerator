import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGddNotionSyncPerimeter } from './useGddNotionSyncPerimeter'
import type { GddNotionSyncConfigPublic } from '../api/gddNotionSync'

function makeConfig(): GddNotionSyncConfigPublic {
  return {
    sources: [
      { kind: 'database', notion_id: 'db-a', category_file: 'Alpha.json' },
      { kind: 'database', notion_id: 'db-b', category_file: 'Beta.json' },
      { kind: 'page', notion_id: 'pg-a', category_file: 'Fiche.json' },
    ],
    included_categories: [],
  } as unknown as GddNotionSyncConfigPublic
}

function setup(config: GddNotionSyncConfigPublic | null, includedDbFiles: string[] = []) {
  const setIncludedDbFiles = vi.fn()
  const persistIncludedPerimeter = vi.fn().mockResolvedValue(undefined)
  const view = renderHook(() =>
    useGddNotionSyncPerimeter({
      config,
      includedDbFiles,
      setIncludedDbFiles,
      persistIncludedPerimeter,
    }),
  )
  return { view, setIncludedDbFiles, persistIncludedPerimeter }
}

describe('useGddNotionSyncPerimeter — filtre du run', () => {
  it('renvoie undefined tant que la config n’est pas chargée', () => {
    const { view } = setup(null)
    // Renvoyer [] ici lèverait le filtre et lancerait un run sur toutes les sources
    // (bases + fiches page) au lieu du périmètre persisté.
    expect(view.result.current.runIncludedCategories()).toBeUndefined()
  })

  it('renvoie [] quand toutes les bases sont cochées (pas de filtre)', () => {
    const { view } = setup(makeConfig(), ['Alpha.json', 'Beta.json'])
    expect(view.result.current.runIncludedCategories()).toEqual([])
  })

  it('renvoie [] quand aucune base n’est cochée', () => {
    const { view } = setup(makeConfig(), [])
    expect(view.result.current.runIncludedCategories()).toEqual([])
  })

  it('renvoie la sélection triée quand elle est partielle', () => {
    const { view } = setup(makeConfig(), ['Beta.json'])
    expect(view.result.current.runIncludedCategories()).toEqual(['Beta.json'])
  })
})

describe('useGddNotionSyncPerimeter — dérivations et raccourcis', () => {
  it('ne compte que les sources database, triées par nom', () => {
    const { view } = setup(makeConfig())
    expect(view.result.current.dbCount).toBe(2)
    expect(view.result.current.pageCount).toBe(1)
    expect(view.result.current.databaseSources.map((s) => s.category_file)).toEqual([
      'Alpha.json',
      'Beta.json',
    ])
  })

  it('runScopeDbCount vaut null sans filtre, et le nombre de bases sinon', () => {
    expect(setup(makeConfig(), ['Alpha.json', 'Beta.json']).view.result.current.runScopeDbCount).toBeNull()
    expect(setup(makeConfig(), ['Alpha.json']).view.result.current.runScopeDbCount).toBe(1)
  })

  it('« Tout décocher » ne persiste pas — le périmètre serveur reste inchangé', () => {
    const { view, setIncludedDbFiles, persistIncludedPerimeter } = setup(makeConfig(), [
      'Alpha.json',
    ])
    act(() => {
      view.result.current.uncheckAllDatabaseSources()
    })
    expect(setIncludedDbFiles).toHaveBeenCalledWith([])
    expect(persistIncludedPerimeter).not.toHaveBeenCalled()
  })

  it('« Tout cocher » persiste la sélection complète', () => {
    const { view, persistIncludedPerimeter } = setup(makeConfig(), [])
    act(() => {
      view.result.current.checkAllDatabaseSources()
    })
    expect(persistIncludedPerimeter).toHaveBeenCalledWith(['Alpha.json', 'Beta.json'])
  })
})
