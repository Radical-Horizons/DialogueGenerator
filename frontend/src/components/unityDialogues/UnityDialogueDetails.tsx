/**
 * Composant pour afficher et éditer un dialogue Unity.
 */
import { useState, useEffect, useCallback, type ReactNode } from 'react'
import * as documentsAPI from '../../api/documents'
import { useGraphViewStore } from '../../store/graphViewStore'
import { getErrorMessage } from '../../types/errors'
import { theme } from '../../theme'
import { unityDialogueEditorChrome } from '../../theme/responsiveChrome'
import { UnityDialogueEditor } from '../generation/UnityDialogueEditor'
import { useDialogueEditionNarrow } from './DialogueEditionNarrowContext'
import { DialoguePermissionsPanel } from './DialoguePermissionsPanel'
import { DialogueSharingModal } from './DialogueSharingModal'
import { useAuthStore } from '../../store/authStore'
import { formatDialogueTitle } from '../../utils/formatDialogueTitle'

interface UnityDialogueDetailsProps {
  filename: string
  onClose: () => void
  onDeleted?: () => void | Promise<void>
  onGenerateContinuation?: (dialogueJson: string, dialogueTitle: string) => void
  /**
   * Slot optionnel placé dans le header de l'éditeur (Story 17.7).
   * Forwardé vers `UnityDialogueEditor.headerSelector`.
   */
  headerSelector?: ReactNode
}

export function UnityDialogueDetails({
  filename,
  onClose,
  onDeleted,
  onGenerateContinuation,
  headerSelector,
}: UnityDialogueDetailsProps) {
  const isNarrow = useDialogueEditionNarrow()
  const tb = isNarrow ? unityDialogueEditorChrome.narrow : unityDialogueEditorChrome.comfortable
  const authUser = useAuthStore((state) => state.user)
  const userRole = authUser?.role
  const [jsonContent, setJsonContent] = useState<string>('')
  const [title, setTitle] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [document, setDocument] = useState<Record<string, unknown> | null>(null)
  const [revision, setRevision] = useState(1)
  const [canEdit, setCanEdit] = useState(false)
  const [canDelete, setCanDelete] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [permissionsPanelOpen, setPermissionsPanelOpen] = useState(false)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const canManageShares = isOwner || userRole === 'admin'
  const canViewPermissions = Boolean(authUser && userRole !== 'guest')

  const loadDialogue = useCallback(async (propagateError = false) => {
    setIsLoading(true)
    setError(null)
    try {
      const documentId = filename.replace(/\.json$/i, '')
      const response = await documentsAPI.getDocument(documentId)
      setDocument(response.document)
      setRevision(response.revision)
      setCanEdit(response.capabilities?.can_edit ?? false)
      setCanDelete(response.capabilities?.can_delete ?? false)
      setIsOwner(response.capabilities?.is_owner ?? false)
      const nodes = Array.isArray(response.document.nodes)
        ? response.document.nodes
        : []
      setJsonContent(JSON.stringify(nodes, null, 2))
      setTitle(
        typeof response.document.title === 'string' && response.document.title.trim()
          ? response.document.title
          : formatDialogueTitle(filename)
      )
    } catch (err) {
      setError(getErrorMessage(err))
      if (propagateError) {
        throw err
      }
    } finally {
      setIsLoading(false)
    }
  }, [filename])

  useEffect(() => {
    void loadDialogue()
  }, [loadDialogue])

  const handleSave = useCallback(
    async (_savedFilename: string, savedRevision: number) => {
      setRevision(savedRevision)
    },
    []
  )

  const handleDelete = async () => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer "${filename}" ?`)) {
      return
    }

    setIsDeleting(true)
    try {
      await documentsAPI.deleteDocument(filename.replace(/\.json$/i, ''))
      // Notifier tous les consommateurs (ex. éditeur de graphe) pour synchroniser liste + canvas
      useGraphViewStore.getState().notifyDialogueDeleted(filename)
      // Rafraîchir la liste puis fermer : attendre le refresh pour que la liste soit à jour avant de fermer le panneau
      if (onDeleted) {
        await Promise.resolve(onDeleted())
      }
      onClose()
    } catch (err) {
      setError(getErrorMessage(err))
      setIsDeleting(false)
    }
  }

  if (isLoading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: theme.text.secondary }}>
        Chargement du dialogue...
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          padding: '1rem',
          color: theme.state.error.color,
          backgroundColor: theme.state.error.background,
          borderRadius: '4px',
        }}
      >
        {error}
        <button
          onClick={() => void loadDialogue()}
          style={{
            marginTop: '0.5rem',
            padding: '0.5rem 1rem',
            border: `1px solid ${theme.border.primary}`,
            borderRadius: '4px',
            backgroundColor: theme.button.default.background,
            color: theme.button.default.color,
            cursor: 'pointer',
          }}
        >
          Réessayer
        </button>
      </div>
    )
  }

  if (!jsonContent) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: theme.text.secondary }}>
        Aucun contenu à afficher
      </div>
    )
  }

  return (
    <div style={{ height: '100%', overflow: 'hidden' }}>
      <DialogueSharingModal
        documentId={filename.replace(/\.json$/i, '')}
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
      />
      <DialoguePermissionsPanel
        documentId={filename.replace(/\.json$/i, '')}
        open={permissionsPanelOpen}
        onClose={() => setPermissionsPanelOpen(false)}
      />
      <UnityDialogueEditor
        json_content={jsonContent}
        title={title}
        subtitle={filename}
        filename={filename.replace('.json', '')}
        document={document ?? undefined}
        documentRevision={revision}
        canEdit={canEdit}
        onSave={handleSave}
        onCancel={onClose}
        headerSelector={headerSelector}
        extraActions={
          <>
            {canViewPermissions && (
              <div style={{ width: isNarrow ? '100%' : undefined }}>
                <button
                  type="button"
                  data-testid="dialogue-permissions-open"
                  onClick={() => setPermissionsPanelOpen(true)}
                  style={{
                    padding: tb.toolbarButtonPadding,
                    minHeight: `${tb.toolbarButtonMinHeightPx}px`,
                    border: `1px solid ${theme.border.primary}`,
                    borderRadius: '6px',
                    backgroundColor: theme.button.secondary.background,
                    color: theme.button.secondary.color,
                    cursor: 'pointer',
                    fontSize: `${tb.toolbarButtonFontRem}rem`,
                    fontWeight: tb.toolbarButtonFontWeight,
                    lineHeight: 1.25,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    width: isNarrow ? '100%' : undefined,
                    minWidth: isNarrow ? 0 : undefined,
                  }}
                >
                  Permissions
                </button>
              </div>
            )}
            {canManageShares && (
              <div style={{ gridArea: isNarrow ? 'share' : undefined, width: isNarrow ? '100%' : undefined }}>
                <button
                  type="button"
                  data-testid="dialogue-share-open"
                  onClick={() => setShareModalOpen(true)}
                  style={{
                    padding: tb.toolbarButtonPadding,
                    minHeight: `${tb.toolbarButtonMinHeightPx}px`,
                    border: `1px solid ${theme.border.primary}`,
                    borderRadius: '6px',
                    backgroundColor: theme.button.secondary.background,
                    color: theme.button.secondary.color,
                    cursor: 'pointer',
                    fontSize: `${tb.toolbarButtonFontRem}rem`,
                    fontWeight: tb.toolbarButtonFontWeight,
                    lineHeight: 1.25,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    width: isNarrow ? '100%' : undefined,
                    minWidth: isNarrow ? 0 : undefined,
                  }}
                >
                  Partager
                </button>
              </div>
            )}
            {onGenerateContinuation && (
              <div style={{ gridArea: isNarrow ? 'generate' : undefined, width: isNarrow ? '100%' : undefined }}>
                <button
                  onClick={() => onGenerateContinuation(jsonContent, title)}
                  style={{
                    padding: tb.toolbarButtonPadding,
                    minHeight: `${tb.toolbarButtonMinHeightPx}px`,
                    border: `1px solid ${theme.border.primary}`,
                    borderRadius: '6px',
                    backgroundColor: theme.button.primary.background,
                    color: theme.button.primary.color,
                    cursor: 'pointer',
                    fontSize: `${tb.toolbarButtonFontRem}rem`,
                    fontWeight: tb.toolbarButtonFontWeight,
                    lineHeight: 1.25,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    width: isNarrow ? '100%' : undefined,
                    minWidth: isNarrow ? 0 : undefined,
                  }}
                  title="Générer un dialogue qui suit celui-ci"
                >
                  Générer la suite
                </button>
              </div>
            )}
            {canDelete && <div style={{ gridArea: isNarrow ? 'delete' : undefined, width: isNarrow ? '100%' : undefined }}>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                style={{
                  padding: tb.toolbarButtonPadding,
                  minHeight: `${tb.toolbarButtonMinHeightPx}px`,
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: '6px',
                  backgroundColor: '#dc3545',
                  color: '#ffffff',
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                  opacity: isDeleting ? 0.6 : 1,
                  fontSize: `${tb.toolbarButtonFontRem}rem`,
                  fontWeight: tb.toolbarButtonFontWeight,
                  lineHeight: 1.25,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxSizing: 'border-box',
                  width: isNarrow ? '100%' : undefined,
                  minWidth: isNarrow ? 0 : undefined,
                }}
              >
                {isDeleting ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>}
          </>
        }
      />
    </div>
  )
}

