/**
 * Utilitaires pour la gestion des presets
 */
import type { ContextSelection } from '../types/api'
import type { Preset, PresetValidationResult } from '../types/preset'

function remapNames(values: string[], resolvedRefs: Record<string, string>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const canonical = resolvedRefs[value] ?? value
    if (!seen.has(canonical)) {
      seen.add(canonical)
      out.push(canonical)
    }
  }
  return out
}

function remapContextSelections(
  selections: ContextSelection,
  resolvedRefs: Record<string, string>,
): ContextSelection {
  const keys = [
    'characters_full',
    'characters_excerpt',
    'locations_full',
    'locations_excerpt',
    'items_full',
    'items_excerpt',
    'species_full',
    'species_excerpt',
    'communities_full',
    'communities_excerpt',
  ] as const
  const next = { ...selections }
  for (const key of keys) {
    const raw = next[key]
    if (Array.isArray(raw)) {
      next[key] = remapNames(raw, resolvedRefs)
    }
  }
  return next
}

/**
 * Applique les noms canoniques GDD (alias / fuzzy) sur un preset.
 */
export function applyResolvedReferences(
  preset: Preset,
  resolvedRefs: Record<string, string>,
): Preset {
  if (!resolvedRefs || Object.keys(resolvedRefs).length === 0) {
    return preset
  }
  const config = { ...preset.configuration }
  config.characters = remapNames(config.characters ?? [], resolvedRefs)
  config.locations = remapNames(config.locations ?? [], resolvedRefs)
  if (config.region && resolvedRefs[config.region]) {
    config.region = resolvedRefs[config.region]
  }
  if (config.subLocation && resolvedRefs[config.subLocation]) {
    config.subLocation = resolvedRefs[config.subLocation]
  }
  if (config.selectedRegion && resolvedRefs[config.selectedRegion]) {
    config.selectedRegion = resolvedRefs[config.selectedRegion]
  }
  if (config.selectedSubLocations) {
    config.selectedSubLocations = remapNames(config.selectedSubLocations, resolvedRefs)
  }
  if (config.contextSelections) {
    config.contextSelections = remapContextSelections(config.contextSelections, resolvedRefs)
  }
  return { ...preset, configuration: config }
}

/**
 * Prépare un preset pour application (résolution GDD + filtrage obsolètes).
 */
export function preparePresetForApply(
  preset: Preset,
  validation: PresetValidationResult,
): Preset {
  let prepared = applyResolvedReferences(preset, validation.resolvedRefs ?? {})
  if (!validation.valid && validation.obsoleteRefs?.length) {
    prepared = filterObsoleteReferences(prepared, validation.obsoleteRefs)
  }
  return prepared
}

/**
 * Filtre les références obsolètes d'un preset.
 * 
 * Supprime les personnages et lieux obsolètes de la configuration du preset
 * tout en préservant les autres champs (region, subLocation, instructions, etc.).
 * 
 * @param preset - Preset à filtrer
 * @param obsoleteRefs - Liste des références obsolètes (noms de personnages/lieux)
 * @returns Preset filtré avec références obsolètes supprimées
 */
export function filterObsoleteReferences(preset: Preset, obsoleteRefs: string[]): Preset {
  const filteredPreset: Preset = { ...preset }
  filteredPreset.configuration = {
    ...preset.configuration,
    characters: preset.configuration.characters.filter(c => !obsoleteRefs.includes(c)),
    locations: preset.configuration.locations.filter(l => !obsoleteRefs.includes(l))
  }
  return filteredPreset
}
