/**
 * Le catalogue de templates : une liste, deux statuts.
 *
 * Un template est un template. Presets et fiches livrées avec l'application ont
 * convergé côté serveur (`TemplateConvergenceService`), il n'y a donc plus qu'un objet
 * réutilisable — et plus rien qui soit affiché sans pouvoir être modifié.
 *
 * La seule chose qui qualifie un template est son **statut** : partagé (toute l'équipe
 * le voit) ou privé (brouillon de son auteur). Ce que je peux en faire se voit aux
 * boutons de la ligne, pas dans une pastille de plus.
 */
import type { Template } from '../types/template'
import { snapshotContextTokens, templateCategoryKey } from './templateGroups'

/** Le seul statut d'un template. */
export type TemplateVisibility = 'shared' | 'private'

/** Un élément de la liste. */
export interface CatalogueItem {
  key: string
  id: string
  name: string
  description: string
  category: string
  icon: string
  visibility: TemplateVisibility
  /** Ce que lit l'utilisateur : « partagé » ou « privé ». */
  badge: string
  /** L'objet d'origine, pour les actions de la ligne. */
  template: Template
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
 * Construit la liste affichable.
 *
 * **Rien n'est écarté ici.** Seul un filtre demandé par l'utilisateur retire des
 * éléments — c'est la règle qui manquait, et qui rendait invisibles les templates
 * partagés par un collègue.
 *
 * @param templates Templates déjà filtrés par l'ACL côté serveur.
 */
export function buildTemplateCatalog(templates: Template[]): CatalogueItem[] {
  return templates.map((template) => {
    const visibility: TemplateVisibility =
      template.visibility === 'private' ? 'private' : 'shared'
    return {
      key: template.id,
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      icon: template.icon,
      visibility,
      badge: badgeFor(visibility),
      template,
    }
  })
}

function includesInsensitive(haystack: string | undefined, needle: string): boolean {
  return (haystack ?? '').toLowerCase().includes(needle.toLowerCase())
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
    if (category && !includesInsensitive(templateCategoryKey(item.template), category)) return false
    if (
      context &&
      !snapshotContextTokens(item.template).some((token) => includesInsensitive(token, context))
    ) {
      return false
    }
    return true
  })
}
