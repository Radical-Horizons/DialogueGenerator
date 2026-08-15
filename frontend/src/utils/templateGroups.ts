/**
 * Regroupement des templates par catégorie (affichage « Mes templates »).
 */
import type { Template } from '../types/template'

/**
 * Groupe les templates par `category` en conservant l'ordre d'apparition.
 *
 * @param templates - Liste plate renvoyée par l'API
 * @returns Entrées [catégorie, templates] dans l'ordre de première occurrence
 */
export function groupTemplatesByCategory(templates: Template[]): Array<[string, Template[]]> {
  const groups = new Map<string, Template[]>()
  for (const template of templates) {
    const key = template.category?.trim() || 'Sans catégorie'
    const bucket = groups.get(key)
    if (bucket) {
      bucket.push(template)
    } else {
      groups.set(key, [template])
    }
  }
  return Array.from(groups.entries())
}
