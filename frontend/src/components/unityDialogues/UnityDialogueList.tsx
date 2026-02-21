/**
 * Composant pour afficher la liste des dialogues Unity avec recherche.
 */
import { useState, useEffect, useMemo, useImperativeHandle, forwardRef, useCallback, useRef } from 'react'
import * as unityDialoguesAPI from '../../api/unityDialogues'
import { getErrorMessage } from '../../types/errors'
import { theme } from '../../theme'
import type { UnityDialogueMetadata } from '../../types/api'
import { UnityDialogueItem } from './UnityDialogueItem'

interface UnityDialogueListProps {
  onSelectDialogue: (dialogue: UnityDialogueMetadata | null) => void
  selectedFilename: string | null
}

export interface UnityDialogueListRef {
  refresh: () => void | Promise<void>
}

export const UnityDialogueList = forwardRef<UnityDialogueListRef, UnityDialogueListProps>(
  function UnityDialogueList({ onSelectDialogue, selectedFilename }, ref) {
  const [dialogues, setDialogues] = useState<UnityDialogueMetadata[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const loadDialogues = useCallback(async () => {
    console.log('[UnityDialogueList] Chargement de la liste des dialogues')
    setIsLoading(true)
    setError(null)
    try {
      const response = await unityDialoguesAPI.listUnityDialogues()
      console.log(`[UnityDialogueList] ${response.dialogues.length} dialogue(s) chargé(s)`)
      setDialogues(response.dialogues)
    } catch (err) {
      console.error('[UnityDialogueList] Erreur lors du chargement:', err)
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDialogues()
  }, [loadDialogues])

  // Raccourci clavier pour focus sur la recherche (/)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ne pas intercepter si on est déjà dans un input/textarea ou si c'est la command palette
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }
      
      if (e.key === '/') {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const [sortType, setSortType] = useState<'name-asc' | 'name-desc' | 'date-desc' | 'date-asc'>('date-desc')

  // Filtrer et trier les dialogues
  const filteredDialogues = useMemo(() => {
    let result = dialogues
    
    // Filtrer
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (dialogue) =>
          dialogue.filename.toLowerCase().includes(query) ||
          (dialogue.title && dialogue.title.toLowerCase().includes(query))
      )
    }
    
    // Trier
    result = [...result].sort((a, b) => {
      switch (sortType) {
        case 'name-asc':
          return (a.title || a.filename).localeCompare(b.title || b.filename, 'fr', { sensitivity: 'base' })
        case 'name-desc':
          return (b.title || b.filename).localeCompare(a.title || a.filename, 'fr', { sensitivity: 'base' })
        case 'date-asc':
          return new Date(a.modified_time).getTime() - new Date(b.modified_time).getTime()
        case 'date-desc':
        default:
          return new Date(b.modified_time).getTime() - new Date(a.modified_time).getTime()
      }
    })
    
    return result
  }, [dialogues, searchQuery, sortType])

  // Exposer la fonction de rafraîchissement via ref
  useImperativeHandle(ref, () => ({
    refresh: loadDialogues,
  }), [loadDialogues])

  const handleItemClick = (dialogue: UnityDialogueMetadata) => {
    if (selectedFilename === dialogue.filename) {
      onSelectDialogue(null)
    } else {
      onSelectDialogue(dialogue)
    }
  }

  if (isLoading) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', color: theme.text.secondary }}>
        <div>Chargement des dialogues Unity...</div>
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
    <div data-testid="unity-dialogue-list" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: '0.75rem 0.75rem 0.5rem 0.75rem',
          borderBottom: `1px solid ${theme.border.primary}`,
          backgroundColor: theme.background.panelHeader,
        }}
      >
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Rechercher un dialogue... (/)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              padding: '0.6rem 0.75rem',
              border: `1px solid ${theme.input.border}`,
              borderRadius: '6px',
              boxSizing: 'border-box',
              backgroundColor: theme.input.background,
              color: theme.input.color,
            }}
          />
          <select
            value={sortType}
            onChange={(e) => setSortType(e.target.value as typeof sortType)}
            style={{
              padding: '0.6rem 0.75rem',
              border: `1px solid ${theme.input.border}`,
              borderRadius: '6px',
              backgroundColor: theme.input.background,
              color: theme.input.color,
              fontSize: '0.85rem',
            }}
            title="Trier les dialogues"
          >
            <option value="date-desc">Date (récent)</option>
            <option value="date-asc">Date (ancien)</option>
            <option value="name-asc">Nom (A-Z)</option>
            <option value="name-desc">Nom (Z-A)</option>
          </select>
        </div>

        <div style={{ fontSize: '0.85rem', color: theme.text.secondary }}>
          {filteredDialogues.length} dialogue{filteredDialogues.length !== 1 ? 's' : ''}
          {searchQuery && ` (sur ${dialogues.length} total)`}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
        {filteredDialogues.length === 0 ? (
          <div style={{ padding: '1rem', textAlign: 'center', color: theme.text.secondary }}>
            {searchQuery ? 'Aucun dialogue trouvé' : 'Aucun dialogue Unity'}
          </div>
        ) : (
          filteredDialogues.map((dialogue) => (
            <UnityDialogueItem
              key={dialogue.filename}
              dialogue={dialogue}
              onClick={() => handleItemClick(dialogue)}
              isSelected={selectedFilename === dialogue.filename}
              searchQuery={searchQuery}
            />
          ))
        )}
      </div>
    </div>
  )
  }
)
