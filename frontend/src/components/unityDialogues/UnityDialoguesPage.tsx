/**
 * Page dédiée pour la gestion des dialogues Unity JSON.
 */
import { useState, useRef } from 'react'
import { UnityDialogueList, type UnityDialogueListRef } from './UnityDialogueList'
import { UnityDialogueDetails } from './UnityDialogueDetails'
import { theme } from '../../theme'
import type { UnityDialogueMetadata } from '../../types/api'

export function UnityDialoguesPage() {
  const [selectedDialogue, setSelectedDialogue] = useState<UnityDialogueMetadata | null>(null)
  const dialogueListRef = useRef<UnityDialogueListRef>(null)

  const handleDialogueDeleted = async () => {
    await dialogueListRef.current?.refresh()
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div
        style={{
          // Panneau gauche compact pour laisser de la place au panneau d'édition
          width: 'clamp(260px, 22vw, 340px)',
          minWidth: '240px',
          borderRight: `1px solid ${theme.border.primary}`,
          overflow: 'hidden',
          backgroundColor: theme.background.panel,
        }}
      >
        <UnityDialogueList
          ref={dialogueListRef}
          onSelectDialogue={setSelectedDialogue}
          selectedFilename={selectedDialogue?.filename || null}
        />
      </div>
      <div style={{ flex: 1, overflow: 'hidden', backgroundColor: theme.background.panel }}>
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
      </div>
    </div>
  )
}

