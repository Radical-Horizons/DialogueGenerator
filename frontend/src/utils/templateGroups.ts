/**
 * Regroupement et filtrage des templates (affichage « Mes templates »).
 */
import type { Template } from '../types/template'

/** Critères de filtre client (sous-chaîne, insensible à la casse). Champs vides = pas de contrainte. */
export interface TemplateFilterQuery {
  name?: string
  category?: string
  context?: string
}

function includesInsensitive(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase())
}

function templateCategoryKey(template: Template): string {
  return template.category?.trim() || 'Sans catégorie'
}

function collectStringLists(value: unknown, into: string[]): void {
  if (!Array.isArray(value)) {
    return
  }
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) {
      into.push(item)
    }
  }
}

function snapshotContextTokens(template: Template): string[] {
  const cfg = template.configuration
  const tokens: string[] = [
    ...cfg.characters,
    ...cfg.locations,
    cfg.region,
    cfg.subLocation ?? '',
    cfg.selectedRegion ?? '',
    ...(cfg.selectedSubLocations ?? []),
  ].filter((token): token is string => Boolean(token && token.trim()))

  const selections = cfg.contextSelections
  if (selections && typeof selections === 'object') {
    for (const value of Object.values(selections)) {
      collectStringLists(value, tokens)
    }
  }
  return tokens
}

/**
 * Filtre la liste en mémoire (ET entre les trois axes).
 *
 * @param templates - Liste plate déjà chargée
 * @param query - Nom, catégorie, contexte GDD (IDs / libellés du snapshot)
 */
export function filterTemplates(
  templates: Template[],
  query: TemplateFilterQuery,
): Template[] {
  const name = query.name?.trim() ?? ''
  const category = query.category?.trim() ?? ''
  const context = query.context?.trim() ?? ''

  return templates.filter((template) => {
    if (name && !includesInsensitive(template.name, name)) {
      return false
    }
    if (category && !includesInsensitive(templateCategoryKey(template), category)) {
      return false
    }
    if (context) {
      const hit = snapshotContextTokens(template).some((token) =>
        includesInsensitive(token, context),
      )
      if (!hit) {
        return false
      }
    }
    return true
  })
}

/**
 * Groupe les templates par `category` en conservant l'ordre d'apparition.
 *
 * @param templates - Liste plate renvoyée par l'API
 * @returns Entrées [catégorie, templates] dans l'ordre de première occurrence
 */
export function groupTemplatesByCategory(templates: Template[]): Array<[string, Template[]]> {
  const groups = new Map<string, Template[]>()
  for (const template of templates) {
    const key = templateCategoryKey(template)
    const bucket = groups.get(key)
    if (bucket) {
      bucket.push(template)
    } else {
      groups.set(key, [template])
    }
  }
  return Array.from(groups.entries())
}
