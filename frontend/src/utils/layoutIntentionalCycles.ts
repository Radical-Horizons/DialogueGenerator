/**
 * Cycles de validation marqués intentionnels, persistés dans le sidecar layout (FR41 / epic 4).
 * Clé stable partagée chargement ↔ sauvegarde.
 */
export const LAYOUT_INTENTIONAL_CYCLE_IDS_KEY = 'intentionalCycleIds' as const

/**
 * Extrait la liste des `cycle_id` intentionnels depuis un blob layout API.
 */
export function readIntentionalCycleIdsFromLayout(
  layout: Record<string, unknown> | null | undefined
): string[] {
  if (!layout) {
    return []
  }
  const raw = layout[LAYOUT_INTENTIONAL_CYCLE_IDS_KEY]
  if (!Array.isArray(raw)) {
    return []
  }
  return raw.filter((x): x is string => typeof x === 'string')
}

/**
 * Fusionne les ids intentionnels dans le layout à envoyer au PUT /layout.
 */
export function mergeIntentionalCycleIdsIntoLayout(
  layout: Record<string, unknown>,
  cycleIds: readonly string[]
): Record<string, unknown> {
  return { ...layout, [LAYOUT_INTENTIONAL_CYCLE_IDS_KEY]: [...cycleIds] }
}
