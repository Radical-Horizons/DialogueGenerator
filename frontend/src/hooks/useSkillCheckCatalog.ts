import { useEffect, useState } from 'react'
import { getSkillCheckCatalog } from '../api/skillCheckCatalog'
import type { SkillCheckCatalog, SkillCheckCatalogEntry } from '../types/skillCheckCatalog'

let cachedCatalog: SkillCheckCatalog | null = null
let inflight: Promise<SkillCheckCatalog> | null = null

async function fetchCatalog(): Promise<SkillCheckCatalog> {
  if (cachedCatalog) return cachedCatalog
  if (!inflight) {
    inflight = getSkillCheckCatalog().then((catalog) => {
      cachedCatalog = catalog
      inflight = null
      return catalog
    })
  }
  return inflight
}

export interface UseSkillCheckCatalogResult {
  attributes: SkillCheckCatalogEntry[]
  skills: SkillCheckCatalogEntry[]
  isLoading: boolean
  error: string | null
}

/** Charge le catalogue caractéristiques/compétences (cache module). */
export function useSkillCheckCatalog(): UseSkillCheckCatalogResult {
  const [attributes, setAttributes] = useState<SkillCheckCatalogEntry[]>(
    cachedCatalog?.attributes ?? [],
  )
  const [skills, setSkills] = useState<SkillCheckCatalogEntry[]>(cachedCatalog?.skills ?? [])
  const [isLoading, setIsLoading] = useState(!cachedCatalog)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cachedCatalog) return
    let cancelled = false
    void fetchCatalog()
      .then((catalog) => {
        if (cancelled) return
        setAttributes(catalog.attributes)
        setSkills(catalog.skills)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Catalogue indisponible')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { attributes, skills, isLoading, error }
}
