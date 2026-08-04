/**
 * Page dédiée pour la gestion des dialogues Unity JSON.
 */
import { useState, useRef } from 'react'
import { useNarrowInlineSize } from '../../hooks/useNarrowInlineSize'
import { PANEL_COMFORT_MIN_WIDTH_PX } from '../../theme/responsiveChrome'
import { UnityDialogueList, type UnityDialogueListRef } from './UnityDialogueList'
import { DialogueEditionNarrowProvider } from './DialogueEditionNarrowContext'
import { UnityDialogueDetails } from './UnityDialogueDetails'
import { theme } from '../../theme'
import type { UnityDialogueMetadata } from '../../types/api'
import { setPendingValidationFocus } from '../../utils/pendingValidationFocus'

export function UnityDialoguesPage() {
  const [selectedDialogue, setSelectedDialogue] = useState<UnityDialogueMetadata | null>(null)
  const dialogueListRef = useRef<UnityDialogueListRef>(null)
  const { ref: pageRef, isNarrow: isPageNarrow } = useNarrowInlineSize(700)
  const { ref: editionWorkspaceRef, isNarrow: isEditionWorkspaceNarrow } = useNarrowInlineSize(
    PANEL_COMFORT_MIN_WIDTH_PX
  )

  const handleDialogueDeleted = async () => {
    await dialogueListRef.current?.refresh()
  }

  const handleOpenValidatedDialogue = (documentId: string, focusNodeId?: string) => {
    setPendingValidationFocus(focusNodeId)
    setSelectedDialogue({
      filename: `${documentId}.json`,
      file_path: '',
      size_bytes: 0,
      modified_time: new Date().toISOString(),
    })
  }

  return (
    <div ref={pageRef} style={{ display: 'flex', height: '100%', minWidth: 0 }}>
      <div
        style={{
          width: isPageNarrow ? '100%' : 'clamp(260px, 22vw, 340px)',
          minWidth: isPageNarrow ? 0 : '240px',
          borderRight: `1px solid ${theme.border.primary}`,
          overflow: 'hidden',
          backgroundColor: theme.background.panel,
          display: isPageNarrow && selectedDialogue ? 'none' : 'block',
        }}
      >
        <UnityDialogueList
          ref={dialogueListRef}
          onSelectDialogue={setSelectedDialogue}
          selectedFilename={selectedDialogue?.filename || null}
          onOpenValidatedDialogue={handleOpenValidatedDialogue}
        />
      </div>
      <div
        ref={editionWorkspaceRef}
        style={{
          flex: 1,
          overflow: 'hidden',
          backgroundColor: theme.background.panel,
          minWidth: 0,
          display: isPageNarrow && !selectedDialogue ? 'none' : 'block',
        }}
      >
        <DialogueEditionNarrowProvider value={isEditionWorkspaceNarrow}>
          {selectedDialogue ? (
            <UnityDialogueDetails
              filename={selectedDialogue.filename}
              onClose={() => setSelectedDialogue(null)}
              onDeleted={handleDialogueDeleted}
            />
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: theme.text.secondary }}>
              Sélectionnez un dialogue Unity pour le voir et l'éditer
            </div>
          )}
        </DialogueEditionNarrowProvider>
      </div>
    </div>
  )
}

