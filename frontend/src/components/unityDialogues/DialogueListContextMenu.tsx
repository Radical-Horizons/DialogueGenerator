/**
 * Menu contextuel pour un dialogue dans la liste / combobox (éditeur de graphe).
 */
import { useCallback, useEffect, useState, type CSSProperties } from 'react'

import * as unityDialoguesAPI from '../../api/unityDialogues'
import { useGraphViewStore } from '../../store/graphViewStore'
import { useGraphStore } from '../../store/graphStore'
import { theme } from '../../theme'
import type { UnityDialogueMetadata } from '../../types/api'
import { getErrorMessage } from '../../types/errors'
import { clampContextMenuToViewport } from '../../utils/contextMenuPlacement'
import { getDialogueDisplayTitle } from '../../utils/formatDialogueTitle'

export interface DialogueListContextMenuState {
  dialogue: UnityDialogueMetadata
  clientX: number
  clientY: number
}

interface DialogueListContextMenuProps {
  state: DialogueListContextMenuState
  onClose: () => void
  onSelect?: (dialogue: UnityDialogueMetadata) => void
  onValidateSchema?: (dialogue: UnityDialogueMetadata) => void
  onDownload?: (dialogue: UnityDialogueMetadata) => void
  onDeleted?: () => void | Promise<void>
}

export function DialogueListContextMenu({
  state,
  onClose,
  onSelect,
  onValidateSchema,
  onDownload,
  onDeleted,
}: DialogueListContextMenuProps) {
  const { dialogue } = state
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasUnsavedChanges = useGraphStore((store) => store.hasUnsavedChanges)
  const openDocumentId = useGraphStore((store) => store.documentId)

  const { left, top } = clampContextMenuToViewport(
    state.clientX,
    state.clientY,
    220,
    onValidateSchema ? 200 : 120,
  )

  const title = getDialogueDisplayTitle(dialogue)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-testid="dialogue-list-context-menu"]')) {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onMouseDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', onMouseDown)
    }
  }, [onClose])

  const handleDelete = useCallback(async () => {
    if (isDeleting) return
    const dialogueId = dialogue.filename.replace(/\.json$/i, '')
    const deletesOpenDirtyDialogue =
      hasUnsavedChanges &&
      openDocumentId?.replace(/\.json$/i, '') === dialogueId
    const warning = deletesOpenDirtyDialogue
      ? ' Les modifications non sauvegardées seront perdues.'
      : ''
    if (!window.confirm(`Supprimer le dialogue « ${title} » ?${warning} Cette action est irréversible.`)) {
      return
    }
    setIsDeleting(true)
    setError(null)
    try {
      await unityDialoguesAPI.deleteUnityDialogue(dialogue.filename)
      useGraphViewStore.getState().notifyDialogueDeleted(dialogue.filename)
      if (onDeleted) {
        await Promise.resolve(onDeleted())
      }
      onClose()
    } catch (err) {
      setError(getErrorMessage(err))
      setIsDeleting(false)
    }
  }, [
    dialogue.filename,
    hasUnsavedChanges,
    isDeleting,
    onClose,
    onDeleted,
    openDocumentId,
    title,
  ])

  const menuItemStyle: CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: 'none',
    background: 'transparent',
    color: theme.text.primary,
    textAlign: 'left',
    fontSize: '0.85rem',
    cursor: 'pointer',
  }

  return (
    <div
      data-testid="dialogue-list-context-menu"
      role="menu"
      aria-label={`Actions sur ${title}`}
      style={{
        position: 'fixed',
        top,
        left,
        zIndex: 10050,
        minWidth: '200px',
        backgroundColor: theme.background.tertiary,
        border: `1px solid ${theme.border.primary}`,
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        padding: '4px 0',
      }}
    >
      {onSelect && (
        <button
          type="button"
          role="menuitem"
          style={menuItemStyle}
          onClick={() => {
            onSelect(dialogue)
            onClose()
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = theme.state.hover.background
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          Ouvrir le dialogue
        </button>
      )}
      {onValidateSchema && (
        <button
          type="button"
          role="menuitem"
          data-testid="dialogue-list-context-validate-schema"
          style={menuItemStyle}
          onClick={() => {
            onValidateSchema(dialogue)
            onClose()
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = theme.state.hover.background
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          Valider le schéma Unity
        </button>
      )}
      {onDownload && (
        <button
          type="button"
          role="menuitem"
          data-testid="dialogue-list-context-download"
          style={menuItemStyle}
          onClick={() => {
            onDownload(dialogue)
            onClose()
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = theme.state.hover.background
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          Télécharger
        </button>
      )}
      {dialogue.capabilities?.can_delete === true && <button
        type="button"
        role="menuitem"
        data-testid="dialogue-list-context-delete"
        disabled={isDeleting}
        style={{
          ...menuItemStyle,
          color: theme.state.error.color,
          cursor: isDeleting ? 'not-allowed' : 'pointer',
          opacity: isDeleting ? 0.6 : 1,
        }}
        onClick={() => void handleDelete()}
        onMouseEnter={(e) => {
          if (!isDeleting) e.currentTarget.style.backgroundColor = theme.state.hover.background
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent'
        }}
      >
        {isDeleting ? 'Suppression…' : 'Supprimer le dialogue'}
      </button>}
      {error && (
        <div
          style={{
            padding: '0.35rem 0.75rem',
            fontSize: '0.75rem',
            color: theme.state.error.color,
          }}
        >
          {error}
        </div>
      )}
    </div>
  )
}
