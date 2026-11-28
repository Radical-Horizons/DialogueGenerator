/**
 * Flags du dialogue ouvert, en fenêtre : le panneau existant, enregistré au fil du geste.
 */
import type { RefObject } from 'react'
import { useGraphStore } from '../../store/graphStore'
import { redesignSpacing } from '../../theme/redesignTokens'
import { DialogueFlagsPanel } from '../generation/DialogueFlagsPanel'
import { SceneDialog } from './SceneWindow'
import { monoLabel } from './sceneStyles'

function clock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

/** La fenêtre couvre l'en-tête du graphe : l'état d'enregistrement se lit ici aussi. */
function SaveState({ readOnly }: { readOnly: boolean }) {
  const isSaving = useGraphStore((state) => state.isSaving)
  const pending = useGraphStore((state) => state.hasUnsavedChanges)
  const failed = useGraphStore((state) => state.lastSaveError !== null)
  const savedAt = useGraphStore((state) => state.lastSavedAt)

  let text = ''
  if (readOnly) text = 'Lecture seule'
  else if (isSaving) text = 'Enregistrement…'
  else if (failed) text = 'Non enregistré'
  else if (pending) text = 'En attente'
  else if (savedAt !== null) text = `Enregistré · ${clock(savedAt)}`

  return (
    <div role="status" style={{ ...monoLabel, marginTop: redesignSpacing.md, minHeight: 14 }}>
      {text}
    </div>
  )
}

export function SceneFlagsWindow({
  readOnly,
  trigger,
  onClose,
}: {
  readOnly: boolean
  trigger: RefObject<HTMLElement>
  onClose: () => void
}) {
  return (
    <SceneDialog title="Flags du dialogue" trigger={trigger} onClose={onClose}>
      <DialogueFlagsPanel readOnly={readOnly} />
      <SaveState readOnly={readOnly} />
    </SceneDialog>
  )
}
