/**
 * Composant pour afficher et éditer un dialogue Unity.
 */
import { useState, useEffect, useCallback } from 'react'
import * as unityDialoguesAPI from '../../api/unityDialogues'
import { getErrorMessage } from '../../types/errors'
import { theme } from '../../theme'
import { UnityDialogueEditor } from '../generation/UnityDialogueEditor'

interface UnityDialogueDetailsProps {
  filename: string
  onClose: () => void
  onDeleted?: () => void | Promise<void>
  onGenerateContinuation?: (dialogueJson: string, dialogueTitle: string) => void
}

export function UnityDialogueDetails({
  filename,
  onClose,
  onDeleted,
  onGenerateContinuation,
}: UnityDialogueDetailsProps) {
  const [jsonContent, setJsonContent] = useState<string>('')
  const [title, setTitle] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const formatFilename = (filename: string): string => {
    // Enlever l'extension .json et remplacer les underscores par des espaces
    const formatted = filename.replace(/\.json$/, '').replace(/_/g, ' ')
    // Ajouter une majuscule au premier mot
    return formatted.charAt(0).toUpperCase() + formatted.slice(1)
  }

  const loadDialogue = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await unityDialoguesAPI.getUnityDialogue(filename)
      setJsonContent(response.json_content)
      setTitle(formatFilename(filename))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }, [filename])

  useEffect(() => {
    void loadDialogue()
  }, [loadDialogue])

  const handleSave = useCallback(
    async () => {
      // Recharger le dialogue après sauvegarde
      await loadDialogue()
    },
    [loadDialogue]
  )

  const handleDelete = async () => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer "${filename}" ?`)) {
      return
    }

    setIsDeleting(true)
    try {
      await unityDialoguesAPI.deleteUnityDialogue(filename)
      // Notifier tous les consommateurs (ex. éditeur de graphe) pour synchroniser liste + canvas
      window.dispatchEvent(new CustomEvent('unity-dialogue-deleted', { detail: { filename } }))
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
          onClick={loadDialogue}
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
      <UnityDialogueEditor
        json_content={jsonContent}
        title={title}
        subtitle={filename}
        filename={filename.replace('.json', '')}
        onSave={handleSave}
        onCancel={onClose}
        extraActions={
          <>
            {onGenerateContinuation && (
              <button
                onClick={() => onGenerateContinuation(jsonContent, title)}
                style={{
                  padding: '0.5rem 1rem',
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: '6px',
                  backgroundColor: theme.button.primary.background,
                  color: theme.button.primary.color,
                  cursor: 'pointer',
                  fontWeight: 'bold',
                }}
                title="Générer un dialogue qui suit celui-ci"
              >
                Générer la suite
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              style={{
                padding: '0.5rem 1rem',
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '6px',
                backgroundColor: '#dc3545',
                color: '#ffffff',
                cursor: isDeleting ? 'not-allowed' : 'pointer',
                opacity: isDeleting ? 0.6 : 1,
                fontWeight: 700,
              }}
            >
              {isDeleting ? 'Suppression...' : 'Supprimer'}
            </button>
          </>
        }
      />
    </div>
  )
}

