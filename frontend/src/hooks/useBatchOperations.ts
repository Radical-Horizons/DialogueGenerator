/**
 * Opérations batch sur la sélection multiple de nœuds (tag, validate, delete).
 * Extrait de GraphEditor pour isoler la logique batch du rendu.
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
  handleBatchTagSelection: () => void
  handleBatchValidateSelection: () => Promise<void>
}

export function useBatchOperations(toast: UseToastFn): UseBatchOperationsReturn {
  const [selectedNodeIdsToDelete, setSelectedNodeIdsToDelete] = useState<string[] | null>(null)

  const { selectedNodeIds, deleteNode, updateNode, validateGraph, clearSelection } = useGraphStore()

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
    for (const nodeId of selectedNodeIdsToDelete) {
      deleteNode(nodeId)
    }
    clearSelection()
    notifyBatchOperationApplied(selectedNodeIdsToDelete.length)
    setSelectedNodeIdsToDelete(null)
  }, [selectedNodeIdsToDelete, deleteNode, clearSelection, notifyBatchOperationApplied])

  const handleCancelBatchDelete = useCallback(() => {
    setSelectedNodeIdsToDelete(null)
  }, [])

  const handleBatchTagSelection = useCallback(() => {
    const ids = [...selectedNodeIds]
    if (ids.length <= 1) return
    for (const nodeId of ids) {
      const currentNode = useGraphStore.getState().nodes.find((node) => node.id === nodeId)
      if (!currentNode) continue
      const currentData = (currentNode.data ?? {}) as Record<string, unknown>
      updateNode(nodeId, { data: { ...currentData, tag: 'À réviser' } })
    }
    notifyBatchOperationApplied(ids.length)
  }, [selectedNodeIds, updateNode, notifyBatchOperationApplied])

  const handleBatchValidateSelection = useCallback(async () => {
    const ids = [...selectedNodeIds]
    if (ids.length <= 1) return
    try {
      await validateGraph()
      const selectedIssues = useGraphStore.getState().validationErrors.filter(
        (issue) => issue.node_id != null && ids.includes(issue.node_id)
      )
      notifyBatchOperationApplied(ids.length, {
        variant: selectedIssues.length > 0 ? 'warning' : 'success',
        detail:
          selectedIssues.length > 0
            ? `(${selectedIssues.length} signalement${selectedIssues.length > 1 ? 's' : ''})`
            : undefined,
      })
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
  }
}
