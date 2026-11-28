/**
 * Fiche de scène ↔ configuration de template (fonctions pures).
 *
 * Un template gardé depuis la fiche a la forme de ceux de la page Générer, qui le
 * recharge : `characters[0]` est le PJ, le lieu est dans `subLocation` ou `region`.
 * Il garde distribution, lieu, brief et fiches liées ; ni tons ni profil.
 */
import type { ContextSelection } from '../types/api'
import type { TemplateConfiguration } from '../types/template'
import type { GddCatalogEntry } from './gddEntityNames'
import {
  emptySelection,
  newLinkedEntries,
  sceneRefFor,
  selectionKeyOf,
  speakerKey,
  type SceneRef,
  type SceneSheet,
} from './sceneSheet'
import { isForbiddenNpc, isPlayableCharacter } from './sceneDramatis'

/** Où le sélecteur de la page Générer range un lieu : région, et sous-lieu éventuel. */
export interface GeneratorPlace {
  region: string
  subLocation?: string
}

const NO_REGION: GeneratorPlace = { region: '' }

/** Un lieu ni région ni rattaché à une région n'a pas de case dans le sélecteur. */
export async function locateGeneratorPlace(
  place: string,
  listRegions: () => Promise<string[]>,
  listSubLocations: (region: string) => Promise<string[]>,
): Promise<GeneratorPlace> {
  const key = speakerKey(place)
  if (!key) return NO_REGION
  const regions = await listRegions()
  const region = regions.find((name) => speakerKey(name) === key)
  if (region) return { region }
  const children = await Promise.all(
    regions.map(async (parent) => ({
      parent,
      // Une région illisible n'emporte pas la recherche dans les autres.
      names: await listSubLocations(parent).catch(() => [] as string[]),
    })),
  )
  for (const { parent, names } of children) {
    const subLocation = names.find((name) => speakerKey(name) === key)
    if (subLocation) return { region: parent, subLocation }
  }
  return NO_REGION
}

function unique(names: string[]): string[] {
  return [...new Set(names.filter(Boolean))]
}

export function buildSceneTemplateConfiguration(
  sheet: SceneSheet,
  options: {
    location?: GeneratorPlace
    /** Le lieu a une fiche GDD : elle part dans le contexte. */
    placeIsEntry: boolean
  },
): TemplateConfiguration {
  const pc = sheet.pc?.name.trim() ?? ''
  const npcs = sheet.npcs.map((npc) => npc.name.trim()).filter(Boolean)
  const place = sheet.place?.name.trim() ?? ''
  const { region, subLocation } = place && options.location ? options.location : NO_REGION
  // Le serveur retire de `locations` un nom absent du GDD : `subLocation` garde le lieu libre.
  const carried = subLocation ?? (place && !options.placeIsEntry ? place : undefined)

  const selections: ContextSelection = emptySelection()
  const add = (key: ReturnType<typeof selectionKeyOf>, name: string) => {
    if (key && !selections[key].includes(name)) selections[key].push(name)
  }
  for (const entry of sheet.linkedEntries) {
    if (entry.name) add(selectionKeyOf(entry), entry.name)
  }
  for (const npc of npcs) {
    if (!selections.characters_excerpt.includes(npc)) add('characters_full', npc)
  }
  if (pc && !selections.characters_full.includes(pc)) add('characters_excerpt', pc)
  if (place && options.placeIsEntry && !selections.locations_excerpt.includes(place)) {
    add('locations_full', place)
  }

  return {
    characters: unique([pc, ...npcs]),
    // Le lieu seul : à la relecture, c'est lui qu'on reprend à défaut de région.
    locations: place ? [place] : [],
    region,
    ...(carried ? { subLocation: carried } : {}),
    sceneType: 'Generic',
    instructions: sheet.brief,
    contextSelections: selections,
    selectedRegion: region || null,
    selectedSubLocations: subLocation ? [subLocation] : [],
  }
}

function placeNameOf(configuration: TemplateConfiguration): string {
  return (
    [
      configuration.selectedSubLocations?.[0],
      configuration.subLocation,
      configuration.selectedRegion,
      configuration.region,
      configuration.locations?.[0],
    ]
      .find((name) => typeof name === 'string' && name.trim())
      ?.trim() ?? ''
  )
}

export interface SceneTemplateCatalogs {
  characters: GddCatalogEntry[]
  locations: GddCatalogEntry[]
  items: GddCatalogEntry[]
  species: GddCatalogEntry[]
  communities: GddCatalogEntry[]
}

/**
 * Remplace distribution, lieu, brief et fiches liées ; tons, profil et autres champs de la
 * fiche restent. Les réglages de modèle du template sont ignorés.
 */
export function applyTemplateToScene(
  sheet: SceneSheet,
  configuration: TemplateConfiguration,
  catalogs: SceneTemplateCatalogs,
): SceneSheet {
  const names = unique((configuration.characters ?? []).map((name) => name.trim()))
  const refs = names.map((name) => sceneRefFor(name, catalogs.characters))
  const pc = refs.find((ref) => isPlayableCharacter(ref.name)) ?? null
  const seen = new Set([speakerKey(pc?.name)])
  const npcs: SceneRef[] = []
  for (const ref of refs) {
    const key = speakerKey(ref.name)
    if (!key || seen.has(key) || isForbiddenNpc(ref.name)) continue
    seen.add(key)
    npcs.push(ref)
  }
  const placeName = placeNameOf(configuration)
  const place = placeName ? sceneRefFor(placeName, catalogs.locations) : null

  const selections: ContextSelection = {
    ...emptySelection(),
    ...(configuration.contextSelections ?? { locations_full: configuration.locations ?? [] }),
  }
  const base: SceneSheet = {
    ...sheet,
    npcs,
    pc,
    place,
    brief: configuration.instructions ?? '',
    linkedEntries: [],
  }
  return { ...base, linkedEntries: newLinkedEntries(selections, { ...catalogs }, base) }
}

export function isSceneSheetFilled(sheet: SceneSheet): boolean {
  return Boolean(
    sheet.npcs.length ||
      sheet.pc ||
      sheet.place ||
      sheet.brief.trim() ||
      sheet.linkedEntries.length,
  )
}

/** Ce qu'un template apporterait à la fiche, avant de l'appliquer. */
export function describeSceneTemplate(configuration: TemplateConfiguration): string {
  const count = (value: number, word: string) => `${value} ${word}${value > 1 ? 's' : ''}`
  const characters = unique(configuration.characters ?? []).length
  const parts = [
    characters ? count(characters, 'personnage') : 'sans distribution',
    placeNameOf(configuration) || 'sans lieu',
    configuration.instructions?.trim() ? 'brief' : 'sans brief',
  ]
  return parts.join(' · ')
}
