/**
 * Catalogue unifié de templates : une liste, deux statuts.
 *
 * Un template est un template. Qu'il soit livré avec l'application ou écrit par
 * quelqu'un, la seule chose qui le qualifie est son **statut** : partagé (tout le monde
 * le voit) ou privé (brouillon de son auteur).
 *
 * Ce que je peux faire d'un template ne se dit pas dans une pastille — ça se voit aux
 * boutons présents sur la ligne. Ajouter « fourni » ou « équipe » à côté de « partagé »
 * remettrait une taxonomie là où il n'y a qu'un statut, ce qui est exactement l'erreur
 * que ce chantier corrige — d'abord des sections, puis des provenances.
 */
import type { PrebuiltTemplate, Template } from '../types/template'
import { snapshotContextTokens, templateCategoryKey } from './templateGroups'

/** Le seul statut d'un template. */
export type TemplateVisibility = 'shared' | 'private'

/** Un élément de la liste, quelle que soit son origine. */
export interface CatalogueItem {
  /** Clé de rendu, unique tous types confondus. */
  key: string
  id: string
  name: string
  description: string
  category: string
  icon: string
  visibility: TemplateVisibility
  /** Ce que lit l'utilisateur : « partagé » ou « privé ». */
  badge: string
  /** Décide des actions offertes — jamais de l'affichage du statut. */
  mine: boolean
  /** L'objet d'origine, pour les actions de la ligne. */
  source:
    | { kind: 'prebuilt'; value: PrebuiltTemplate }
    | { kind: 'custom'; value: Template }
}

/** Critères de restriction de la liste. */
export interface CatalogueFilter {
  name?: string
  category?: string
  context?: string
  /** `'tous'` ou l'un des deux statuts. */
  visibility?: 'tous' | TemplateVisibility
}

function badgeFor(visibility: TemplateVisibility): string {
  return visibility === 'private' ? 'privé' : 'partagé'
}

/**
 * Une fiche livrée avec l'application est un template partagé sans propriétaire.
 *
 * Elle n'est pas d'une autre espèce : personne ne peut l'éditer, ce qui se lit à
 * l'absence de boutons, pas à un statut particulier.
 */
function fromPrebuilt(prebuilt: PrebuiltTemplate): CatalogueItem {
  return {
    key: `prebuilt:${prebuilt.id}`,
    id: prebuilt.id,
    name: prebuilt.name,
    description: prebuilt.description,
    category: prebuilt.category,
    icon: prebuilt.icon,
    visibility: 'shared',
    badge: badgeFor('shared'),
    mine: false,
    source: { kind: 'prebuilt', value: prebuilt },
  }
}

function fromTemplate(template: Template): CatalogueItem {
  const visibility: TemplateVisibility = template.visibility === 'private' ? 'private' : 'shared'
  return {
    key: template.id,
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    icon: template.icon,
    visibility,
    badge: badgeFor(visibility),
    mine: template.relation === 'owned',
    source: { kind: 'custom', value: template },
  }
}

/**
 * Réunit tout ce qui est visible en une liste unique.
 *
 * **Rien n'est écarté ici.** Seul un filtre demandé par l'utilisateur retire des
 * éléments — c'est la règle qui manquait, et qui rendait invisibles les templates
 * partagés par un collègue.
 *
 * @param prebuilts Fiches livrées avec l'application.
 * @param templates Templates déjà filtrés par l'ACL côté serveur.
 */
export function buildTemplateCatalog(
  prebuilts: PrebuiltTemplate[],
  templates: Template[],
): CatalogueItem[] {
  return [...prebuilts.map(fromPrebuilt), ...templates.map(fromTemplate)]
}

function includesInsensitive(haystack: string | undefined, needle: string): boolean {
  return (haystack ?? '').toLowerCase().includes(needle.toLowerCase())
}

function contextTokensOf(item: CatalogueItem): string[] {
  return item.source.kind === 'custom'
    ? snapshotContextTokens(item.source.value)
    : [item.source.value.gddSystem, item.source.value.sceneTypeHint].filter(Boolean)
}

/**
 * Restreint la liste aux éléments correspondant aux critères.
 *
 * Un critère vide ne filtre rien : revenir à « tous » restaure la liste complète.
 */
export function filterCatalog(items: CatalogueItem[], filtre: CatalogueFilter): CatalogueItem[] {
  const name = filtre.name?.trim() ?? ''
  const category = filtre.category?.trim() ?? ''
  const context = filtre.context?.trim() ?? ''
  const visibility = filtre.visibility ?? 'tous'

  return items.filter((item) => {
    if (visibility !== 'tous' && item.visibility !== visibility) return false
    if (name && !includesInsensitive(item.name, name)) return false
    if (category) {
      const key =
        item.source.kind === 'custom' ? templateCategoryKey(item.source.value) : item.category
      if (!includesInsensitive(key, category)) return false
    }
    if (context && !contextTokensOf(item).some((token) => includesInsensitive(token, context))) {
      return false
    }
    return true
  })
}
