/**
 * Composant pour afficher et éditer un dialogue Unity.
 */
import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import * as documentsAPI from '../../api/documents'
import { useGraphViewStore } from '../../store/graphViewStore'
import { getErrorMessage } from '../../types/errors'
import { theme } from '../../theme'
import { UnityDialogueEditor } from '../generation/UnityDialogueEditor'
import type { UnityDialogueEditorAction } from '../generation/UnityDialogueEditorLogic'
import { DialoguePermissionsPanel } from './DialoguePermissionsPanel'
import { DialogueMetadataPanel } from './DialogueMetadataPanel'
import { DialogueSharingModal } from './DialogueSharingModal'
import { useAuthStore } from '../../store/authStore'
import { formatDialogueTitle } from '../../utils/formatDialogueTitle'
import { consumePendingValidationFocus } from '../../utils/pendingValidationFocus'

interface UnityDialogueDetailsProps {
  filename: string
  onClose: () => void
  onDeleted?: () => void | Promise<void>
  /** Repart du nœud donné dans le graphe (« Générer la suite »). */
  onGenerateContinuation?: (target: { filename: string; nodeId: string }) => void
  /** Après l'enregistrement d'un nouveau titre : la liste doit le refléter. */
  onRenamed?: (title: string) => void | Promise<void>
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
  onRenamed,
  headerSelector,
}: UnityDialogueDetailsProps) {
  const authUser = useAuthStore((state) => state.user)
  const userRole = authUser?.role
  const [jsonContent, setJsonContent] = useState<string>('')
  const [title, setTitle] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  /** Dialogue dont l'état ci-dessous est le contenu : l'éditeur ne s'affiche que s'il correspond. */
  const [loadedFilename, setLoadedFilename] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [document, setDocument] = useState<Record<string, unknown> | null>(null)
  const [revision, setRevision] = useState(1)
  const [canEdit, setCanEdit] = useState(false)
  const [canDelete, setCanDelete] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [permissionsPanelOpen, setPermissionsPanelOpen] = useState(false)
  const [metadataPanelOpen, setMetadataPanelOpen] = useState(false)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [focusNodeId, setFocusNodeId] = useState<string | undefined>()
  const canManageShares = isOwner || userRole === 'admin'
  const canViewPermissions = Boolean(authUser && userRole !== 'guest')

  const loadDialogue = useCallback(async (propagateError = false) => {
    setIsLoading(true)
    setError(null)
    setFocusNodeId(undefined)
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
      setLoadedFilename(filename)
      // Story 8.8 : consommer le focus différé après load (parcours bibliothèque).
      setFocusNodeId(consumePendingValidationFocus())
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

  const handleDelete = useCallback(async () => {
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
  }, [filename, onClose, onDeleted])

  const actions = useMemo<UnityDialogueEditorAction[]>(() => {
    const list: UnityDialogueEditorAction[] = [
      {
        id: 'metadata',
        label: 'Métadonnées dialogue',
        testId: 'dialogue-metadata-open',
        onClick: () => setMetadataPanelOpen(true),
      },
    ]
    if (canManageShares) {
      list.push({
        id: 'share',
        label: 'Partager',
        testId: 'dialogue-share-open',
        onClick: () => setShareModalOpen(true),
      })
    }
    if (canViewPermissions) {
      list.push({
        id: 'permissions',
        label: 'Permissions',
        testId: 'dialogue-permissions-open',
        onClick: () => setPermissionsPanelOpen(true),
      })
    }
    list.push({
      id: 'close',
      label: 'Fermer le dialogue',
      testId: 'dialogue-close',
      overflowOnly: true,
      onClick: onClose,
    })
    if (canDelete) {
      list.push({
        id: 'delete',
        label: isDeleting ? 'Suppression...' : 'Supprimer',
        testId: 'dialogue-delete',
        overflowOnly: true,
        danger: true,
        disabled: isDeleting,
        onClick: () => void handleDelete(),
      })
    }
    return list
  }, [canDelete, canManageShares, canViewPermissions, handleDelete, isDeleting, onClose])

  const handleRenamed = useCallback(
    (nextTitle: string) => {
      setTitle(nextTitle)
      setDocument((prev) => (prev ? { ...prev, title: nextTitle } : prev))
      void onRenamed?.(nextTitle)
    },
    [onRenamed]
  )

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

  if (loadedFilename !== filename) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: theme.text.secondary }}>
        Chargement du dialogue...
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
      <DialogueMetadataPanel
        documentId={filename.replace(/\.json$/i, '')}
        open={metadataPanelOpen}
        onClose={() => setMetadataPanelOpen(false)}
      />
      <UnityDialogueEditor
        key={filename}
        json_content={jsonContent}
        title={title}
        subtitle={filename}
        filename={filename.replace(/\.json$/i, '')}
        document={document ?? undefined}
        documentRevision={revision}
        canEdit={canEdit}
        onSave={handleSave}
        onRenamed={handleRenamed}
        headerSelector={headerSelector}
        focusNodeId={focusNodeId}
        actions={actions}
        onGenerateContinuation={
          onGenerateContinuation
            ? (nodeId) => onGenerateContinuation({ filename, nodeId })
            : undefined
        }
      />
    </div>
  )
}

