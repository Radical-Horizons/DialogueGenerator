/**
 * Migration des profils d'auteur nommés du navigateur vers le serveur.
 *
 * Même contrat que la migration des briefs : on **copie**, rien n'est effacé du
 * `localStorage`, un marqueur empêche la répétition, et la reprise se fait par nom.
 * Un échec laisse l'utilisateur exactement où il était.
 */
import { createAuthorProfileApi, listAuthorProfilesApi } from '../api/authorProfiles'

const LEGACY_AUTHOR_KEY = 'dialogue_generator_named_templates_author_v1'
const MIGRATION_MARKER_KEY = 'dialogue_generator_author_profiles_migrated_v1'

export interface AuthorProfileMigrationResult {
  migrated: number
  skipped: number
  completed: boolean
}

const NOTHING_TO_DO: AuthorProfileMigrationResult = { migrated: 0, skipped: 0, completed: true }

interface LegacyNamedProfile {
  id: string
  name: string
  body: string
}

/** La migration a-t-elle déjà abouti sur ce navigateur ? */
export function hasMigratedAuthorProfiles(): boolean {
  try {
    return localStorage.getItem(MIGRATION_MARKER_KEY) === '1'
  } catch {
    // Stockage indisponible : on ne migre pas, on ne casse rien.
    return true
  }
}

function markMigrated(): void {
  try {
    localStorage.setItem(MIGRATION_MARKER_KEY, '1')
  } catch {
    // Sans marqueur la migration se rejouera ; la reprise par nom évite les doublons.
  }
}

function readLegacyProfiles(): LegacyNamedProfile[] {
  try {
    const raw = localStorage.getItem(LEGACY_AUTHOR_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is LegacyNamedProfile =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as LegacyNamedProfile).name === 'string',
    )
  } catch {
    return []
  }
}

/**
 * Convertit les profils locaux nommés en profils serveur privés.
 *
 * Le marqueur n'est posé qu'en cas de succès complet.
 *
 * @returns Compte de ce qui a été créé, ignoré, et si la migration est close.
 */
export async function migrateLocalAuthorProfiles(): Promise<AuthorProfileMigrationResult> {
  if (hasMigratedAuthorProfiles()) {
    return NOTHING_TO_DO
  }

  const locals = readLegacyProfiles()
  if (locals.length === 0) {
    markMigrated()
    return NOTHING_TO_DO
  }

  const existingNames = new Set((await listAuthorProfilesApi()).map((p) => p.name.trim()))

  let migrated = 0
  let skipped = 0
  for (const local of locals) {
    const name = local.name.trim()
    if (!name || existingNames.has(name)) {
      skipped += 1
      continue
    }
    await createAuthorProfileApi({
      name,
      description: 'Profil importé depuis ce navigateur',
      content: local.body ?? '',
      // Un import n'est pas une décision de partage : il arrive en brouillon.
      visibility: 'private',
    })
    existingNames.add(name)
    migrated += 1
  }

  markMigrated()
  return { migrated, skipped, completed: true }
}
