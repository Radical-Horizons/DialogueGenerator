/**
 * Périmètre des bases Notion pour l'UI : sélection, raccourcis, et filtre du prochain run.
 */
import { useCallback, useMemo } from 'react'
import type { GddNotionSyncConfigPublic } from '../api/gddNotionSync'
import { GDD_NOTION_SYNC_SECONDARY_DATABASE_FILES } from '../constants/gddNotionSyncSecondaryDatabases'
import { computeIncludedCategoriesPayloadFromSelection } from '../utils/gddNotionSyncPerimeter'

export interface UseGddNotionSyncPerimeterParams {
  config: GddNotionSyncConfigPublic | null
  includedDbFiles: string[]
  setIncludedDbFiles: React.Dispatch<React.SetStateAction<string[]>>
  persistIncludedPerimeter: (files: string[]) => Promise<void>
}

export interface UseGddNotionSyncPerimeterState {
  sources: GddNotionSyncConfigPublic['sources']
  databaseSources: GddNotionSyncConfigPublic['sources']
  dbCount: number
  pageCount: number
  /** Nombre de bases traitées par le prochain run ; ``null`` = pas de filtre (tout). */
  runScopeDbCount: number | null
  toggleDbInclusion: (categoryFile: string, checked: boolean) => void
  checkAllDatabaseSources: () => void
  uncheckAllDatabaseSources: () => void
  checkEssentialDatabaseSources: () => void
  computeIncludedCategoriesPayload: () => string[]
  runIncludedCategories: () => string[] | undefined
}

export function useGddNotionSyncPerimeter({
  config,
  includedDbFiles,
  setIncludedDbFiles,
  persistIncludedPerimeter,
}: UseGddNotionSyncPerimeterParams): UseGddNotionSyncPerimeterState {
  const sources = useMemo(() => config?.sources ?? [], [config])
  const databaseSources = useMemo(
    () =>
      [...sources.filter((s) => s.kind === 'database')].sort((a, b) =>
        a.category_file.localeCompare(b.category_file, 'fr', { sensitivity: 'base' }),
      ),
    [sources],
  )

  const toggleDbInclusion = useCallback(
    (categoryFile: string, checked: boolean) => {
      setIncludedDbFiles((prev) => {
        if (checked) {
          return prev.includes(categoryFile) ? prev : [...prev, categoryFile]
        }
        return prev.filter((f) => f !== categoryFile)
      })
    },
    [setIncludedDbFiles],
  )

  const checkAllDatabaseSources = useCallback(() => {
    const files = databaseSources.map((s) => s.category_file)
    setIncludedDbFiles(files)
    void persistIncludedPerimeter(files)
  }, [databaseSources, persistIncludedPerimeter, setIncludedDbFiles])

  const uncheckAllDatabaseSources = useCallback(() => {
    setIncludedDbFiles([])
  }, [setIncludedDbFiles])

  /** Bases listées comme secondaires dans le dépôt : non cochées par ce raccourci. */
  const checkEssentialDatabaseSources = useCallback(() => {
    const secondary = new Set(GDD_NOTION_SYNC_SECONDARY_DATABASE_FILES)
    const files = databaseSources
      .map((s) => s.category_file)
      .filter((f) => !secondary.has(f))
    setIncludedDbFiles(files)
    void persistIncludedPerimeter(files)
  }, [databaseSources, persistIncludedPerimeter, setIncludedDbFiles])

  const computeIncludedCategoriesPayload = useCallback((): string[] => {
    return computeIncludedCategoriesPayloadFromSelection(config?.sources ?? [], includedDbFiles)
  }, [config?.sources, includedDbFiles])

  /**
   * Filtre éphémère envoyé au run. ``undefined`` tant que la config n'est pas chargée :
   * les cases ne reflètent pas encore le périmètre serveur, envoyer ``[]`` reviendrait à
   * lever le filtre et à parcourir toutes les sources (bases + fiches page).
   */
  const runIncludedCategories = useCallback((): string[] | undefined => {
    if (!config) {
      return undefined
    }
    return computeIncludedCategoriesPayload()
  }, [config, computeIncludedCategoriesPayload])

  const runScopeDbCount = useMemo(() => {
    const payload = computeIncludedCategoriesPayloadFromSelection(
      config?.sources ?? [],
      includedDbFiles,
    )
    return payload.length === 0 ? null : payload.length
  }, [config?.sources, includedDbFiles])

  return {
    sources,
    databaseSources,
    dbCount: databaseSources.length,
    pageCount: sources.filter((s) => s.kind === 'page').length,
    runScopeDbCount,
    toggleDbInclusion,
    checkAllDatabaseSources,
    uncheckAllDatabaseSources,
    checkEssentialDatabaseSources,
    computeIncludedCategoriesPayload,
    runIncludedCategories,
  }
}
