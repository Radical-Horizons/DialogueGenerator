/**
 * Dialog pour configurer le chemin Unity Dialogues Path.
 */
import { useState, useEffect } from 'react'
import * as configAPI from '../../api/config'
import { getErrorMessage } from '../../types/errors'
import { theme } from '../../theme'

interface UnityConfigDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function UnityConfigDialog({ isOpen, onClose }: UnityConfigDialogProps) {
  const [path, setPath] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadPath()
    }
  }, [isOpen])

  const loadPath = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await configAPI.getUnityDialoguesPath()
      setPath(response.path)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    try {
      await configAPI.setUnityDialoguesPath(path)
      onClose()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: theme.background.panel,
          padding: '1.5rem',
          borderRadius: '8px',
          minWidth: '400px',
          maxWidth: '600px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, marginBottom: '1rem', color: theme.text.primary }}>
          Configuration Unity Dialogues Path
        </h2>

        {error && (
          <div style={{ 
            padding: '0.5rem', 
            backgroundColor: theme.state.error.background, 
            color: theme.state.error.color, 
            marginBottom: '1rem',
            borderRadius: '4px',
          }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: theme.text.primary }}>
            Chemin vers le dossier Unity des dialogues:
          </label>
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            disabled={isLoading}
            placeholder="Ex: F:/Unity/Alteir/Alteir_Cursor/Assets/Dialogue/generated"
            style={{ 
              width: '100%', 
              padding: '0.5rem', 
              boxSizing: 'border-box',
              backgroundColor: theme.input.background,
              border: `1px solid ${theme.input.border}`,
              color: theme.input.color,
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={isSaving}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || isLoading}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: theme.button.primary.background,
              color: theme.button.primary.color,
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: isSaving || isLoading ? 'not-allowed' : 'pointer',
              opacity: isSaving || isLoading ? 0.6 : 1,
            }}
          >
            {isSaving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </div>
  )
}



