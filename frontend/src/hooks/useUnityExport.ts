/**
 * Export Unity depuis l'éditeur de graphe : validate-schema bloquant puis save-and-write (Story 5.1).
 */
import { useCallback } from 'react'
import * as graphAPI from '../api/graph'
import { useGraphStore } from '../store/graphStore'
import { useAuthStore } from '../store/authStore'
import type { UseToastFn } from '../components/shared'
import type { SchemaValidationIssue } from '../types/graph'
import { getErrorMessage } from '../types/errors'
import { buildGraphSchemaApiPayload } from '../utils/buildGraphApiPayload'
import { downloadUnityExport } from '../components/graph/graphEditorStandalone'
import {
  EXPORT_VALIDATION_BLOCKED_MESSAGE,
  UNITY_PATH_UNAVAILABLE_MESSAGE,
  extractValidationErrors,
  isUnityPathUnavailableError,
} from '../utils/graphApiErrors'
import type { UseUnityExportDownloadResult } from './useUnityExportDownload'

export interface UnityExportSchemaState {
  setShowSchemaValidationPanel: (open: boolean) => void
  setSchemaValidationLoading: (loading: boolean) => void
  setSchemaValidationIsValid: (valid: boolean) => void
  setSchemaValidationErrors: (errors: string[]) => void
  setSchemaValidationErrorCount: (count: number) => void
  setSchemaValidationWarnings: (warnings: SchemaValidationIssue[]) => void
  setSchemaValidationStructuredErrors: (errors: SchemaValidationIssue[]) => void
}

/**
 * Hook export Unity : validation schéma bloquante puis écriture serveur.
 *
 * @param toast - Notifications utilisateur.
 * @param schemaState - Setters du panneau SchemaValidationPanel.
 * @returns Handler clic « Export Unity ».
 */
export function useUnityExport(
  toast: UseToastFn,
  schemaState: UnityExportSchemaState,
  downloadState: Pick<UseUnityExportDownloadResult, 'registerSuccessfulExport'>,
): { handleExportUnity: () => Promise<void> } {
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

  const handleExportUnity = useCallback(async () => {
    const state = useGraphStore.getState()
    if (state.nodes.length === 0) {
      toast('Aucun nœud à exporter', 'warning')
      return
    }

    setShowSchemaValidationPanel(true)
    setSchemaValidationLoading(true)

    try {
      const payload = buildGraphSchemaApiPayload(
        state.nodes,
        state.edges,
        state.dialogueFlagBindings,
      )
      const validation = await graphAPI.validateSchema(payload)

      setSchemaValidationIsValid(validation.is_valid)
      setSchemaValidationErrors(validation.errors)
      setSchemaValidationErrorCount(validation.error_count)
      setSchemaValidationWarnings(validation.warnings ?? [])
      setSchemaValidationStructuredErrors(validation.structured_errors ?? [])

      if (!validation.is_valid) {
        toast(EXPORT_VALIDATION_BLOCKED_MESSAGE, 'error')
        return
      }

      const isGuest = useAuthStore.getState().user?.role === 'guest'
      if (isGuest) {
        const doc = state.document
        if (!doc) {
          toast('Document non chargé — impossible d’exporter en mode invité', 'error')
          return
        }
        const filename = state.dialogueMetadata.filename || 'dialogue_export.json'
        const jsonContent = JSON.stringify(doc, null, 2)
        registerSuccessfulExport(jsonContent, filename)
        await downloadUnityExport(jsonContent, filename)
        toast(`Dialogue exporté (invité) : ${filename}`, 'success', 3000)
        return
      }

      const response = await graphAPI.saveGraphAndWrite({
        ...payload,
        metadata: state.dialogueMetadata,
        document_id: state.documentId ?? undefined,
      })

      registerSuccessfulExport(response.json_content, response.filename)
      toast(`Dialogue exporté : ${response.filename}`, 'success', 3000)
    } catch (err) {
      const validationErrors = extractValidationErrors(err)
      if (validationErrors) {
        setSchemaValidationIsValid(false)
        setSchemaValidationErrors(validationErrors)
        setSchemaValidationErrorCount(validationErrors.length)
        setSchemaValidationWarnings([])
        setSchemaValidationStructuredErrors([])
        toast(EXPORT_VALIDATION_BLOCKED_MESSAGE, 'error')
      } else if (isUnityPathUnavailableError(err)) {
        toast(UNITY_PATH_UNAVAILABLE_MESSAGE, 'error')
      } else {
        toast(getErrorMessage(err), 'error')
      }
    } finally {
      setSchemaValidationLoading(false)
    }
  }, [
    toast,
    setShowSchemaValidationPanel,
    setSchemaValidationLoading,
    setSchemaValidationIsValid,
    setSchemaValidationErrors,
    setSchemaValidationErrorCount,
    setSchemaValidationWarnings,
    setSchemaValidationStructuredErrors,
    registerSuccessfulExport,
  ])

  return { handleExportUnity }
}
