/**
 * Onglet pour configurer le vocabulaire Alteir et les guides narratifs.
 */
import { useState, useEffect } from 'react'
import { useVocabularyStore, type PopularityLevel, type VocabularyMode } from '../../store/vocabularyStore'
import { useNarrativeGuidesStore } from '../../store/narrativeGuidesStore'
import { useSyncStore } from '../../store/syncStore'
import { theme } from '../../theme'

const POPULARITY_LEVELS: PopularityLevel[] = [
  'Mondialement',
  'Régionalement',
  'Localement',
  'Communautaire',
  'Occulte',
]

const VOCABULARY_MODES: { value: VocabularyMode; label: string }[] = [
  { value: 'all', label: 'Tout' },
  { value: 'auto', label: 'Automatique' },
  { value: 'none', label: 'Non' },
]

export function VocabularyGuidesTab() {
  const {
    vocabularyConfig,
    totalTerms,
    vocabularyStats,
    error: vocabularyError,
    setLevelMode,
    loadVocabulary,
    loadStats,
    clearError: clearVocabularyError,
  } = useVocabularyStore()
  
  const {
    includeNarrativeGuides,
    error: guidesError,
    toggleGuides,
    loadNarrativeGuides,
    clearError: clearGuidesError,
  } = useNarrativeGuidesStore()
  
  const {
    lastSyncTime,
    isSyncing,
    error: syncError,
    syncFromNotion,
    clearError: clearSyncError,
  } = useSyncStore()
  
  // Erreur combinée pour l'affichage
  const error = vocabularyError || guidesError || syncError

  const [isLoading, setIsLoading] = useState(false)
  const [hasInitialized, setHasInitialized] = useState(false)

  // Charger les données au montage (une seule fois)
  useEffect(() => {
    if (hasInitialized) return
    
    const loadData = async () => {
      setIsLoading(true)
      try {
        await Promise.all([
          loadVocabulary().catch((err) => {
            console.error('Erreur lors du chargement du vocabulaire:', err)
          }),
          loadNarrativeGuides().catch((err) => {
            console.error('Erreur lors du chargement des guides:', err)
          }),
          loadStats().catch((err) => {
            console.error('Erreur lors du chargement des stats:', err)
          }),
        ])
      } catch (err) {
        console.error('Erreur lors du chargement initial:', err)
      } finally {
        setIsLoading(false)
        setHasInitialized(true)
      }
    }
    loadData()
  }, [hasInitialized, loadVocabulary, loadNarrativeGuides, loadStats])

  // Calculer le nombre de termes selon le niveau et le mode
  const getFilteredCount = (level: PopularityLevel, mode: VocabularyMode): number => {
    if (!vocabularyStats || !vocabularyStats.by_popularité) {
      return 0
    }

    const stats = vocabularyStats.by_popularité || {}
    
    if (mode === 'none') {
      return 0
    } else if (mode === 'all') {
      // Pour "all", compter uniquement les termes de ce niveau spécifique
      return stats[level] || 0
    } else {
      // Pour "auto", on ne peut pas savoir sans le contexte, donc on retourne juste le nombre du niveau
      return stats[level] || 0
    }
  }

  const handleSync = async () => {
    await syncFromNotion()
    // Recharger les données après synchronisation
    await Promise.all([
      loadVocabulary().catch((err) => {
        console.error('Erreur lors du rechargement du vocabulaire:', err)
      }),
      loadNarrativeGuides().catch((err) => {
        console.error('Erreur lors du rechargement des guides:', err)
      }),
    ])
  }
  
  const clearError = () => {
    clearVocabularyError()
    clearGuidesError()
    clearSyncError()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Section de synchronisation globale */}
      <div
        style={{
          padding: '1rem',
          border: `1px solid ${theme.border.primary}`,
          borderRadius: '8px',
          backgroundColor: theme.background.secondary,
        }}
      >
        <h3 style={{ margin: '0 0 0.75rem 0', color: theme.text.primary }}>
          Synchronisation Notion
        </h3>
        <p
          style={{
            margin: '0 0 1rem 0',
            color: theme.text.secondary,
            fontSize: '0.9rem',
          }}
        >
          Synchronise le vocabulaire Alteir et les guides narratifs depuis Notion.
        </p>
        <button
          onClick={handleSync}
          disabled={isSyncing || isLoading}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: isSyncing
              ? theme.button.default.background
              : theme.button.primary.background,
            color: theme.button.primary.color,
            cursor: isSyncing ? 'not-allowed' : 'pointer',
            opacity: isSyncing ? 0.6 : 1,
            fontWeight: 'bold',
          }}
        >
          {isSyncing ? 'Synchronisation...' : 'Synchroniser depuis Notion'}
        </button>
        {lastSyncTime && (
          <p
            style={{
              margin: '0.5rem 0 0 0',
              color: theme.text.secondary,
              fontSize: '0.85rem',
            }}
          >
            Dernière synchronisation :{' '}
            {new Date(lastSyncTime).toLocaleString('fr-FR')}
          </p>
        )}
      </div>

      {/* Vocabulaire Alteir */}
      <div
        style={{
          padding: '1rem',
          border: `1px solid ${theme.border.primary}`,
          borderRadius: '8px',
          backgroundColor: theme.background.secondary,
        }}
      >
        <h3 style={{ margin: '0 0 1rem 0', color: theme.text.primary }}>
          Vocabulaire Alteir
        </h3>

        {/* Configuration par niveau de popularité */}
        <div style={{ marginBottom: '1rem' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '1rem',
              color: theme.text.primary,
              fontWeight: 'bold',
            }}
          >
            Configuration du vocabulaire par niveau de popularité
          </label>
          
          {POPULARITY_LEVELS.map((level) => {
            const currentMode = vocabularyConfig[level]
            const count = getFilteredCount(level, currentMode)
            
            return (
              <div
                key={level}
                style={{
                  marginBottom: '1.5rem',
                  padding: '1rem',
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: '4px',
                  backgroundColor: theme.background.panel,
                }}
              >
                <div
                  style={{
                    marginBottom: '0.75rem',
                    fontWeight: 'bold',
                    color: theme.text.primary,
                  }}
                >
                  {level}
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: '1.5rem',
                    alignItems: 'center',
                  }}
                >
                  {VOCABULARY_MODES.map((modeOption) => (
                    <label
                      key={modeOption.value}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name={`vocab-mode-${level}`}
                        value={modeOption.value}
                        checked={currentMode === modeOption.value}
                        onChange={() => setLevelMode(level, modeOption.value)}
                        style={{
                          width: '1.2rem',
                          height: '1.2rem',
                          cursor: 'pointer',
                        }}
                      />
                      <span style={{ color: theme.text.primary }}>
                        {modeOption.label}
                      </span>
                    </label>
                  ))}
                </div>
                {currentMode !== 'none' && (
                  <div
                    style={{
                      marginTop: '0.5rem',
                      color: theme.text.secondary,
                      fontSize: '0.85rem',
                    }}
                  >
                    {currentMode === 'all' && (
                      <span>
                        {count} terme(s) du niveau {level} seront inclus
                      </span>
                    )}
                    {currentMode === 'auto' && (
                      <span>
                        Seuls les termes de niveau {level} mentionnés dans le contexte seront inclus ({vocabularyStats?.by_popularité?.[level] || 0} terme(s) au total pour ce niveau)
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Statistiques */}
        {vocabularyStats && vocabularyStats.by_popularité && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem',
              backgroundColor: theme.background.panel,
              borderRadius: '4px',
              fontSize: '0.9rem',
            }}
          >
            <strong style={{ color: theme.text.primary }}>
              Statistiques :
            </strong>
            <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
              <li>Total : {totalTerms || 0} termes</li>
              {Object.entries(vocabularyStats.by_popularité).map(
                ([popularité, count]) => (
                  <li key={popularité}>
                    {popularité} : {count || 0} terme(s)
                  </li>
                )
              )}
            </ul>
          </div>
        )}
      </div>

      {/* Guides narratifs */}
      <div
        style={{
          padding: '1rem',
          border: `1px solid ${theme.border.primary}`,
          borderRadius: '8px',
          backgroundColor: theme.background.secondary,
        }}
      >
        <h3 style={{ margin: '0 0 1rem 0', color: theme.text.primary }}>
          Guides narratifs
        </h3>

        <div style={{ marginBottom: '1rem' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={includeNarrativeGuides}
              onChange={toggleGuides}
              style={{
                width: '1.2rem',
                height: '1.2rem',
                cursor: 'pointer',
              }}
            />
            <span style={{ color: theme.text.primary }}>
              Inclure les guides narratifs dans le prompt système
            </span>
          </label>
          <p
            style={{
              margin: '0.5rem 0 0 1.7rem',
              color: theme.text.secondary,
              fontSize: '0.9rem',
            }}
          >
            Les guides des dialogues et de narration seront injectés dans le
            prompt pour guider la génération.
          </p>
        </div>

        {/* Informations sur les guides */}
        {includeNarrativeGuides && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem',
              backgroundColor: theme.background.panel,
              borderRadius: '4px',
              fontSize: '0.9rem',
            }}
          >
            <strong style={{ color: theme.text.primary }}>
              Guides disponibles :
            </strong>
            <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
              <li>Guide des dialogues</li>
              <li>Guide de narration</li>
            </ul>
          </div>
        )}
      </div>

      {/* Message d'erreur */}
      {error && (
        <div
          style={{
            padding: '0.75rem',
            backgroundColor: theme.state.error.background,
            color: theme.state.error.color,
            borderRadius: '4px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{error}</span>
          <button
            onClick={clearError}
            style={{
              background: 'none',
              border: 'none',
              color: theme.state.error.color,
              cursor: 'pointer',
              fontSize: '1.2rem',
              padding: '0 0.5rem',
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Indicateur de chargement */}
      {isLoading && (
        <div
          style={{
            padding: '1rem',
            textAlign: 'center',
            color: theme.text.secondary,
          }}
        >
          Chargement...
        </div>
      )}
    </div>
  )
}

