/**
 * Téléchargement de l'export NotebookLM du GDD (zip), sur disque complet ou périmètre de sync.
 */
import { useCallback, useState } from 'react'
import { getGddNotebooklmExportZip } from '../api/gddNotionSync'

export interface UseGddNotebooklmExportState {
  notebooklmExporting: boolean
  notebooklmExportError: string | null
  handleNotebooklmExport: (scope?: 'disk' | 'sync') => Promise<void>
}

export function useGddNotebooklmExport(): UseGddNotebooklmExportState {
  const [notebooklmExporting, setNotebooklmExporting] = useState(false)
  const [notebooklmExportError, setNotebooklmExportError] = useState<string | null>(null)

  const handleNotebooklmExport = useCallback(async (scope: 'disk' | 'sync' = 'disk') => {
    setNotebooklmExportError(null)
    setNotebooklmExporting(true)
    try {
      const blob = await getGddNotebooklmExportZip(64, scope)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const d = new Date().toISOString().slice(0, 10)
      const suffix = scope === 'sync' ? '-perimetre-sync' : ''
      a.download = `gdd-notebooklm-export${suffix}-${d}.zip`
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setNotebooklmExportError(
        e instanceof Error ? e.message : 'Échec du téléchargement de l’export NotebookLM',
      )
    } finally {
      setNotebooklmExporting(false)
    }
  }, [])

  return { notebooklmExporting, notebooklmExportError, handleNotebooklmExport }
}
