/**
 * Onglet pour gérer les fichiers de prompts (system prompt, author profiles, scene instructions).
 */
import { useState, useEffect } from 'react'
import * as configAPI from '../../api/config'
import { useToast } from '../shared'
import { theme } from '../../theme'

export function PromptsTab() {
  const [paths, setPaths] = useState<configAPI.TemplateFilePathsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  useEffect(() => {
    loadPaths()
  }, [])

  const loadPaths = async () => {
    try {
      const response = await configAPI.getTemplateFilePaths()
      setPaths(response)
      setError(null)
    } catch (err) {
      setError('Erreur lors du chargement des chemins')
      console.error('Erreur lors du chargement des chemins:', err)
    }
  }

  const openPath = (path: string) => {
    // Pour une application web, on ne peut pas ouvrir directement un fichier dans l'éditeur du système
    // On copie le chemin dans le presse-papiers pour que l'utilisateur puisse l'utiliser
    navigator.clipboard.writeText(path).then(() => {
      // Afficher un toast temporaire
      toast(`Chemin copié dans le presse-papiers: ${path}`, 'success', 5000)
    }).catch(() => {
      // Fallback si clipboard API n'est pas disponible
      const copied = prompt('Copiez ce chemin:', path)
      if (copied) {
        // L'utilisateur a copié manuellement
        toast('Chemin copié manuellement', 'info')
      }
    })
  }

  return (
    <div>
      <h3 style={{ marginTop: 0, color: theme.text.primary }}>Fichiers de Prompts</h3>
      <p style={{ color: theme.text.secondary, marginBottom: '1.5rem' }}>
        Cliquez sur un chemin pour le copier dans le presse-papiers et l'ouvrir dans votre explorateur de fichiers.
      </p>

      {error && (
        <div style={{ 
          padding: '0.75rem', 
          backgroundColor: theme.state.error.background,
          color: theme.state.error.color, 
          borderRadius: '4px',
          marginBottom: '1rem'
        }}>
          {error}
        </div>
      )}

      {paths && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: theme.text.primary, fontWeight: 600 }}>
              System Prompt (défaut)
            </label>
            <button
              onClick={() => openPath(paths.system_prompt_path)}
              style={{
                width: '100%',
                padding: '0.5rem',
                textAlign: 'left',
                backgroundColor: theme.button.default.background,
                color: theme.button.default.color,
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '4px',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                wordBreak: 'break-all',
              }}
              title="Cliquer pour copier le chemin"
            >
              {paths.system_prompt_path}
            </button>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: theme.text.primary, fontWeight: 600 }}>
              Instructions de Scène
            </label>
            <button
              onClick={() => openPath(paths.scene_instructions_dir)}
              style={{
                width: '100%',
                padding: '0.5rem',
                textAlign: 'left',
                backgroundColor: theme.button.default.background,
                color: theme.button.default.color,
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '4px',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                wordBreak: 'break-all',
              }}
              title="Cliquer pour copier le chemin"
            >
              {paths.scene_instructions_dir}
            </button>
            <p style={{ fontSize: '0.8rem', color: theme.text.secondary, marginTop: '0.25rem', marginBottom: 0 }}>
              Répertoire contenant : conversation.txt, action_scene.txt, intimate_moment.txt, revelation.txt, humor.txt, confrontation.txt
            </p>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: theme.text.primary, fontWeight: 600 }}>
              Profils d'Auteur
            </label>
            <button
              onClick={() => openPath(paths.author_profiles_dir)}
              style={{
                width: '100%',
                padding: '0.5rem',
                textAlign: 'left',
                backgroundColor: theme.button.default.background,
                color: theme.button.default.color,
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '4px',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                wordBreak: 'break-all',
              }}
              title="Cliquer pour copier le chemin"
            >
              {paths.author_profiles_dir}
            </button>
            <p style={{ fontSize: '0.8rem', color: theme.text.secondary, marginTop: '0.25rem', marginBottom: 0 }}>
              Répertoire contenant : default.txt, literary.txt, minimal.txt, humorous.txt
            </p>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: theme.text.primary, fontWeight: 600 }}>
              Répertoire de Configuration
            </label>
            <button
              onClick={() => openPath(paths.config_dir)}
              style={{
                width: '100%',
                padding: '0.5rem',
                textAlign: 'left',
                backgroundColor: theme.button.default.background,
                color: theme.button.default.color,
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '4px',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                wordBreak: 'break-all',
              }}
              title="Cliquer pour copier le chemin"
            >
              {paths.config_dir}
            </button>
            <p style={{ fontSize: '0.8rem', color: theme.text.secondary, marginTop: '0.25rem', marginBottom: 0 }}>
              Répertoire principal contenant tous les fichiers de configuration
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

