/**
 * État « dernier export téléchargeable » après save-and-write (Story 5.4 / FR52).
 */
import { useCallback, useState } from 'react'
import { downloadUnityExport } from '../components/graph/graphEditorStandalone'
import { loadDownloadExportOptions } from '../utils/downloadExportOptions'

export interface LastExportDownload {
  jsonContent: string
  filename: string
}

export interface UseUnityExportDownloadResult {
  lastExportDownload: LastExportDownload | null
  isDownloading: boolean
  registerSuccessfulExport: (jsonContent: string, filename: string) => void
  dismissDownload: () => void
  handleDownloadLastExport: () => void
}

/** Hook état téléchargement post-export single (graphe / bibliothèque). */
export function useUnityExportDownload(): UseUnityExportDownloadResult {
  const [lastExportDownload, setLastExportDownload] = useState<LastExportDownload | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)

  const registerSuccessfulExport = useCallback((jsonContent: string, filename: string) => {
    setLastExportDownload({ jsonContent, filename })
  }, [])

  const dismissDownload = useCallback(() => {
    setLastExportDownload(null)
  }, [])

  const handleDownloadLastExport = useCallback(() => {
    if (!lastExportDownload) {
      return
    }
    const { filenameStrategy } = loadDownloadExportOptions()
    void downloadUnityExport(
      lastExportDownload.jsonContent,
      lastExportDownload.filename,
      {
        onDownloadStart: () => setIsDownloading(true),
        onDownloadEnd: () => setIsDownloading(false),
      },
      filenameStrategy,
    )
  }, [lastExportDownload])

  return {
    lastExportDownload,
    isDownloading,
    registerSuccessfulExport,
    dismissDownload,
    handleDownloadLastExport,
  }
}
