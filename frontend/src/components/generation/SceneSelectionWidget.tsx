/**
 * Widget pour sélectionner la scène principale (personnages A/B, région, sous-lieu).
 */
import { memo, useCallback, useEffect, useState } from 'react'
import { Combobox, type ComboboxOption } from '../shared/Combobox'
import { useSceneSelection } from '../../hooks/useSceneSelection'
import { useGenerationStore } from '../../store/generationStore'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { theme } from '../../theme'

export const SceneSelectionWidget = memo(function SceneSelectionWidget() {
  const { data, selection, updateSelection, swapCharacters, randomizeField, isLoading } =
    useSceneSelection()
  const { setSceneSelection } = useGenerationStore()
  const [recentCharacters, setRecentCharacters] = useState<string[]>([])
  const [recentRegions, setRecentRegions] = useState<string[]>([])

  useEffect(() => {
    setSceneSelection(selection)
  }, [selection, setSceneSelection])

  // Raccourci clavier pour swap (Alt+S)
  useKeyboardShortcuts(
    [
      {
        key: 'alt+s',
        handler: () => {
          if (selection.characterA || selection.characterB) {
            swapCharacters()
          }
        },
        description: 'Échanger les personnages (swap)',
        enabled: !!(selection.characterA || selection.characterB),
      },
    ],
    [selection, swapCharacters]
  )

  const handleCharacterAChange = useCallback(
    (value: string | null) => {
      updateSelection({ characterA: value })
    },
    [updateSelection]
  )

  const handleCharacterBChange = useCallback(
    (value: string | null) => {
      updateSelection({ characterB: value })
    },
    [updateSelection]
  )

  const handleRegionChange = useCallback(
    (value: string | null) => {
      updateSelection({ sceneRegion: value, subLocation: null })
    },
    [updateSelection]
  )

  const handleSubLocationChange = useCallback(
    (value: string | null) => {
      updateSelection({ subLocation: value })
    },
    [updateSelection]
  )

  const characterOptions: ComboboxOption[] = data.characters.map((name) => ({
    value: name,
    label: name,
  }))

  const regionOptions: ComboboxOption[] = data.regions.map((name) => ({
    value: name,
    label: name,
  }))

  const subLocationOptions: ComboboxOption[] = data.subLocations.map((name) => ({
    value: name,
    label: name,
  }))

  const randomButtonStyle: React.CSSProperties = {
    width: '28px',
    height: '28px',
    padding: 0,
    border: `1px solid ${theme.border.primary}`,
    borderRadius: '4px',
    backgroundColor: theme.button.default.background,
    color: theme.button.default.color,
    cursor: 'pointer',
    fontSize: '0.9rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    opacity: 1,
  }

  const hasContext = selection.characterA || selection.characterB || selection.sceneRegion

  if (!hasContext && !isLoading) {
    return (
      <div
        style={{
          padding: '2rem',
          border: `1px dashed ${theme.border.primary}`,
          borderRadius: '4px',
          backgroundColor: theme.background.tertiary,
          marginBottom: '1rem',
          textAlign: 'center',
        }}
      >
        <div style={{ color: theme.text.secondary, marginBottom: '1rem' }}>
          <strong style={{ color: theme.text.primary, display: 'block', marginBottom: '0.5rem' }}>
            Aucun contexte sélectionné
          </strong>
          Choisis PJ/PNJ + région, ou charge une interaction existante à droite
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        padding: '0.75rem',
        border: `1px solid ${theme.border.primary}`,
        borderRadius: '4px',
        backgroundColor: theme.background.panel,
        marginBottom: '1rem',
      }}
    >
      <h3
        style={{
          marginTop: 0,
          marginBottom: '0.5rem',
          fontSize: '0.875rem',
          fontWeight: 'bold',
          color: theme.text.primary,
        }}
      >
        Scène Principale
      </h3>

      {/* Ligne 1: Personnages */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'center',
          marginBottom: '0.5rem',
        }}
      >
        <div style={{ flex: '1 1 0', display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <Combobox
              options={characterOptions}
              value={selection.characterA}
              onChange={handleCharacterAChange}
              placeholder="PJ: (Aucun) - Rechercher..."
              disabled={isLoading}
              allowClear
              recentlyUsed={recentCharacters}
              onRecentUpdate={setRecentCharacters}
            />
          </div>
          <button
            onClick={() => randomizeField('characterA')}
            disabled={isLoading || data.characters.length === 0}
            title="PJ Aléatoire"
            style={{
              ...randomButtonStyle,
              cursor: isLoading || data.characters.length === 0 ? 'not-allowed' : 'pointer',
              opacity: isLoading || data.characters.length === 0 ? 0.5 : 1,
            }}
          >
            🎲
          </button>
        </div>

        <button
          onClick={swapCharacters}
          disabled={isLoading || (!selection.characterA && !selection.characterB)}
          title="Échanger PJ et PNJ (Alt+S)"
          style={{
            width: '28px',
            height: '28px',
            padding: 0,
            border: `1px solid ${theme.border.primary}`,
            borderRadius: '4px',
            backgroundColor: theme.button.default.background,
            color: theme.button.default.color,
            cursor:
              isLoading || (!selection.characterA && !selection.characterB)
                ? 'not-allowed'
                : 'pointer',
            opacity:
              isLoading || (!selection.characterA && !selection.characterB)
                ? 0.5
                : 1,
            fontSize: '1.1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          ⇄
        </button>

        <div style={{ flex: '1 1 0', display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <Combobox
              options={characterOptions}
              value={selection.characterB}
              onChange={handleCharacterBChange}
              placeholder="PNJ: (Aucun) - Rechercher..."
              disabled={isLoading}
              allowClear
              recentlyUsed={recentCharacters}
              onRecentUpdate={setRecentCharacters}
            />
          </div>
          <button
            onClick={() => randomizeField('characterB')}
            disabled={isLoading || data.characters.length === 0}
            title="PNJ Aléatoire"
            style={{
              ...randomButtonStyle,
              cursor: isLoading || data.characters.length === 0 ? 'not-allowed' : 'pointer',
              opacity: isLoading || data.characters.length === 0 ? 0.5 : 1,
            }}
          >
            🎲
          </button>
        </div>
      </div>

      {/* Ligne 2: Lieux */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'center',
        }}
      >
        <div style={{ flex: '1 1 0', display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <Combobox
              options={regionOptions}
              value={selection.sceneRegion}
              onChange={handleRegionChange}
              placeholder="Région (macro / parent) — Rechercher…"
              disabled={isLoading}
              allowClear
              recentlyUsed={recentRegions}
              onRecentUpdate={setRecentRegions}
            />
          </div>
          <button
            onClick={() => randomizeField('sceneRegion')}
            disabled={isLoading || data.regions.length === 0}
            title="Région Aléatoire"
            style={{
              ...randomButtonStyle,
              cursor: isLoading || data.regions.length === 0 ? 'not-allowed' : 'pointer',
              opacity: isLoading || data.regions.length === 0 ? 0.5 : 1,
            }}
          >
            🎲
          </button>
        </div>

        {/* Espaceur pour aligner avec le bouton swap de la ligne supérieure */}
        <div
          style={{
            width: '28px',
            flexShrink: 0,
          }}
        />

        <div style={{ flex: '1 1 0', display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <Combobox
              options={subLocationOptions}
              value={selection.subLocation}
              onChange={handleSubLocationChange}
              placeholder={
                selection.sceneRegion
                  ? 'Lieu ou zone détaillée — Rechercher…'
                  : 'Choisir d’abord une région'
              }
              disabled={isLoading || !selection.sceneRegion}
              allowClear
            />
          </div>
          <button
            onClick={() => randomizeField('subLocation')}
            disabled={isLoading || !selection.sceneRegion || data.subLocations.length === 0}
            title="Lieu Aléatoire"
            style={{
              ...randomButtonStyle,
              cursor: isLoading || !selection.sceneRegion || data.subLocations.length === 0 ? 'not-allowed' : 'pointer',
              opacity: isLoading || !selection.sceneRegion || data.subLocations.length === 0 ? 0.5 : 1,
            }}
          >
            🎲
          </button>
        </div>
      </div>
    </div>
  )
})

