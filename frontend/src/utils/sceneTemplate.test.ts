import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { usePresetManagement } from '../hooks/usePresetManagement'
import { useContextStore } from '../store/contextStore'
import { useGenerationStore } from '../store/generationStore'
import { preparePresetForApply } from './presetUtils'
import type { SceneSheet } from './sceneSheet'
import {
  applyTemplateToScene,
  buildSceneTemplateConfiguration,
  isSceneSheetFilled,
  locateGeneratorPlace,
  type SceneTemplateCatalogs,
} from './sceneTemplate'

const CATALOGS: SceneTemplateCatalogs = {
  characters: [
    { name: "Grish T'vok", data: { notion_page_id: 'p-grish' } },
    { name: 'Korga', data: { notion_page_id: 'p-korga' } },
    { name: 'Vethraak', data: { notion_page_id: 'p-veth' } },
    { name: 'Maro', data: {} },
  ],
  locations: [{ name: 'La Forge', data: { notion_page_id: 'p-forge' } }],
  items: [{ name: 'Marteau', data: {} }],
  species: [],
  communities: [],
}

const SHEET: SceneSheet = {
  npcs: [
    { name: "Grish T'vok", entryId: 'p-grish' },
    { name: 'Korga', entryId: 'p-korga' },
  ],
  pc: { name: 'Vethraak', entryId: 'p-veth' },
  place: { name: 'La Forge', entryId: 'p-forge' },
  brief: 'Un marché avec @Maro.',
  linkedEntries: [
    { category: 'items', name: 'Marteau', mode: 'excerpt', entryId: null },
    { category: 'characters', name: 'Maro', mode: 'full', entryId: null },
    { category: 'chapters', name: 'Chapitre 1', entryId: null },
  ],
  tones: ['tension'],
  authorProfileId: 'voix-1',
}

const EMPTY: SceneSheet = { npcs: [], pc: null, place: null, brief: '', linkedEntries: [] }

const LOCATION = { region: 'Les Fonderies', subLocation: 'La Forge' }

const configuration = () =>
  buildSceneTemplateConfiguration(SHEET, { location: LOCATION, placeIsEntry: true })

describe('fiche → template', () => {
  it('garde distribution, lieu, brief et fiches liées ; ni tons, ni profil, ni modèle', () => {
    const result = configuration()

    expect(result).toMatchObject({
      characters: ['Vethraak', "Grish T'vok", 'Korga'],
      locations: ['La Forge'],
      region: 'Les Fonderies',
      subLocation: 'La Forge',
      instructions: 'Un marché avec @Maro.',
    })
    expect(result.contextSelections).toMatchObject({
      characters_full: ['Maro', "Grish T'vok", 'Korga'],
      characters_excerpt: ['Vethraak'],
      locations_full: ['La Forge'],
      items_excerpt: ['Marteau'],
      chapters: ['Chapitre 1'],
    })
    expect(JSON.stringify(result)).not.toMatch(/tension|voix-1|llmModel/)
  })

  it('lieu libre : gardé sans région ni fiche de contexte', () => {
    const result = buildSceneTemplateConfiguration(
      { ...SHEET, place: { name: 'Sous un pont', entryId: null } },
      { placeIsEntry: false },
    )

    expect(result).toMatchObject({
      locations: ['Sous un pont'],
      region: '',
      subLocation: 'Sous un pont',
      selectedSubLocations: [],
    })
    expect(result.contextSelections?.locations_full).toEqual([])
    // Tel que le serveur le rend : le nom absent du GDD est retiré de `locations`.
    expect(applyTemplateToScene(EMPTY, { ...result, locations: [] }, CATALOGS).place).toEqual({
      name: 'Sous un pont',
      entryId: null,
    })
  })

  it('lieu du GDD sous aucune région : pas de sous-lieu inventé', () => {
    const result = buildSceneTemplateConfiguration(SHEET, {
      location: { region: '' },
      placeIsEntry: true,
    })

    expect(result).not.toHaveProperty('subLocation')
    expect(applyTemplateToScene(EMPTY, result, CATALOGS).place).toEqual(SHEET.place)
  })

  it('sans lieu : une fiche de lieu liée ne le devient pas', () => {
    const result = buildSceneTemplateConfiguration(
      {
        ...SHEET,
        place: null,
        linkedEntries: [{ category: 'locations', name: 'La Forge', mode: 'full', entryId: null }],
      },
      { placeIsEntry: false },
    )

    const applied = applyTemplateToScene(EMPTY, result, CATALOGS)

    expect(applied.place).toBeNull()
    expect(applied.linkedEntries.map((entry) => entry.name)).toEqual(['La Forge'])
  })
})

describe('template → fiche', () => {
  it('relit ce que la fiche avait gardé, sans toucher aux tons ni au profil', () => {
    const applied = applyTemplateToScene(
      { ...EMPTY, tones: ['humour'], authorProfileId: 'voix-2' },
      configuration(),
      CATALOGS,
    )

    expect(applied).toMatchObject({
      npcs: SHEET.npcs,
      pc: SHEET.pc,
      place: SHEET.place,
      brief: SHEET.brief,
      tones: ['humour'],
      authorProfileId: 'voix-2',
    })
    expect(applied.linkedEntries.map((entry) => [entry.category, entry.name, entry.mode])).toEqual([
      ['characters', 'Maro', 'full'],
      ['items', 'Marteau', 'excerpt'],
      ['chapters', 'Chapitre 1', undefined],
    ])
  })

  it('remplace : un template sans distribution vide la distribution et le lieu', () => {
    const applied = applyTemplateToScene(
      SHEET,
      {
        characters: [],
        locations: [],
        region: '',
        sceneType: 'Generic',
        instructions: 'Ton tendu.',
      },
      CATALOGS,
    )

    expect(applied).toMatchObject({
      npcs: [],
      pc: null,
      place: null,
      brief: 'Ton tendu.',
      linkedEntries: [],
      tones: ['tension'],
    })
  })

  it('une fiche vide n’appelle pas de confirmation', () => {
    expect(isSceneSheetFilled(EMPTY)).toBe(false)
    expect(isSceneSheetFilled({ ...EMPTY, brief: '  ' })).toBe(false)
    expect(isSceneSheetFilled({ ...EMPTY, brief: 'x' })).toBe(true)
  })
})

describe('lieu dans le sélecteur de la page Générer', () => {
  const regions = async () => ['Les Fonderies', 'Le Port']
  const children = async (region: string) => (region === 'Les Fonderies' ? ['La Forge'] : [])

  it.each([
    ['Le Port', { region: 'Le Port' }],
    ['La Forge', { region: 'Les Fonderies', subLocation: 'La Forge' }],
    ['Sous un pont', { region: '' }],
  ])('%s', async (place, expected) => {
    await expect(locateGeneratorPlace(place, regions, children)).resolves.toEqual(expected)
  })
})

describe('rechargement par la page Générer', () => {
  beforeEach(() => {
    useContextStore.getState().clearSelections()
  })

  it('retrouve PJ, PNJ, lieu, brief et fiches liées', () => {
    const { result } = renderHook(() =>
      usePresetManagement({
        userInstructions: '',
        setUserInstructions: instructions,
        setIsDirty: vi.fn(),
        setSaveStatus: vi.fn(),
        toast: vi.fn(),
      }),
    )

    act(() => {
      result.current.applyPreset({
        id: 'p',
        name: 'Scène',
        icon: '📋',
        metadata: { created: '', modified: '' },
        configuration: configuration(),
      })
    })

    expect(useGenerationStore.getState().sceneSelection).toEqual({
      characterA: 'Vethraak',
      characterB: "Grish T'vok",
      sceneRegion: 'Les Fonderies',
      subLocation: 'La Forge',
    })
    expect(instructions).toHaveBeenCalledWith(SHEET.brief)
    expect(useContextStore.getState().selections).toMatchObject({
      characters_excerpt: ['Vethraak'],
      locations_full: ['La Forge'],
      items_excerpt: ['Marteau'],
    })
    expect(useContextStore.getState().selectedRegion).toBe('Les Fonderies')
  })

  it('lieu libre : une fois la référence obsolète écartée, ni région ni sous-lieu', () => {
    const { result } = renderHook(() =>
      usePresetManagement({
        userInstructions: '',
        setUserInstructions: instructions,
        setIsDirty: vi.fn(),
        setSaveStatus: vi.fn(),
        toast: vi.fn(),
      }),
    )
    const saved = buildSceneTemplateConfiguration(
      { ...SHEET, place: { name: 'Sous un pont', entryId: null } },
      { placeIsEntry: false },
    )
    const prepared = preparePresetForApply(
      {
        id: 'p',
        name: 'Scène',
        icon: '📋',
        metadata: { created: '', modified: '' },
        configuration: { ...saved, locations: [] },
      },
      { valid: false, warnings: [], obsoleteRefs: ['Sous un pont'] },
    )

    act(() => result.current.applyPreset(prepared))

    expect(useGenerationStore.getState().sceneSelection).toMatchObject({
      sceneRegion: null,
      subLocation: null,
    })
    expect(useContextStore.getState().selectedSubLocations).toEqual([])
  })
})

const instructions = vi.fn()
