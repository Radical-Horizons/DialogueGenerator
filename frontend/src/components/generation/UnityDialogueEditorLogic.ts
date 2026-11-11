/**
 * Logique pure de l'éditeur de dialogue (section Éditer) : sauvegarde automatique,
 * barre d'actions, point de départ de « Générer la suite ».
 */
import type { UnityDialogueNode } from '../../types/api'

export interface UnityDialogueEditorAction {
  id: string
  label: string
  onClick: () => void
  title?: string
  disabled?: boolean
  testId?: string
  /** Toujours dans « Autres », jamais dans la barre (Supprimer, Fermer). */
  overflowOnly?: boolean
  danger?: boolean
}

export type EditorSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

export interface EditorSaveState {
  status: EditorSaveStatus
  lastSavedAt: number | null
  error: string | null
}

/** Pause de saisie avant la sauvegarde automatique. */
export const AUTOSAVE_DEBOUNCE_MS = 800

function isTerminalNode(node: UnityDialogueNode): boolean {
  if (node.id === 'END') return false
  if (node.choices && node.choices.length > 0) return false
  if (node.successNode || node.failureNode) return false
  return !node.nextNode || node.nextNode === 'END'
}

/**
 * Nœud d'où « Générer la suite » repart : celui qui termine la conversation.
 * Parmi plusieurs fins, le dernier édité ; sinon la dernière dans l'ordre du fichier.
 */
export function pickContinuationNodeId(
  nodes: UnityDialogueNode[],
  lastEditedNodeId: string | null,
): string | null {
  const endings = nodes.filter(isTerminalNode)
  if (lastEditedNodeId && endings.some((n) => n.id === lastEditedNodeId)) return lastEditedNodeId
  if (endings.length > 0) return endings[endings.length - 1].id
  const displayable = nodes.filter((n) => n.id !== 'END')
  return displayable.length > 0 ? displayable[displayable.length - 1].id : null
}

function formatClock(timestamp: number): string {
  const date = new Date(timestamp)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function saveStatusLabel(state: EditorSaveState): string {
  switch (state.status) {
    case 'pending':
    case 'saving':
      return 'ENREGISTREMENT…'
    case 'error':
      return "ERREUR D'ENREGISTREMENT"
    case 'saved':
      return state.lastSavedAt != null ? `ENREGISTRÉ · ${formatClock(state.lastSavedAt)}` : 'ENREGISTRÉ'
    default:
      return 'ENREGISTRÉ'
  }
}

/**
 * Nombre d'actions qui tiennent dans la barre, dans l'ordre donné.
 * `available <= 0` : largeur pas encore mesurée (jsdom, premier rendu) → tout en ligne.
 */
export function countInlineActions(
  widths: number[],
  available: number,
  gap: number,
  moreWidth: number,
  hasOverflowOnly: boolean,
): number {
  if (available <= 0) return widths.length
  const rowWidth = (count: number) =>
    widths.slice(0, count).reduce((sum, w) => sum + w, 0) + gap * Math.max(0, count - 1)
  if (!hasOverflowOnly && rowWidth(widths.length) <= available) return widths.length
  const budget = available - moreWidth - gap
  let count = 0
  while (count < widths.length && rowWidth(count + 1) <= budget) count += 1
  return count
}

