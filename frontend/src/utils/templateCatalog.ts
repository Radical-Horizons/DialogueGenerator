/**
 * Catalogue unifié de templates : une seule liste, une pastille par ligne.
 *
 * La visibilité est un **statut porté par l'élément**, pas une catégorie qui découpe
 * l'écran. Le sélecteur empilait auparavant « Templates pré-built » et « Mes templates »,
 * héritage du partage nominatif retiré : deux listes pour une même chose, séparées par un
 * critère qui n'intéresse pas l'utilisateur. C'est l'erreur que l'epic 6 devait supprimer.
 *
 * Conséquence directe de ce découpage : un template partagé par un collègue était filtré
 * hors de « Mes templates » sans qu'aucune section ne l'affiche — donc invisible, alors que
 * « partagé » est le statut par défaut.
 */
import type { PrebuiltTemplate, Template } from '../types/template'
import { snapshotContextTokens, templateCategoryKey } from './templateGroups'

/** D'où vient un élément, du point de vue de celui qui regarde la liste. */
export type TemplateProvenance = 'fourni' | 'mien' | 'equipe'

/** Un élément de la liste unique, quelle que soit son origine. */
export interface CatalogueItem {
  /** Clé de rendu, unique tous types confondus. */
  key: string
  id: string
  name: string
  description: string
  category: string
  icon: string
  provenance: TemplateProvenance
  /** Statut persisté ; `null` pour une fiche du catalogue, qui n'en a pas. */
  visibility: 'shared' | 'private' | null
  /** Ce que lit l'utilisateur : provenance et statut d'un coup. */
  badge: string
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
  /** `'tous'` ou une provenance ; `'brouillons'` restreint à mes seuls `private`. */
  provenance?: 'tous' | TemplateProvenance | 'brouillons'
}

/**
 * Traduit `relation` en provenance lisible.
 *
 * `legacy` (aucun propriétaire) est rendu comme « équipe » : l'utilisateur voit un template
 * dont il n'est pas propriétaire. Que seul un admin puisse l'écrire se lit déjà à l'absence
 * de bouton d'édition — pas besoin d'une pastille de plus pour le dire.
 */
function provenanceFromRelation(relation: Template['relation']): TemplateProvenance {
  return relation === 'owned' ? 'mien' : 'equipe'
}

function badgeFor(provenance: TemplateProvenance, visibility: CatalogueItem['visibility']): string {
  if (provenance === 'fourni') return 'fourni'
  if (provenance === 'equipe') return 'équipe'
  return visibility === 'private' ? 'privé' : 'partagé'
}

/** Construit l'item d'une fiche du catalogue fourni. */
function fromPrebuilt(prebuilt: PrebuiltTemplate): CatalogueItem {
  return {
    key: `prebuilt:${prebuilt.id}`,
    id: prebuilt.id,
    name: prebuilt.name,
    description: prebuilt.description,
    category: prebuilt.category,
    icon: prebuilt.icon,
    provenance: 'fourni',
    visibility: null,
    badge: badgeFor('fourni', null),
    source: { kind: 'prebuilt', value: prebuilt },
  }
}

/** Construit l'item d'un template custom, le mien ou celui d'un collègue. */
function fromTemplate(template: Template): CatalogueItem {
  const provenance = provenanceFromRelation(template.relation)
  const visibility = template.visibility ?? 'shared'
  return {
    key: template.id,
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    icon: template.icon,
    provenance,
    visibility,
    badge: badgeFor(provenance, visibility),
    source: { kind: 'custom', value: template },
  }
}

/**
 * Réunit catalogue fourni et templates custom en une liste unique.
 *
 * **Rien n'est écarté ici.** Seul un filtre demandé par l'utilisateur retire des éléments —
 * c'est la règle qui manquait, et qui rendait les templates d'équipe invisibles.
 *
 * @param prebuilts Fiches du catalogue versionné.
 * @param templates Templates custom déjà filtrés par l'ACL côté serveur.
 * @returns Les items, fiches fournies d'abord, puis les custom dans l'ordre reçu.
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

/** Tokens de contexte d'un item, pour le filtre « contexte ». */
function contextTokensOf(item: CatalogueItem): string[] {
  return item.source.kind === 'custom'
    ? snapshotContextTokens(item.source.value)
    : [item.source.value.gddSystem, item.source.value.sceneTypeHint].filter(Boolean)
}

function matchesProvenance(item: CatalogueItem, filtre: CatalogueFilter['provenance']): boolean {
  if (!filtre || filtre === 'tous') return true
  if (filtre === 'brouillons') return item.provenance === 'mien' && item.visibility === 'private'
  return item.provenance === filtre
}

/**
 * Restreint la liste aux items correspondant aux critères.
 *
 * Un critère vide ne filtre rien : revenir à « tous » restaure la liste complète sans
 * qu'aucune donnée n'ait été perdue en chemin.
 */
export function filterCatalog(items: CatalogueItem[], filtre: CatalogueFilter): CatalogueItem[] {
  const name = filtre.name?.trim() ?? ''
  const category = filtre.category?.trim() ?? ''
  const context = filtre.context?.trim() ?? ''

  return items.filter((item) => {
    if (!matchesProvenance(item, filtre.provenance)) return false
    if (name && !includesInsensitive(item.name, name)) return false
    if (category) {
      const key =
        item.source.kind === 'custom'
          ? templateCategoryKey(item.source.value)
          : item.category
      if (!includesInsensitive(key, category)) return false
    }
    if (context && !contextTokensOf(item).some((token) => includesInsensitive(token, context))) {
      return false
    }
    return true
  })
}
