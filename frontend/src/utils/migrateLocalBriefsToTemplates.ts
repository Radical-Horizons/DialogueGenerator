/**
 * Migration des briefs de scène nommés du navigateur vers les templates serveur.
 *
 * « Mes briefs (ce navigateur) » et « Mes templates » désignaient la même chose et ne
 * différaient que par leur lieu de stockage. Un brief local disparaissait au changement
 * de navigateur, sans que rien ne le dise.
 *
 * La migration **copie** : rien n'est effacé du `localStorage`, seul un marqueur empêche
 * la répétition. Un échec laisse l'utilisateur exactement où il était, et la reprise se
 * fait par nom pour ne pas dupliquer ce qui est déjà passé.
 */
import { createTemplateApi, listTemplatesApi } from '../api/templates'


const LEGACY_SCENE_KEY = 'dialogue_generator_named_templates_scene_v1'
const MIGRATION_MARKER_KEY = 'dialogue_generator_scene_briefs_migrated_v1'

interface LegacyNamedBrief {
  id: string
  name: string
  body: string
}

/** Lit la clé héritée des briefs nommés ; tolère un contenu illisible. */
function listLocalSceneTemplates(): LegacyNamedBrief[] {
  try {
    const raw = localStorage.getItem(LEGACY_SCENE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is LegacyNamedBrief =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as LegacyNamedBrief).name === 'string',
    )
  } catch {
    return []
  }
}

export interface BriefMigrationResult {
  /** Templates créés pendant cet appel. */
  migrated: number
  /** Briefs ignorés parce qu'un template portait déjà leur nom. */
  skipped: number
  /** La migration est-elle désormais close ? */
  completed: boolean
}

const NOTHING_TO_DO: BriefMigrationResult = { migrated: 0, skipped: 0, completed: true }

/** La migration a-t-elle déjà abouti sur ce navigateur ? */
export function hasMigratedSceneBriefs(): boolean {
  try {
    return localStorage.getItem(MIGRATION_MARKER_KEY) === '1'
  } catch {
    // Stockage indisponible (mode privé strict) : on ne migre pas, on ne casse rien.
    return true
  }
}

function markMigrated(): void {
  try {
    localStorage.setItem(MIGRATION_MARKER_KEY, '1')
  } catch {
    // Sans marqueur la migration se rejouera, mais la reprise par nom évite les doublons.
  }
}

/**
 * Convertit les briefs locaux en templates privés.
 *
 * Le marqueur n'est posé qu'en cas de succès **complet** : un échec partiel laisse la
 * migration ouverte, et le prochain démarrage reprend là où il s'était arrêté.
 *
 * @returns Compte de ce qui a été créé, ignoré, et si la migration est close.
 */
export async function migrateLocalBriefsToTemplates(): Promise<BriefMigrationResult> {
  if (hasMigratedSceneBriefs()) {
    return NOTHING_TO_DO
  }

  const locals = listLocalSceneTemplates()
  if (locals.length === 0) {
    markMigrated()
    return NOTHING_TO_DO
  }

  // Reprise par nom : ce qui est déjà passé lors d'une tentative précédente ne doit
  // pas être recréé. On lit la liste serveur une seule fois.
  const existingNames = new Set((await listTemplatesApi()).map((t) => t.name.trim()))

  let migrated = 0
  let skipped = 0
  for (const local of locals) {
    const name = local.name.trim()
    if (!name || existingNames.has(name)) {
      skipped += 1
      continue
    }
    await createTemplateApi({
      name,
      description: 'Brief importé depuis ce navigateur',
      category: 'Brief',
      icon: '📝',
      // Un brief n'a que son texte : le reste de la configuration reste au défaut,
      // l'utilisateur le complètera s'il veut en faire un vrai template.
      configuration: {
        characters: [],
        locations: [],
        region: '',
        sceneType: 'Generic',
        instructions: local.body,
      },
      // Un import n'est pas une décision de partage : il arrive en brouillon.
      visibility: 'private',
    })
    existingNames.add(name)
    migrated += 1
  }

  markMigrated()
  return { migrated, skipped, completed: true }
}
