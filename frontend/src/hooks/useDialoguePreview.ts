/**
 * Story 9.4 — entrée/sortie preview sans persistance ; état dans graphViewStore.
 */
import { useCallback } from 'react'
import { useGraphStore } from '../store/graphStore'
import { useGraphViewStore } from '../store/graphViewStore'
import type { VisibilityEvalState } from '../types/visibilityConditions'
import { collectKeysFromGraphNodes } from '../utils/collectPreviewKeys'

function buildInitialEvalState(
  bindings: Array<{ flagId: string; initialValue: boolean | number | string }>,
  nodes: Parameters<typeof collectKeysFromGraphNodes>[0],
): VisibilityEvalState {
  const flags: VisibilityEvalState['flags'] = {}
  for (const b of bindings) {
    flags[b.flagId] = b.initialValue
  }
  const { flagIds, reputationKeys } = collectKeysFromGraphNodes(nodes)
  for (const fid of flagIds) {
    if (flags[fid] === undefined) flags[fid] = false
  }
  const reputation: VisibilityEvalState['reputation'] = {}
  for (const key of reputationKeys) {
    reputation[key] = 0
  }
  return { flags, reputation }
}

export interface UseDialoguePreviewResult {
  enterDialoguePreview: () => void
  exitDialoguePreview: () => void
}

/**
 * Prépare l'état simulé initial à partir des liaisons dialogue et du graphe courant.
 */
export function useDialoguePreview(): UseDialoguePreviewResult {
  const dialogueFlagBindings = useGraphStore((s) => s.dialogueFlagBindings)
  const nodes = useGraphStore((s) => s.nodes)

  const enterDialoguePreview = useCallback(() => {
    const initial = buildInitialEvalState(dialogueFlagBindings, nodes)
    useGraphViewStore.getState().enterDialoguePreview(initial)
  }, [dialogueFlagBindings, nodes])

  const exitDialoguePreview = useCallback(() => {
    useGraphViewStore.getState().exitDialoguePreview()
  }, [])

  return { enterDialoguePreview, exitDialoguePreview }
}
