/**
 * Opérations batch sur la sélection multiple de nœuds (Story 2.11 FR32).
 * Utilise batchDeleteNodes / batchTagNodes du store et gère les échecs partiels.
 */
import { useState, useCallback } from 'react'
import { useGraphStore } from '../store/graphStore'
import { getErrorMessage } from '../types/errors'

interface UseToastFn {
  (message: string, variant?: string, duration?: number): void
}

interface BatchOperationOptions {
  variant?: 'success' | 'warning'
  detail?: string
}

export interface UseBatchOperationsReturn {
  selectedNodeIdsToDelete: string[] | null
  handleBatchDeleteSelection: () => void
  handleConfirmBatchDelete: () => void
  handleCancelBatchDelete: () => void
  handleBatchTagSelection: (tag: string) => void
  handleBatchValidateSelection: () => Promise<void>
  showValidationReportForSelection: boolean
  setShowValidationReportForSelection: (show: boolean) => void
}

export function useBatchOperations(toast: UseToastFn): UseBatchOperationsReturn {
  const [selectedNodeIdsToDelete, setSelectedNodeIdsToDelete] = useState<string[] | null>(null)
  const [showValidationReportForSelection, setShowValidationReportForSelection] = useState(false)

  const {
    selectedNodeIds,
    batchDeleteNodes,
    batchTagNodes,
    validateGraph,
    clearSelection,
    setSelectedNodes,
  } = useGraphStore()

  const notifyBatchOperationApplied = useCallback(
    (count: number, options?: BatchOperationOptions) => {
      const pluralSuffix = count > 1 ? 's' : ''
      const message = `Opération appliquée à ${count} nœud${pluralSuffix}`
      const detail = options?.detail ? ` ${options.detail}` : ''
      toast(`${message}${detail}`, options?.variant ?? 'success', 3000)
    },
    [toast]
  )

  const handleBatchDeleteSelection = useCallback(() => {
    if (selectedNodeIds.length <= 1) return
    setSelectedNodeIdsToDelete([...selectedNodeIds])
  }, [selectedNodeIds])

  const handleConfirmBatchDelete = useCallback(() => {
    if (!selectedNodeIdsToDelete || selectedNodeIdsToDelete.length === 0) return
    const { deleted, failed } = batchDeleteNodes(selectedNodeIdsToDelete)
    if (failed.length > 0) {
      const failureDetail = failed
        .map((f) => (f.reason ? `${f.id} (${f.reason})` : f.id))
        .join(', ')
      toast(
        `${deleted.length} nœud${deleted.length > 1 ? 's' : ''} supprimé(s), ${failed.length} échec(s): ${failureDetail}`,
        'warning',
        5000
      )
      setSelectedNodes(failed.map((f) => f.id))
    } else {
      clearSelection()
      const n = deleted.length
      toast(
        `${n} nœud${n > 1 ? 's' : ''} supprimé${n > 1 ? 's' : ''}`,
        'success',
        3000
      )
    }
    setSelectedNodeIdsToDelete(null)
  }, [
    selectedNodeIdsToDelete,
    batchDeleteNodes,
    clearSelection,
    setSelectedNodes,
    toast,
  ])

  const handleCancelBatchDelete = useCallback(() => {
    setSelectedNodeIdsToDelete(null)
  }, [])

  const handleBatchTagSelection = useCallback(
    (tag: string) => {
      const ids = [...selectedNodeIds]
      if (ids.length <= 1) return
      batchTagNodes(ids, tag)
      notifyBatchOperationApplied(ids.length)
    },
    [selectedNodeIds, batchTagNodes, notifyBatchOperationApplied]
  )

  const handleBatchValidateSelection = useCallback(async () => {
    const ids = [...selectedNodeIds]
    if (ids.length <= 1) return
    try {
      await validateGraph()
      setShowValidationReportForSelection(true)
      const selectedIssues = useGraphStore.getState().validationErrors.filter(
        (issue) => issue.node_id != null && ids.includes(issue.node_id)
      )
      if (selectedIssues.length > 0) {
        notifyBatchOperationApplied(ids.length, {
          variant: 'warning',
          detail: `(${selectedIssues.length} signalement${selectedIssues.length > 1 ? 's' : ''})`,
        })
      } else {
        notifyBatchOperationApplied(ids.length)
      }
    } catch (err) {
      toast(`Erreur lors de la validation: ${getErrorMessage(err)}`, 'error')
    }
  }, [selectedNodeIds, validateGraph, notifyBatchOperationApplied, toast])

  return {
    selectedNodeIdsToDelete,
    handleBatchDeleteSelection,
    handleConfirmBatchDelete,
    handleCancelBatchDelete,
    handleBatchTagSelection,
    handleBatchValidateSelection,
    showValidationReportForSelection,
    setShowValidationReportForSelection,
  }
}
