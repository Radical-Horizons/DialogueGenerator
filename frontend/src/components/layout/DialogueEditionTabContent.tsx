/**
 * Contenu de l'onglet « Édition de Dialogues » (Story 17.7).
 *
 * Sous-composant dédié : le hook `useNarrowInlineSize` vit ici (pas dans
 * `Dashboard`) pour colocaliser la mesure narrow avec le workspace édition
 * et éviter de coupler le shell global au layout liste + détails Unity.
 * Story 17.8 (callback ref) rend ce découpage optionnel côté mesure, mais
 * la séparation reste la bonne frontière de responsabilité.
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
    ref: dialogueEditionShellRef,
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
      ref={dialogueEditionShellRef}
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
