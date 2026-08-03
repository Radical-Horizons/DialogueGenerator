/**
 * Widget pour sélectionner la scène principale (personnages A/B, région, sous-lieu).
 */
import { memo, useCallback, useEffect, useState } from 'react'
import { Combobox, type ComboboxOption } from '../shared/Combobox'
import { useSceneSelection } from '../../hooks/useSceneSelection'
import { useGenerationStore } from '../../store/generationStore'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { theme } from '../../theme'
import {
  redesignControl,
  redesignFont,
  redesignRadius,
  redesignSpacing,
  redesignText,
} from '../../theme/redesignTokens'
import { generationPanelChrome } from '../../theme/responsiveChrome'
import { useGenerationPanelNarrow } from './GenerationPanelNarrowContext'
import {
  filterNpcCharacterOptions,
  filterPlayableCharacterOptions,
  isValidNpc,
} from '../../utils/sceneDramatis'

export const SceneSelectionWidget = memo(function SceneSelectionWidget() {
  const isNarrow = useGenerationPanelNarrow()
  const chrome = isNarrow ? generationPanelChrome.narrow : generationPanelChrome.comfortable
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
      const updates: Partial<typeof selection> = { characterA: value }
      if (value && selection.characterB && !isValidNpc(selection.characterB, value)) {
        updates.characterB = null
      }
      updateSelection(updates)
    },
    [updateSelection, selection.characterB]
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

  const playerCharacterOptions: ComboboxOption[] = filterPlayableCharacterOptions(
    data.characters,
  ).map((name) => ({
    value: name,
    label: name,
  }))

  const npcCharacterOptions: ComboboxOption[] = filterNpcCharacterOptions(
    data.characters,
    selection.characterA,
  ).map((name) => ({
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

  const iconActionSize = chrome.iconActionSizePx

  const randomButtonStyle: React.CSSProperties = {
    width: `${iconActionSize}px`,
    height: `${iconActionSize}px`,
    minWidth: `${iconActionSize}px`,
    minHeight: `${iconActionSize}px`,
    padding: 0,
    border: `1px solid ${redesignControl.border}`,
    borderRadius: `${redesignRadius.control}px`,
    backgroundColor: 'transparent',
    color: redesignText.label,
    cursor: 'pointer',
    fontFamily: redesignFont.mono,
    fontSize: '9.5px',
    letterSpacing: '0.06em',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    opacity: 1,
  }

  const [showSceneFields, setShowSceneFields] = useState(false)
  const hasContext = selection.characterA || selection.characterB || selection.sceneRegion

  /** Sur-titre et titre de scène dérivés de la sélection courante (pas de données inventées). */
  const sceneOverline = [selection.sceneRegion, selection.subLocation]
    .filter(Boolean)
    .join(' · ') || 'Scène sans lieu'
  const sceneTitle =
    selection.characterA && selection.characterB
      ? `${selection.characterA} & ${selection.characterB}`
      : selection.characterA || selection.characterB || 'Nouvelle scène'

  if (!hasContext && !isLoading) {
    return (
      <div
        style={{
          padding: isNarrow ? '1rem' : '2rem',
          border: `1px dashed ${theme.border.primary}`,
          borderRadius: '8px',
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
        padding: 0,
        border: 'none',
        borderRadius: 0,
        backgroundColor: 'transparent',
        marginBottom: `${redesignSpacing.xl}px`,
        minWidth: 0,
      }}
    >
      {/* Titre de scène : sur-titre mono + titre serif (écran 1c). */}
      <div
        style={{
          fontFamily: redesignFont.mono,
          fontSize: '10.5px',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: redesignText.label,
          marginBottom: `${redesignSpacing.sm}px`,
        }}
      >
        {sceneOverline}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: `${redesignSpacing.md}px` }}>
        <h1
          style={{
            marginTop: 0,
            marginBottom: `${redesignSpacing.sm}px`,
            fontFamily: redesignFont.serif,
            fontSize: isNarrow ? '24px' : '33px',
            fontWeight: 400,
            lineHeight: 1.12,
            letterSpacing: '0.005em',
            color: '#ffffff',
          }}
        >
          {sceneTitle}
        </h1>
        {/* 1c n'affiche que le titre : les sélecteurs restent accessibles ici. */}
        <button
          type="button"
          onClick={() => setShowSceneFields((v) => !v)}
          aria-expanded={showSceneFields}
          data-testid="scene-fields-toggle"
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: redesignText.secondary,
            fontSize: '11.5px',
            whiteSpace: 'nowrap',
          }}
        >
          {showSceneFields ? 'masquer' : 'modifier'}
        </button>
      </div>
      <div
        style={{
          display: showSceneFields ? 'block' : 'none',
          fontFamily: redesignFont.mono,
          fontSize: '10px',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: redesignText.label,
          marginBottom: `${redesignSpacing.sm}px`,
        }}
      >
        Scène
      </div>

      <div style={{ display: showSceneFields ? 'block' : 'none' }}>
      {/* Ligne 1: Personnages */}
      <div
        style={{
          display: 'flex',
          flexWrap: isNarrow ? 'wrap' : 'nowrap',
          gap: `${chrome.controlGapRem}rem`,
          alignItems: 'center',
          marginBottom: '0.5rem',
        }}
      >
        <div
          style={{
            flex: isNarrow ? '1 1 100%' : '1 1 0',
            minWidth: 0,
            display: 'flex',
            gap: '0.25rem',
            alignItems: 'center',
          }}
        >
          <div style={{ flex: 1 }}>
            <Combobox
              options={playerCharacterOptions}
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
            disabled={isLoading || playerCharacterOptions.length === 0}
            title="PJ Aléatoire"
            style={{
              ...randomButtonStyle,
              cursor: isLoading || playerCharacterOptions.length === 0 ? 'not-allowed' : 'pointer',
              opacity: isLoading || playerCharacterOptions.length === 0 ? 0.5 : 1,
            }}
          >
            ALÉA
          </button>
        </div>

        <button
          onClick={swapCharacters}
          disabled={isLoading || (!selection.characterA && !selection.characterB)}
          title="Échanger PJ et PNJ (Alt+S)"
          style={{
            width: `${iconActionSize}px`,
            height: `${iconActionSize}px`,
            minWidth: `${iconActionSize}px`,
            minHeight: `${iconActionSize}px`,
            padding: 0,
            border: `1px solid ${theme.border.primary}`,
            borderRadius: '6px',
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
            fontSize: isNarrow ? '1rem' : '1.15rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            alignSelf: isNarrow ? 'center' : undefined,
          }}
        >
          ⇄
        </button>

        <div
          style={{
            flex: isNarrow ? '1 1 100%' : '1 1 0',
            minWidth: 0,
            display: 'flex',
            gap: '0.25rem',
            alignItems: 'center',
          }}
        >
          <div style={{ flex: 1 }}>
            <Combobox
              options={npcCharacterOptions}
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
            disabled={isLoading || npcCharacterOptions.length === 0}
            title="PNJ Aléatoire"
            style={{
              ...randomButtonStyle,
              cursor: isLoading || npcCharacterOptions.length === 0 ? 'not-allowed' : 'pointer',
              opacity: isLoading || npcCharacterOptions.length === 0 ? 0.5 : 1,
            }}
          >
            ALÉA
          </button>
        </div>
      </div>

      {/* Ligne 2: Lieux */}
      <div
        style={{
          display: 'flex',
          flexWrap: isNarrow ? 'wrap' : 'nowrap',
          gap: `${chrome.controlGapRem}rem`,
          alignItems: 'center',
        }}
      >
        <div
          style={{
            flex: isNarrow ? '1 1 100%' : '1 1 0',
            minWidth: 0,
            display: 'flex',
            gap: '0.25rem',
            alignItems: 'center',
          }}
        >
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
            ALÉA
          </button>
        </div>

        {/* Espaceur pour aligner avec le bouton swap de la ligne supérieure */}
        <div
          style={{
            width: `${iconActionSize}px`,
            flexShrink: 0,
          }}
        />

        <div
          style={{
            flex: isNarrow ? '1 1 100%' : '1 1 0',
            minWidth: 0,
            display: 'flex',
            gap: '0.25rem',
            alignItems: 'center',
          }}
        >
          <div style={{ flex: 1 }}>
            <Combobox
              options={subLocationOptions}
              value={selection.subLocation}
              onChange={handleSubLocationChange}
              placeholder={
                selection.sceneRegion
                  ? 'Sous-lieu direct de la région — Rechercher…'
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
            ALÉA
          </button>
        </div>
      </div>
      </div>
    </div>
  )
})

