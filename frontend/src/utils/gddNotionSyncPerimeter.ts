/**
 * Règles de périmètre des bases Notion à synchroniser.
 *
 * Partagé entre le hook de config (qui persiste le filtre) et le hook de périmètre
 * (qui le dérive pour l'UI) : une liste vide signifie « aucun filtre », donc toutes
 * les sources — bases **et** fiches page.
 */
import type { GddNotionSyncConfigPublic } from '../api/gddNotionSync'

/** True si ``categoryFile`` est couvert par ``includedCategories`` (liste vide = tout). */
export function categoryFileMatchesIncluded(
  categoryFile: string,
  includedCategories: string[],
): boolean {
  const normalized = new Set(
    includedCategories.map((x) => x.trim().toLowerCase()).filter(Boolean),
  )
  if (normalized.size === 0) {
    return true
  }
  const raw = (categoryFile || '').trim().toLowerCase()
  const stem = raw.endsWith('.json') ? raw.slice(0, -5) : raw
  for (const f of normalized) {
    if (f === raw || f === stem) {
      return true
    }
  }
  return false
}

/** Cases à cocher à afficher pour une config serveur donnée. */
export function deriveIncludedDbFilesFromConfig(c: GddNotionSyncConfigPublic): string[] {
  const inc = c.included_categories || []
  const dbs = (c.sources || []).filter((s) => s.kind === 'database')
  if (inc.length === 0) {
    return dbs.map((s) => s.category_file)
  }
  return dbs
    .filter((s) => categoryFileMatchesIncluded(s.category_file, inc))
    .map((s) => s.category_file)
}

/**
 * Traduit une sélection de cases en payload ``included_categories``.
 *
 * « Toutes cochées » et « aucune cochée » renvoient tous deux ``[]`` — l'absence de
 * filtre — car c'est la représentation serveur du périmètre complet.
 */
export function computeIncludedCategoriesPayloadFromSelection(
  sources: GddNotionSyncConfigPublic['sources'],
  selectedFiles: string[],
): string[] {
  const dbs = (sources ?? []).filter((s) => s.kind === 'database')
  const allDbFiles = dbs.map((s) => s.category_file).sort()
  const sortedSel = [...selectedFiles].sort()
  const allSelected =
    dbs.length > 0 &&
    sortedSel.length === allDbFiles.length &&
    sortedSel.every((f, i) => f === allDbFiles[i])
  if (dbs.length === 0 || sortedSel.length === 0 || allSelected) {
    return []
  }
  return sortedSel
}
