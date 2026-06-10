/**
 * Agrégats visibilité pour le mode preview (Story 9.4 AC2, AC5).
 */
import type { Node } from 'reactflow'
import type { VisibilityConditionsBlock } from '../types/visibilityConditions'
import type { VisibilityEvalState } from '../types/visibilityConditions'
import { evaluateVisibilityConditions } from './visibilityConditions'

export interface DialoguePreviewCounts {
  /** Nœuds avec bloc structuré dont les conditions sont satisfaites (ou sans bloc). */
  nodesAccessible: number
  /** Nœuds avec bloc structuré dont les conditions ne sont pas satisfaites. */
  nodesMasked: number
  /** Choix avec bloc structuré satisfait ou sans bloc. */
  choicesAccessible: number
  /** Choix avec bloc structuré non satisfait. */
  choicesMasked: number
}

function nodeDataBlock(n: Node): VisibilityConditionsBlock | undefined {
  const raw = (n.data as { visibilityConditions?: VisibilityConditionsBlock } | undefined)
    ?.visibilityConditions
  return raw
}

/**
 * Compte accessibles vs masqués pour l'état de simulation courant.
 * Un nœud/choix sans `visibilityConditions.items` compte comme accessible.
 */
export function computeDialoguePreviewCounts(
  nodes: Node[],
  state: VisibilityEvalState,
  previewActive: boolean,
): DialoguePreviewCounts {
  if (!previewActive) {
    return {
      nodesAccessible: 0,
      nodesMasked: 0,
      choicesAccessible: 0,
      choicesMasked: 0,
    }
  }

  let nodesAccessible = 0
  let nodesMasked = 0
  let choicesAccessible = 0
  let choicesMasked = 0

  for (const n of nodes) {
    const nb = nodeDataBlock(n)
    if (!nb?.items?.length) {
      nodesAccessible += 1
    } else {
      const ok = evaluateVisibilityConditions(nb, state).satisfied
      if (ok) nodesAccessible += 1
      else nodesMasked += 1
    }

    const choices = (n.data as { choices?: unknown[] } | undefined)?.choices ?? []
    for (const ch of choices) {
      const c = ch as { visibilityConditions?: VisibilityConditionsBlock }
      const cb = c.visibilityConditions
      if (!cb?.items?.length) {
        choicesAccessible += 1
      } else {
        const ok = evaluateVisibilityConditions(cb, state).satisfied
        if (ok) choicesAccessible += 1
        else choicesMasked += 1
      }
    }
  }

  return {
    nodesAccessible,
    nodesMasked,
    choicesAccessible,
    choicesMasked,
  }
}
