/**
 * Suppression d'un dialogue, partagée par la bibliothèque, la section Éditer et la fiche
 * de scène. La confirmation ne l'est que par la bibliothèque et la fiche : la section
 * Éditer garde la sienne.
 */
import * as unityDialoguesAPI from '../api/unityDialogues'
import { useGraphViewStore } from '../store/graphViewStore'

export function confirmDialogueDeletion(title: string, losesUnsavedChanges: boolean): boolean {
  const warning = losesUnsavedChanges ? ' Les modifications non sauvegardées seront perdues.' : ''
  return window.confirm(`Supprimer le dialogue « ${title} » ?${warning} Cette action est irréversible.`)
}

/** Les listes et le graphe se mettent à jour sur la notification. */
export async function deleteDialogueAndNotify(filename: string): Promise<void> {
  await unityDialoguesAPI.deleteUnityDialogue(filename)
  useGraphViewStore.getState().notifyDialogueDeleted(filename)
}
