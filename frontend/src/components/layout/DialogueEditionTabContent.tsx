/**
 * Contenu de l'onglet "Édition de Dialogues" (Story 17.7 + correction du bug
 * de mesure narrow lié à la dette technique 17.8).
 *
 * Pourquoi un sous-composant dédié :
 * - `useNarrowInlineSize` doit être instancié **dans** le composant qui monte
 *   réellement avec l'onglet pour que `ref.current` soit attaché dès la
 *   première exécution du `useLayoutEffect`. Quand le hook est instancié au
 *   niveau `Dashboard`, il s'exécute une seule fois au mount initial — moment
 *   où l'onglet "edition" n'est pas encore actif et la ref vaut `null` →
 *   `ResizeObserver` jamais attaché → `isNarrow` figé à `false`.
 * - Un sous-composant rendu dans le slot `content` de l'onglet ne se monte
 *   qu'une fois l'onglet actif (ou dès le mount si tous les contenus sont
 *   pré-rendus, mais alors la ref est attachée immédiatement).
 *
 * Une fois la dette technique 17.8 résolue (callback ref), ce wrapper restera
 * comme bonne pratique de séparation des responsabilités.
 */
import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react'
import { useNarrowInlineSize } from '../../hooks/useNarrowInlineSize'
import { PANEL_COMFORT_MIN_WIDTH_PX } from '../../theme/responsiveChrome'
import {
  unityDialogueListColumnStyle,
  unityDialogueWorkspaceColumnStyle,
} from '../../theme/unityDialogueListShell'
import { theme } from '../../theme'
import { UnityDialogueList, type UnityDialogueListRef } from '../unityDialogues/UnityDialogueList'
import { UnityDialogueDetails } from '../unityDialogues/UnityDialogueDetails'
import { DialogueCombobox } from '../unityDialogues/DialogueCombobox'
import { DialogueEditionNarrowProvider } from '../unityDialogues/DialogueEditionNarrowContext'
import type { UnityDialogueMetadata } from '../../types/api'

interface DialogueEditionTabContentProps {
  selectedDialogue: UnityDialogueMetadata | null
  setSelectedDialogue: Dispatch<SetStateAction<UnityDialogueMetadata | null>>
  dialogueListRef: RefObject<UnityDialogueListRef>
  onGenerateContinuation: () => void
}

export function DialogueEditionTabContent({
  selectedDialogue,
  setSelectedDialogue,
  dialogueListRef,
  onGenerateContinuation,
}: DialogueEditionTabContentProps) {
  const {
    ref: dialogueEditionWorkspaceRef,
    isNarrow: isDialogueEditionNarrow,
  } = useNarrowInlineSize(PANEL_COMFORT_MIN_WIDTH_PX)

  const renderCombobox = (selectedFilename: string | null): ReactNode => (
    <DialogueCombobox
      ref={dialogueListRef}
      selectedFilename={selectedFilename}
      onSelect={setSelectedDialogue}
    />
  )

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        width: '100%',
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      {!isDialogueEditionNarrow && (
        <div style={unityDialogueListColumnStyle}>
          <UnityDialogueList
            ref={dialogueListRef}
            onSelectDialogue={setSelectedDialogue}
            selectedFilename={selectedDialogue?.filename || null}
          />
        </div>
      )}
      <div
        ref={dialogueEditionWorkspaceRef}
        style={unityDialogueWorkspaceColumnStyle}
      >
        <DialogueEditionNarrowProvider value={isDialogueEditionNarrow}>
          {selectedDialogue ? (
            <UnityDialogueDetails
              filename={selectedDialogue.filename}
              onClose={() => setSelectedDialogue(null)}
              onDeleted={async () => {
                await dialogueListRef.current?.refresh()
              }}
              onGenerateContinuation={onGenerateContinuation}
              headerSelector={
                isDialogueEditionNarrow ? renderCombobox(selectedDialogue.filename) : undefined
              }
            />
          ) : (
            <div
              style={{
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
            >
              {isDialogueEditionNarrow && renderCombobox(null)}
              <div
                style={{
                  padding: '1rem',
                  textAlign: 'center',
                  color: theme.text.secondary,
                }}
              >
                Sélectionnez un dialogue Unity pour le voir et l'éditer
              </div>
            </div>
          )}
        </DialogueEditionNarrowProvider>
      </div>
    </div>
  )
}
