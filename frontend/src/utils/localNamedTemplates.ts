/**
 * Templates nommés persistés en localStorage (profil auteur, brief de scène).
 * Complète les templates serveur (config) sans endpoint d’écriture dédié.
 */
export interface LocalNamedTemplate {
  id: string
  name: string
  body: string
  updatedAt: string
}

const STORAGE_AUTHOR_KEY = 'dialogue_generator_named_templates_author_v1'
const STORAGE_SCENE_KEY = 'dialogue_generator_named_templates_scene_v1'

function safeParse(json: string | null): LocalNamedTemplate[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (row): row is LocalNamedTemplate =>
        typeof row === 'object' &&
        row !== null &&
        typeof (row as LocalNamedTemplate).id === 'string' &&
        typeof (row as LocalNamedTemplate).name === 'string' &&
        typeof (row as LocalNamedTemplate).body === 'string'
    )
  } catch {
    return []
  }
}

function readList(key: string): LocalNamedTemplate[] {
  try {
    return safeParse(localStorage.getItem(key))
  } catch {
    return []
  }
}

function writeList(key: string, list: LocalNamedTemplate[]): void {
  localStorage.setItem(key, JSON.stringify(list))
}

export function listLocalAuthorTemplates(): LocalNamedTemplate[] {
  return readList(STORAGE_AUTHOR_KEY).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

export function listLocalSceneTemplates(): LocalNamedTemplate[] {
  return readList(STORAGE_SCENE_KEY).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

export function upsertLocalAuthorTemplate(name: string, body: string): LocalNamedTemplate {
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error('Le nom du modèle est requis')
  }
  const list = readList(STORAGE_AUTHOR_KEY)
  const now = new Date().toISOString()
  const existing = list.find((t) => t.name.toLowerCase() === trimmed.toLowerCase())
  let next: LocalNamedTemplate[]
  if (existing) {
    next = list.map((t) =>
      t.id === existing.id ? { ...t, body, name: trimmed, updatedAt: now } : t
    )
  } else {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
    next = [...list, { id, name: trimmed, body, updatedAt: now }]
  }
  writeList(STORAGE_AUTHOR_KEY, next)
  const updated = next.find((t) => t.name.toLowerCase() === trimmed.toLowerCase())
  if (!updated) {
    throw new Error('Échec enregistrement du modèle auteur')
  }
  return updated
}

export function upsertLocalSceneTemplate(name: string, body: string): LocalNamedTemplate {
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error('Le nom du modèle est requis')
  }
  const list = readList(STORAGE_SCENE_KEY)
  const now = new Date().toISOString()
  const existing = list.find((t) => t.name.toLowerCase() === trimmed.toLowerCase())
  let next: LocalNamedTemplate[]
  if (existing) {
    next = list.map((t) =>
      t.id === existing.id ? { ...t, body, name: trimmed, updatedAt: now } : t
    )
  } else {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
    next = [...list, { id, name: trimmed, body, updatedAt: now }]
  }
  writeList(STORAGE_SCENE_KEY, next)
  const updated = next.find((t) => t.name.toLowerCase() === trimmed.toLowerCase())
  if (!updated) {
    throw new Error('Échec enregistrement du modèle de scène')
  }
  return updated
}

export function deleteLocalAuthorTemplate(id: string): void {
  const list = readList(STORAGE_AUTHOR_KEY).filter((t) => t.id !== id)
  writeList(STORAGE_AUTHOR_KEY, list)
}

export function deleteLocalSceneTemplate(id: string): void {
  const list = readList(STORAGE_SCENE_KEY).filter((t) => t.id !== id)
  writeList(STORAGE_SCENE_KEY, list)
}
