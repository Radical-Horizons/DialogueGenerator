/**
 * Preview export Unity depuis graphe ou bibliothèque batch (Story 5.5 / FR53).
 */
import { useCallback, useRef, useState } from 'react'
import * as graphAPI from '../api/graph'
import * as dialoguesAPI from '../api/dialogues'
import { useGraphStore } from '../store/graphStore'
import type { UseToastFn } from '../components/shared'
import type { SaveGraphRequest, ExportPreviewResponse } from '../types/graph'
import type { BatchExportPreviewResponse } from '../types/api'
import { buildGraphSchemaApiPayload } from '../utils/buildGraphApiPayload'
import {
  EXPORT_VALIDATION_BLOCKED_MESSAGE,
  UNITY_PATH_UNAVAILABLE_MESSAGE,
  extractValidationErrors,
  isUnityPathUnavailableError,
} from '../utils/graphApiErrors'
import { getErrorMessage } from '../types/errors'
import type { UnityExportSchemaState } from './useUnityExport'
import type { UseUnityExportDownloadResult } from './useUnityExportDownload'
import type { ExportPreviewModalMode } from '../components/unityDialogues/ExportPreviewModal'

export interface UseUnityExportPreviewResult {
  previewOpen: boolean
  previewMode: ExportPreviewModalMode
  previewLoading: boolean
  previewError: string | null
  singlePreview: ExportPreviewResponse | null
  batchPreview: BatchExportPreviewResponse | null
  isExportingFromPreview: boolean
  handlePreviewExport: () => Promise<void>
  handleBatchPreviewExport: (documentIds: string[]) => Promise<void>
  handleExportFromPreview: () => Promise<void>
  closePreview: () => void
}

/**
 * Hook preview export : validation bloquante puis modal sans écriture disque.
 */
export function useUnityExportPreview(
  toast: UseToastFn,
  schemaState: UnityExportSchemaState,
  downloadState: Pick<UseUnityExportDownloadResult, 'registerSuccessfulExport'>,
): UseUnityExportPreviewResult {
  const {
    setShowSchemaValidationPanel,
    setSchemaValidationLoading,
    setSchemaValidationIsValid,
    setSchemaValidationErrors,
    setSchemaValidationErrorCount,
    setSchemaValidationWarnings,
    setSchemaValidationStructuredErrors,
  } = schemaState
  const { registerSuccessfulExport } = downloadState

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewMode, setPreviewMode] = useState<ExportPreviewModalMode>('single')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [singlePreview, setSinglePreview] = useState<ExportPreviewResponse | null>(null)
  const [batchPreview, setBatchPreview] = useState<BatchExportPreviewResponse | null>(null)
  const [isExportingFromPreview, setIsExportingFromPreview] = useState(false)

  const validatedPayloadRef = useRef<SaveGraphRequest | null>(null)

  const applyValidationToPanel = useCallback(
    (validation: Awaited<ReturnType<typeof graphAPI.validateSchema>>) => {
      setSchemaValidationIsValid(validation.is_valid)
      setSchemaValidationErrors(validation.errors)
      setSchemaValidationErrorCount(validation.error_count)
      setSchemaValidationWarnings(validation.warnings ?? [])
      setSchemaValidationStructuredErrors(validation.structured_errors ?? [])
    },
    [
      setSchemaValidationIsValid,
      setSchemaValidationErrors,
      setSchemaValidationErrorCount,
      setSchemaValidationWarnings,
      setSchemaValidationStructuredErrors,
    ],
  )

  const handlePreviewExport = useCallback(async () => {
    const state = useGraphStore.getState()
    if (state.nodes.length === 0) {
      toast('Aucun nœud à exporter', 'warning')
      return
    }

    setShowSchemaValidationPanel(true)
    setSchemaValidationLoading(true)
    setPreviewError(null)
    setSinglePreview(null)
    setPreviewMode('single')

    try {
      const payload = buildGraphSchemaApiPayload(
        state.nodes,
        state.edges,
        state.dialogueFlagBindings,
      )
      const fullPayload: SaveGraphRequest = {
        ...payload,
        metadata: state.dialogueMetadata,
        document_id: state.documentId ?? undefined,
      }

      const validation = await graphAPI.validateSchema(payload)
      applyValidationToPanel(validation)

      if (!validation.is_valid) {
        toast(EXPORT_VALIDATION_BLOCKED_MESSAGE, 'error')
        setPreviewOpen(false)
        return
      }

      validatedPayloadRef.current = fullPayload
      setPreviewOpen(true)
      setPreviewLoading(true)

      const preview = await graphAPI.previewGraphExport(fullPayload)
      if (!preview.schema_valid) {
        setSchemaValidationIsValid(false)
        setSchemaValidationErrors(preview.errors)
        setSchemaValidationErrorCount(preview.errors.length)
        toast(EXPORT_VALIDATION_BLOCKED_MESSAGE, 'error')
        setPreviewOpen(false)
        return
      }

      setSinglePreview(preview)
    } catch (err) {
      const validationErrors = extractValidationErrors(err)
      if (validationErrors) {
        setSchemaValidationIsValid(false)
        setSchemaValidationErrors(validationErrors)
        setSchemaValidationErrorCount(validationErrors.length)
        setSchemaValidationWarnings([])
        setSchemaValidationStructuredErrors([])
        toast(EXPORT_VALIDATION_BLOCKED_MESSAGE, 'error')
        setPreviewOpen(false)
      } else {
        setPreviewError(getErrorMessage(err))
        toast(getErrorMessage(err), 'error')
      }
    } finally {
      setSchemaValidationLoading(false)
      setPreviewLoading(false)
    }
  }, [
    toast,
    setShowSchemaValidationPanel,
    setSchemaValidationLoading,
    applyValidationToPanel,
    setSchemaValidationIsValid,
    setSchemaValidationErrors,
    setSchemaValidationErrorCount,
    setSchemaValidationWarnings,
    setSchemaValidationStructuredErrors,
  ])

  const handleBatchPreviewExport = useCallback(async (documentIds: string[]) => {
    if (documentIds.length === 0) {
      return
    }
    setPreviewMode('batch')
    setPreviewOpen(true)
    setPreviewLoading(true)
    setPreviewError(null)
    setBatchPreview(null)

    try {
      const result = await dialoguesAPI.batchPreviewUnityDialogues({ document_ids: documentIds })
      setBatchPreview(result)
    } catch (err) {
      const message = getErrorMessage(err)
      setPreviewError(message)
      toast(message, 'error')
    } finally {
      setPreviewLoading(false)
    }
  }, [toast])

  const handleExportFromPreview = useCallback(async () => {
    const payload = validatedPayloadRef.current
    if (!payload) {
      toast('Aucune prévisualisation active', 'warning')
      return
    }

    setIsExportingFromPreview(true)
    try {
      const response = await graphAPI.saveGraphAndWrite(payload)
      registerSuccessfulExport(response.json_content, response.filename)
      toast(`Dialogue exporté : ${response.filename}`, 'success', 3000)
      setPreviewOpen(false)
      validatedPayloadRef.current = null
      setSinglePreview(null)
    } catch (err) {
      if (isUnityPathUnavailableError(err)) {
        toast(UNITY_PATH_UNAVAILABLE_MESSAGE, 'error')
      } else {
        toast(getErrorMessage(err), 'error')
      }
    } finally {
      setIsExportingFromPreview(false)
    }
  }, [toast, registerSuccessfulExport])

  const closePreview = useCallback(() => {
    if (isExportingFromPreview) return
    setPreviewOpen(false)
    setPreviewError(null)
    setSinglePreview(null)
    setBatchPreview(null)
  }, [isExportingFromPreview])

  return {
    previewOpen,
    previewMode,
    previewLoading,
    previewError,
    singlePreview,
    batchPreview,
    isExportingFromPreview,
    handlePreviewExport,
    handleBatchPreviewExport,
    handleExportFromPreview,
    closePreview,
  }
}
