/**
 * Onglet Continuité pour sélectionner un dialogue Unity précédent comme contexte.
 */
import { memo, useState, useEffect, useCallback } from 'react'
import * as unityDialoguesAPI from '../../api/unityDialogues'
import { getErrorMessage } from '../../types/errors'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import type { UnityDialogueMetadata } from '../../types/api'

export interface ContinuityTabProps {
  onSelectContext?: (filename: string | null, previewText: string) => void
}

export const ContinuityTab = memo(function ContinuityTab({
  onSelectContext,
}: ContinuityTabProps) {
  const [dialogues, setDialogues] = useState<UnityDialogueMetadata[]>([])
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null)
  const [contextPreview, setContextPreview] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const formatFilename = (filename: string): string => {
    // Enlever l'extension .json et remplacer les underscores par des espaces
    const formatted = filename.replace(/\.json$/, '').replace(/_/g, ' ')
    // Ajouter une majuscule au premier mot
    return formatted.charAt(0).toUpperCase() + formatted.slice(1)
  }

  const loadDialogues = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await unityDialoguesAPI.listUnityDialogues()
      setDialogues(response.dialogues)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDialogues()
  }, [loadDialogues])

  const loadPreview = useCallback(async (filename: string) => {
    setIsLoadingPreview(true)
    try {
      // Charger le dialogue
      const dialogue = await unityDialoguesAPI.getUnityDialogue(filename)
      // Générer le preview
      const previewResponse = await unityDialoguesAPI.previewUnityDialogue({
        json_content: dialogue.json_content,
      })
      setContextPreview(previewResponse.preview_text)
    } catch (err) {
      console.error('Erreur lors du chargement du preview:', err)
      setContextPreview('')
    } finally {
      setIsLoadingPreview(false)
    }
  }, [])

  useEffect(() => {
    if (selectedFilename) {
      loadPreview(selectedFilename)
    } else {
      setContextPreview('')
    }
  }, [selectedFilename, loadPreview])

  const handleUseContext = useCallback(() => {
    if (selectedFilename && contextPreview) {
      onSelectContext?.(selectedFilename, contextPreview)
    }
  }, [selectedFilename, contextPreview, onSelectContext])

  if (isLoading) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', color: theme.text.secondary }}>
        Chargement des dialogues Unity...
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
          onClick={loadDialogues}
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

  return (
    <div
      style={{
        padding: '1rem',
        height: '100%',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }}
    >
      <div>
        <h4 style={{ marginTop: 0, marginBottom: '0.5rem', color: theme.text.primary }}>
          Dialogues Unity Existants
        </h4>
        <div
          style={{
            maxHeight: '200px',
            overflowY: 'auto',
            border: `1px solid ${theme.border.primary}`,
            borderRadius: '4px',
          }}
        >
          {dialogues.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: theme.text.secondary }}>
              Aucun dialogue Unity
            </div>
          ) : (
            dialogues.map((dialogue) => (
              <div
                key={dialogue.filename}
                onClick={() => setSelectedFilename(dialogue.filename)}
                style={{
                  padding: '0.75rem',
                  borderBottom: `1px solid ${theme.border.primary}`,
                  backgroundColor:
                    selectedFilename === dialogue.filename
                      ? theme.state.selected.background
                      : 'transparent',
                  color: theme.text.primary,
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (selectedFilename !== dialogue.filename) {
                    e.currentTarget.style.backgroundColor = theme.state.hover.background
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedFilename !== dialogue.filename) {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }
                }}
              >
                {formatFilename(dialogue.filename)}
              </div>
            ))
          )}
        </div>
      </div>

      {selectedFilename && (
        <>
          <div>
            <h4 style={{ marginTop: 0, marginBottom: '0.5rem', color: theme.text.primary }}>
              Dialogue Sélectionné
            </h4>
            <div
              style={{
                padding: '0.75rem',
                backgroundColor: theme.background.secondary,
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '4px',
              }}
            >
              <strong style={{ color: theme.text.primary }}>
                {selectedFilename ? formatFilename(selectedFilename) : ''}
              </strong>
            </div>
          </div>

          <div>
            <h4 style={{ marginTop: 0, marginBottom: '0.5rem', color: theme.text.primary }}>
              Aperçu du contexte injecté dans le LLM
            </h4>
            {isLoadingPreview ? (
              <div style={{ padding: '1rem', textAlign: 'center', color: theme.text.secondary }}>
                Chargement du preview...
              </div>
            ) : (
              <pre
                style={{
                  padding: '1rem',
                  backgroundColor: theme.background.secondary,
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: remSize('small'),
                  color: theme.text.secondary,
                  maxHeight: '200px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word',
                }}
              >
                {contextPreview || 'Aucun aperçu disponible'}
              </pre>
            )}
          </div>

          <button
            onClick={handleUseContext}
            disabled={!selectedFilename || !contextPreview}
            style={{
              padding: '0.75rem 1.5rem',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: theme.button.primary.background,
              color: theme.button.primary.color,
              cursor: !selectedFilename || !contextPreview ? 'not-allowed' : 'pointer',
              opacity: !selectedFilename || !contextPreview ? 0.6 : 1,
            }}
          >
            Utiliser comme Contexte de Départ
          </button>
        </>
      )}
    </div>
  )
})
