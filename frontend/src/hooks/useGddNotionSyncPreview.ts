/**
 * Aperçu « première ligne » d'une base Notion, pour vérifier le mapping avant un run.
 */
import { useCallback, useState } from 'react'
import {
  postGddNotionPreviewDatabaseRow,
  type GddNotionPreviewDatabaseResponse,
} from '../api/gddNotionSync'

export interface UseGddNotionSyncPreviewState {
  previewOpen: boolean
  previewForFile: string | null
  previewLoading: boolean
  previewError: string | null
  previewData: GddNotionPreviewDatabaseResponse | null
  runPreviewOneRow: (categoryFile: string) => Promise<void>
  closePreview: () => void
}

export function useGddNotionSyncPreview(): UseGddNotionSyncPreviewState {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewForFile, setPreviewForFile] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<GddNotionPreviewDatabaseResponse | null>(null)

  const runPreviewOneRow = useCallback(async (categoryFile: string) => {
    setPreviewForFile(categoryFile)
    setPreviewOpen(true)
    setPreviewLoading(true)
    setPreviewError(null)
    setPreviewData(null)
    try {
      const r = await postGddNotionPreviewDatabaseRow(categoryFile)
      setPreviewData(r)
      if (!r.ok) {
        setPreviewError(r.message || 'Échec du test')
      }
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : 'Requête échouée')
    } finally {
      setPreviewLoading(false)
    }
  }, [])

  /** Ferme l'aperçu et vide son contenu — la prochaine ouverture repart d'un état propre. */
  const closePreview = useCallback(() => {
    setPreviewOpen(false)
    setPreviewForFile(null)
    setPreviewData(null)
    setPreviewError(null)
  }, [])

  return {
    previewOpen,
    previewForFile,
    previewLoading,
    previewError,
    previewData,
    runPreviewOneRow,
    closePreview,
  }
}
