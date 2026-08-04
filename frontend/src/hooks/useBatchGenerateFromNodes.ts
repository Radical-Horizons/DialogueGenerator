/**
 * Hook génération batch depuis plusieurs nœuds parents (Story 8.9 / FR88).
 * N < 10 : boucle front séquentielle generateFromNode ; N ≥ 10 : job serveur + polling app-level.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Node } from 'reactflow'
import {
  BATCH_GENERATE_JOB_MIN,
  startBatchGenerateFromNodesJob,
  type BatchGenerateParentItem,
  type BatchGenerateParentSpec,
  type BatchGenerateReport,
} from '../api/batchNodeGeneration'
import type { UseToastFn } from '../components/shared'
import { useBatchNodeGenerationJobStore } from '../store/batchNodeGenerationJobStore'
import { useContextStore } from '../store/contextStore'
import { useGraphStore } from '../store/graphStore'
import { getErrorMessage } from '../types/errors'
import { serializeDialogueNodesForApi } from '../utils/dialoguePathContext'

export interface BatchGenerateProgress {
  current: number
  total: number
  detail: string
}

export interface UseBatchGenerateFromNodesResult {
  isGenerating: boolean
  progress: BatchGenerateProgress | null
  report: BatchGenerateReport | null
  showModal: boolean
  setShowModal: (show: boolean) => void
  dismissReport: () => void
  startBatchGenerate: (parentIds?: string[]) => Promise<void>
  cancelBatchGenerate: () => void
  retryFailedParents: () => Promise<void>
}

function hasUnconnectedChoice(node: Node | undefined): boolean {
  if (!node) return false
  const choices = node.data?.choices
  if (!Array.isArray(choices) || choices.length === 0) return false
  return choices.some((c: { targetNode?: string | null }) => {
    const target = c?.targetNode
    return target == null || target === ''
  })
}

function resolveContextForParent(node: Node | undefined): Record<string, unknown> {
  const snap = node?.data?.gddContextSelectionsSnapshot
  if (snap && typeof snap === 'object') {
    return JSON.parse(JSON.stringify(snap)) as Record<string, unknown>
  }
  return {
    ...useContextStore.getState().selections,
  } as unknown as Record<string, unknown>
}

function emptyLocalReport(partial: Partial<BatchGenerateReport> = {}): BatchGenerateReport {
  return {
    items: [],
    cancelled: false,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    ok_count: 0,
    error_count: 0,
    skipped_count: 0,
    total_nodes_generated: 0,
    ...partial,
  }
}

function summarizeLocal(items: BatchGenerateParentItem[], cancelled: boolean): BatchGenerateReport {
  return {
    items,
    cancelled,
    started_at: items[0] ? new Date().toISOString() : new Date().toISOString(),
    finished_at: new Date().toISOString(),
    ok_count: items.filter((i) => i.status === 'ok').length,
    error_count: items.filter((i) => i.status === 'error').length,
    skipped_count: items.filter((i) => i.status === 'skipped' || i.status === 'cancelled')
      .length,
    total_nodes_generated: items
      .filter((i) => i.status === 'ok')
      .reduce((sum, i) => sum + (i.nodes?.length || 0), 0),
  }
}

function buildParentSpec(parentId: string): BatchGenerateParentSpec | null {
  const node = useGraphStore.getState().nodes.find((n) => n.id === parentId)
  if (!node) return null
  const selections = resolveContextForParent(node)
  const chars = [
    ...((selections.characters_full as string[]) || []),
    ...((selections.characters_excerpt as string[]) || []),
  ]
  return {
    parent_node_id: parentId,
    parent_node_content: { ...(node.data as Record<string, unknown>) },
    context_selections: selections,
    user_instructions: '',
    npc_speaker_id: chars[0],
  }
}

export function useBatchGenerateFromNodes(
  toast: UseToastFn
): UseBatchGenerateFromNodesResult {
  const [isGeneratingLocal, setIsGeneratingLocal] = useState(false)
  const [progress, setProgress] = useState<BatchGenerateProgress | null>(null)
  const [report, setReport] = useState<BatchGenerateReport | null>(null)
  const [showModal, setShowModal] = useState(false)
  const abortRef = useRef(false)
  const lastParentIdsRef = useRef<string[]>([])

  const jobIsPolling = useBatchNodeGenerationJobStore((s) => s.isPolling)
  const jobCurrent = useBatchNodeGenerationJobStore((s) => s.current)
  const jobTotal = useBatchNodeGenerationJobStore((s) => s.total)
  const jobDetail = useBatchNodeGenerationJobStore((s) => s.detail)
  const jobReport = useBatchNodeGenerationJobStore((s) => s.report)
  const pendingApplyReport = useBatchNodeGenerationJobStore((s) => s.pendingApplyReport)
  const startPolling = useBatchNodeGenerationJobStore((s) => s.startPolling)
  const cancelActiveJob = useBatchNodeGenerationJobStore((s) => s.cancelActiveJob)
  const clearPendingApply = useBatchNodeGenerationJobStore((s) => s.clearPendingApply)
  const dismissJobReport = useBatchNodeGenerationJobStore((s) => s.dismissReport)

  const isGenerating = isGeneratingLocal || jobIsPolling

  useEffect(() => {
    if (jobIsPolling) {
      setProgress({
        current: jobCurrent,
        total: jobTotal,
        detail: jobDetail || `Nœud ${jobCurrent}/${jobTotal}`,
      })
    }
  }, [jobIsPolling, jobCurrent, jobTotal, jobDetail])

  useEffect(() => {
    if (!pendingApplyReport) return
    void (async () => {
      const apply = useGraphStore.getState().applyGenerateNodeResponse
      for (const item of pendingApplyReport.items) {
        if (item.status !== 'ok' || !item.nodes?.length) continue
        const node = useGraphStore.getState().nodes.find((n) => n.id === item.parent_node_id)
        try {
          await apply(
            item.parent_node_id,
            {
              nodes: item.nodes,
              suggested_connections: item.suggested_connections,
              generated_choices_count: item.generated_choices_count,
              connected_choices_count: item.connected_choices_count,
              failed_choices_count: item.failed_choices_count,
              total_choices_count: item.total_choices_count,
              context_gdd_content_fingerprint: item.context_gdd_content_fingerprint,
              batch_count: item.nodes.length,
            },
            {
              context_selections: resolveContextForParent(node),
              instructions: '',
              generate_all_choices: true,
            }
          )
        } catch (err) {
          console.error('[BatchGenerate] apply failed', item.parent_node_id, err)
        }
      }
      setReport(pendingApplyReport)
      setShowModal(true)
      clearPendingApply()
      setProgress(null)
    })()
  }, [pendingApplyReport, clearPendingApply])

  const dismissReport = useCallback(() => {
    setReport(null)
    dismissJobReport()
  }, [dismissJobReport])

  const cancelBatchGenerate = useCallback(() => {
    abortRef.current = true
    cancelActiveJob()
  }, [cancelActiveJob])

  const runSequential = useCallback(
    async (parentIds: string[]) => {
      abortRef.current = false
      setIsGeneratingLocal(true)
      setReport(null)
      setProgress({ current: 0, total: parentIds.length, detail: 'Nœud 0/' + parentIds.length })
      setShowModal(true)

      const generateFromNode = useGraphStore.getState().generateFromNode
      const collected: BatchGenerateParentItem[] = []

      for (let index = 0; index < parentIds.length; index += 1) {
        if (abortRef.current) {
          for (const remaining of parentIds.slice(index)) {
            collected.push({
              parent_node_id: remaining,
              status: 'cancelled',
              nodes: [],
              suggested_connections: [],
              warning: 'Annulé',
            })
          }
          break
        }

        const parentId = parentIds[index]
        const nParents = parentIds.length
        setProgress({
          current: index,
          total: nParents,
          detail: `Nœud ${index + 1}/${nParents}`,
        })

        const node = useGraphStore.getState().nodes.find((n) => n.id === parentId)
        if (!node) {
          collected.push({
            parent_node_id: parentId,
            status: 'error',
            nodes: [],
            suggested_connections: [],
            error: 'Nœud introuvable',
          })
          continue
        }
        if (!hasUnconnectedChoice(node)) {
          collected.push({
            parent_node_id: parentId,
            status: 'skipped',
            nodes: [],
            suggested_connections: [],
            warning: 'Aucun choix libre à générer',
          })
          continue
        }

        const contextSelections = resolveContextForParent(node)
        try {
          const result = await generateFromNode(parentId, '', {
            context_selections: contextSelections,
            generate_all_choices: true,
            choices_mode: 'capped',
            onBatchProgress: (j: number, k: number) => {
              setProgress({
                current: index,
                total: nParents,
                detail: `Nœud ${index + 1}/${nParents} — ${j}/${k}`,
              })
            },
          })
          const nodesAfter = useGraphStore.getState().nodes
          const parentAfter = nodesAfter.find((n) => n.id === parentId)
          const linkedTargets = new Set(
            ((parentAfter?.data?.choices || []) as Array<{ targetNode?: string }>)
              .map((c) => c.targetNode)
              .filter(Boolean)
          )
          const newNodes = nodesAfter
            .filter((n) => linkedTargets.has(n.id) && n.id !== parentId)
            .map((n) => ({ id: n.id, ...(n.data as object) })) as BatchGenerateParentItem['nodes']

          collected.push({
            parent_node_id: parentId,
            status: 'ok',
            nodes: newNodes.length
              ? newNodes
              : result.nodeId
                ? [{ id: result.nodeId }]
                : [],
            suggested_connections: [],
            generated_choices_count: result.batchInfo?.generatedChoices,
            connected_choices_count: result.batchInfo?.connectedChoices,
            failed_choices_count: result.batchInfo?.failedChoices,
            total_choices_count: result.batchInfo?.totalChoices,
          })
        } catch (err) {
          const message = getErrorMessage(err)
          const isSkip =
            /déjà connectés|aucun choix|aucun nœud à générer/i.test(message)
          collected.push({
            parent_node_id: parentId,
            status: isSkip ? 'skipped' : 'error',
            nodes: [],
            suggested_connections: [],
            error: isSkip ? undefined : message,
            warning: isSkip ? message : undefined,
          })
        }

        setProgress({
          current: index + 1,
          total: nParents,
          detail: `Nœud ${index + 1}/${nParents} terminé`,
        })
      }

      const result = summarizeLocal(collected, abortRef.current)
      setReport(result)
      toast(
        abortRef.current
          ? 'Génération batch annulée'
          : `${result.total_nodes_generated} nœuds générés depuis ${result.ok_count} nœuds de départ`,
        abortRef.current || result.error_count > 0 ? 'warning' : 'success',
        4000
      )
      setIsGeneratingLocal(false)
      setProgress(null)
    },
    [toast]
  )

  const runJob = useCallback(
    async (parentIds: string[]) => {
      const specs: BatchGenerateParentSpec[] = []
      for (const id of parentIds) {
        const spec = buildParentSpec(id)
        if (spec) specs.push(spec)
      }
      if (specs.length < 2) {
        toast('Moins de 2 parents sélectionnés', 'warning')
        return
      }
      // Si après filtre introuvables on est sous le seuil job, basculer en séquentiel
      if (specs.length < BATCH_GENERATE_JOB_MIN) {
        await runSequential(specs.map((s) => s.parent_node_id))
        return
      }

      setShowModal(true)
      setReport(null)
      const state = useGraphStore.getState()
      const created = await startBatchGenerateFromNodesJob({
        document_id: state.dialogueMetadata.filename || undefined,
        parents: specs,
        dialogue_nodes: serializeDialogueNodesForApi(state.nodes),
        choices_mode: 'capped',
      })
      setProgress({ current: 0, total: created.total, detail: 'Job démarré' })
      startPolling(created.job_id)
      toast('Génération batch lancée en arrière-plan', 'info', 3000)
    },
    [startPolling, runSequential, toast]
  )

  const startBatchGenerate = useCallback(
    async (parentIds?: string[]) => {
      const ids =
        parentIds && parentIds.length > 0
          ? [...parentIds]
          : [...useGraphStore.getState().selectedNodeIds]
      if (ids.length < 2) {
        toast('Sélectionnez au moins 2 nœuds', 'warning')
        return
      }
      lastParentIdsRef.current = ids
      try {
        if (ids.length < BATCH_GENERATE_JOB_MIN) {
          await runSequential(ids)
        } else {
          await runJob(ids)
        }
      } catch (err) {
        toast(getErrorMessage(err), 'error')
        setIsGeneratingLocal(false)
      }
    },
    [runJob, runSequential, toast]
  )

  const retryFailedParents = useCallback(async () => {
    const failed =
      report?.items
        .filter((i) => i.status === 'error')
        .map((i) => i.parent_node_id) || []
    if (failed.length === 0) return
    await startBatchGenerate(failed)
  }, [report, startBatchGenerate])

  return {
    isGenerating,
    progress,
    report: report || jobReport,
    showModal,
    setShowModal,
    dismissReport,
    startBatchGenerate,
    cancelBatchGenerate,
    retryFailedParents,
  }
}

export { emptyLocalReport, hasUnconnectedChoice, resolveContextForParent }
