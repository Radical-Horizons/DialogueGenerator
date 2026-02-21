/**
 * Modal pour configurer les options de génération (champs de contexte, Unity, organisation, guidance).
 */
import { useState, useCallback, useEffect } from 'react'
import { useContextConfigStore } from '../../store/contextConfigStore'
import { useContextStore } from '../../store/contextStore'
import { ContextFieldSelector } from './ContextFieldSelector'
import { VocabularyGuidesTab } from './VocabularyGuidesTab'
import { PromptsTab } from './PromptsTab'
import { ErrorBoundary } from '../shared/ErrorBoundary'
import { BudgetSettings } from '../settings/BudgetSettings'
import { UsageDashboard } from '../usage/UsageDashboard'
import { theme } from '../../theme'
import { getAllShortcuts, formatShortcut } from '../../hooks/useKeyboardShortcuts'
import * as configAPI from '../../api/config'
import { InfoIcon } from '../shared/Tooltip'

export interface GenerationOptionsModalProps {
  isOpen: boolean
  onClose: () => void
  onApply?: () => void
  initialTab?: 'context' | 'metadata' | 'general' | 'vocabulary' | 'prompts' | 'shortcuts' | 'usage'
}

type TabId = 'context' | 'metadata' | 'general' | 'vocabulary' | 'prompts' | 'shortcuts' | 'usage'

interface Tab {
  id: TabId
  label: string
}

export function GenerationOptionsModal({
  isOpen,
  onClose,
  onApply,
  initialTab = 'context',
}: GenerationOptionsModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab as TabId)
  
  // Mettre à jour l'onglet actif quand initialTab change
  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab as TabId)
    }
  }, [isOpen, initialTab])
  const [previewText, setPreviewText] = useState<string>('')
  const [previewTokens, setPreviewTokens] = useState<number>(0)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)

  const {
    organization,
    setOrganization,
    resetToDefault,
    getPreview,
    detectFields,
    loadSuggestions,
    loadDefaultConfig,
  } = useContextConfigStore()

  // Charger la config par défaut au montage
  useEffect(() => {
    if (isOpen) {
      loadDefaultConfig().catch(console.error)
    }
  }, [isOpen, loadDefaultConfig])

  const handlePreview = useCallback(async () => {
    setIsLoadingPreview(true)
    try {
      // Utiliser les sélections du store de contexte
      const { selections } = useContextStore.getState()
      
      // Fusionner les listes full et excerpt pour chaque type
      const selectedElements: Record<string, string[]> = {
        characters: [
          ...(Array.isArray(selections.characters_full) ? selections.characters_full : []),
          ...(Array.isArray(selections.characters_excerpt) ? selections.characters_excerpt : [])
        ],
        locations: [
          ...(Array.isArray(selections.locations_full) ? selections.locations_full : []),
          ...(Array.isArray(selections.locations_excerpt) ? selections.locations_excerpt : [])
        ],
        items: [
          ...(Array.isArray(selections.items_full) ? selections.items_full : []),
          ...(Array.isArray(selections.items_excerpt) ? selections.items_excerpt : [])
        ],
        species: [
          ...(Array.isArray(selections.species_full) ? selections.species_full : []),
          ...(Array.isArray(selections.species_excerpt) ? selections.species_excerpt : [])
        ],
        communities: [
          ...(Array.isArray(selections.communities_full) ? selections.communities_full : []),
          ...(Array.isArray(selections.communities_excerpt) ? selections.communities_excerpt : [])
        ],
      }

      const response = await getPreview(
        selectedElements,
        '', // scene_instruction vide pour la prévisualisation
        70000
      )
      
      setPreviewText(response.preview)
      setPreviewTokens(response.tokens)
    } catch (err) {
      console.error('Erreur lors de la prévisualisation:', err)
    } finally {
      setIsLoadingPreview(false)
    }
  }, [getPreview])

  const handleDetectAll = useCallback(async () => {
    const elementTypes = ['character', 'location', 'item', 'species', 'community']
    // Invalider le cache pour forcer une nouvelle détection
    try {
      await configAPI.invalidateContextFieldsCache()
    } catch (err) {
      console.warn('Impossible d\'invalider le cache:', err)
    }
    
    for (const elementType of elementTypes) {
      try {
        await detectFields(elementType)
        await loadSuggestions(elementType, 'dialogue')
      } catch (err) {
        console.error(`Erreur lors de la détection pour ${elementType}:`, err)
      }
    }
  }, [detectFields, loadSuggestions])

  const tabs: Tab[] = [
    { id: 'context', label: 'Contexte' },
    { id: 'metadata', label: 'Métadonnées' },
    { id: 'general', label: 'Général' },
    { id: 'vocabulary', label: 'Vocabulaire & Guides' },
    { id: 'prompts', label: 'Prompts' },
    { id: 'shortcuts', label: 'Raccourcis' },
    { id: 'usage', label: 'Usage IA' },
  ]

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
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
          borderRadius: '8px',
          width: '90%',
          maxWidth: '1200px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.5rem',
            borderBottom: `1px solid ${theme.border.primary}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <h2 style={{ margin: 0, color: theme.text.primary }}>Options de Génération</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: theme.text.secondary,
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0.25rem 0.5rem',
            }}
          >
            ×
          </button>
        </div>

        {/* Tabs - En dehors du conteneur scrollable */}
        <div
          style={{
            display: 'flex',
            borderBottom: `1px solid ${theme.border.primary}`,
            backgroundColor: theme.background.secondary,
            flexShrink: 0,
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '1rem 1.5rem',
                border: 'none',
                borderBottom: activeTab === tab.id ? `3px solid ${theme.border.focus}` : '3px solid transparent',
                backgroundColor: 'transparent',
                color: activeTab === tab.id ? theme.text.primary : theme.text.secondary,
                cursor: 'pointer',
                fontWeight: activeTab === tab.id ? 'bold' : 'normal',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content - Seul ce conteneur scroll */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            minHeight: 0,
            padding: '1.5rem',
          }}
        >
          {activeTab === 'context' && (
            <ContextTab
              onDetectAll={handleDetectAll}
              showOnlyEssential={false}
            />
          )}

          {activeTab === 'metadata' && (
            <ContextTab
              onDetectAll={handleDetectAll}
              showOnlyEssential={true}
            />
          )}

          {activeTab === 'general' && (
            <GeneralTab
              organization={organization}
              setOrganization={setOrganization}
              previewText={previewText}
              previewTokens={previewTokens}
              isLoadingPreview={isLoadingPreview}
              onPreview={handlePreview}
              onBudgetUpdated={() => {
                // Optionnel: recharger les données si nécessaire
              }}
            />
          )}

          {activeTab === 'vocabulary' && (
            <ErrorBoundary
              fallback={
                <div
                  style={{
                    padding: '2rem',
                    color: theme.text.primary,
                    backgroundColor: theme.background.secondary,
                    borderRadius: '8px',
                    border: `1px solid ${theme.border.primary}`,
                  }}
                >
                  <h3 style={{ marginTop: 0 }}>Erreur lors du chargement</h3>
                  <p>
                    Une erreur s'est produite lors du chargement de l'onglet
                    Vocabulaire & Guides. Veuillez réessayer.
                  </p>
                </div>
              }
            >
              <VocabularyGuidesTab />
            </ErrorBoundary>
          )}

          {activeTab === 'prompts' && (
            <PromptsTab />
          )}

          {activeTab === 'shortcuts' && (
            <ShortcutsTab />
          )}

          {activeTab === 'usage' && (
            <UsageTab />
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: `1px solid ${theme.border.primary}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.5rem',
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => {
              resetToDefault()
              onClose()
            }}
            style={{
              padding: '0.5rem 1rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '4px',
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              cursor: 'pointer',
            }}
          >
            Réinitialiser
          </button>
          <button
            onClick={() => {
              onApply?.()
              onClose()
            }}
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: theme.button.primary.background,
              color: theme.button.primary.color,
              cursor: 'pointer',
            }}
          >
            Appliquer
          </button>
        </div>
      </div>
    </div>
  )
}

function ContextTab({ 
  onDetectAll, 
  showOnlyEssential 
}: { 
  onDetectAll: () => void
  showOnlyEssential: boolean 
}) {
  const elementTypes = [
    { id: 'character', label: 'Personnages' },
    { id: 'location', label: 'Lieux' },
    { id: 'item', label: 'Objets' },
    { id: 'species', label: 'Espèces' },
    { id: 'community', label: 'Communautés' },
  ]

  const [selectedElementType, setSelectedElementType] = useState('character')
  const { selectAllFields, selectEssentialFields, selectEssentialMetadataFields } = useContextConfigStore()
  
  const handleSelectAll = useCallback(() => {
    if (showOnlyEssential) {
      // Dans l'onglet Métadonnées : sélectionner tous les champs métadonnées
      selectAllFields(selectedElementType)
    } else {
      // Dans l'onglet Contexte : sélectionner tous les champs du contexte narratif
      selectAllFields(selectedElementType)
    }
  }, [selectedElementType, selectAllFields, showOnlyEssential])

  const handleSelectEssential = useCallback(() => {
    // "Sélectionner essentiels" = sélectionner uniquement les champs essentiels du contexte narratif
    // (ESSENTIAL_CONTEXT_FIELDS, marqués avec is_essential=true et is_metadata=false)
    selectEssentialFields(selectedElementType)
  }, [selectedElementType, selectEssentialFields])

  const handleSelectEssentialMetadata = useCallback(() => {
    // "Sélectionner essentiels" (métadonnées) = sélectionner uniquement les champs essentiels des métadonnées
    // (ESSENTIAL_METADATA_FIELDS, marqués avec is_essential=true et is_metadata=true)
    selectEssentialMetadataFields(selectedElementType)
  }, [selectedElementType, selectEssentialMetadataFields])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={selectedElementType}
          onChange={(e) => setSelectedElementType(e.target.value)}
          style={{
            padding: '0.5rem',
            border: `1px solid ${theme.border.primary}`,
            borderRadius: '4px',
            backgroundColor: theme.input.background,
            color: theme.input.color,
          }}
        >
          {elementTypes.map((et) => (
            <option key={et.id} value={et.id}>
              {et.label}
            </option>
          ))}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={onDetectAll}
            style={{
              padding: '0.5rem 1rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '4px',
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              cursor: 'pointer',
            }}
          >
            Détecter automatiquement tous les champs
          </button>
          <InfoIcon
            content={
              <div>
                <div style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>Conseil</div>
                <div style={{ fontSize: '0.875rem' }}>
                  Utilisez ce bouton pour découvrir automatiquement tous les champs disponibles dans vos fiches GDD.
                </div>
              </div>
            }
            position="bottom"
          />
        </div>
        {!showOnlyEssential && (
          <>
            <button
              onClick={handleSelectEssential}
              style={{
                padding: '0.5rem 1rem',
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '4px',
                backgroundColor: theme.button.default.background,
                color: theme.button.default.color,
                cursor: 'pointer',
              }}
            >
              Sélectionner essentiels
            </button>
            <button
              onClick={handleSelectAll}
              style={{
                padding: '0.5rem 1rem',
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '4px',
                backgroundColor: theme.button.default.background,
                color: theme.button.default.color,
                cursor: 'pointer',
              }}
            >
              Tout sélectionner
            </button>
          </>
        )}
        {showOnlyEssential && (
          <>
            <button
              onClick={handleSelectEssentialMetadata}
              style={{
                padding: '0.5rem 1rem',
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '4px',
                backgroundColor: theme.button.default.background,
                color: theme.button.default.color,
                cursor: 'pointer',
              }}
            >
              Sélectionner essentiels
            </button>
            <button
              onClick={handleSelectAll}
              style={{
                padding: '0.5rem 1rem',
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '4px',
                backgroundColor: theme.button.default.background,
                color: theme.button.default.color,
                cursor: 'pointer',
              }}
            >
              Tout sélectionner
            </button>
          </>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <ContextFieldSelector
          elementType={selectedElementType}
          showOnlyEssential={showOnlyEssential}
        />
      </div>
    </div>
  )
}

function GeneralTab({
  organization,
  setOrganization,
  previewText,
  previewTokens,
  isLoadingPreview,
  onPreview,
  onBudgetUpdated,
}: {
  organization: 'default' | 'narrative' | 'minimal'
  setOrganization: (mode: 'default' | 'narrative' | 'minimal') => void
  previewText: string
  previewTokens: number
  isLoadingPreview: boolean
  onPreview: () => void
  onBudgetUpdated?: (budget: { allowed: boolean; message?: string; [key: string]: unknown }) => void
}) {
  return (
    <div>
      {/* Section Budget LLM */}
      <div style={{ marginBottom: '2rem' }}>
        <BudgetSettings onBudgetUpdated={onBudgetUpdated} />
      </div>

      {/* Section Organisation */}
      <div>
        <h3 style={{ marginTop: 0, color: theme.text.primary }}>Organisation du Prompt</h3>

        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
            <label style={{ color: theme.text.primary }}>
              Mode d'organisation:
            </label>
            <InfoIcon
              content={
                <div>
                  <div style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>Modes d'Organisation</div>
                  <div style={{ fontSize: '0.875rem' }}>
                    <p style={{ margin: '0.25rem 0' }}><strong>Par défaut :</strong> Ordre linéaire selon la configuration</p>
                    <p style={{ margin: '0.25rem 0' }}><strong>Narratif :</strong> Groupement logique (Identité → Caractérisation → Voix → Background → Mécaniques)</p>
                    <p style={{ margin: '0.25rem 0' }}><strong>Minimal :</strong> Seulement les champs essentiels pour la génération</p>
                  </div>
                  <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: `1px solid ${theme.border.primary}`, fontSize: '0.875rem' }}>
                    <strong>Conseil :</strong> Le mode "Narratif" améliore la compréhension du LLM en organisant logiquement les informations.
                  </div>
                </div>
              }
              position="right"
            />
          </div>
          <select
            value={organization}
            onChange={(e) => setOrganization(e.target.value as 'default' | 'narrative' | 'minimal')}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '4px',
              backgroundColor: theme.input.background,
              color: theme.input.color,
            }}
          >
            <option value="default">Par défaut (ordre de la config)</option>
            <option value="narrative">Narratif (groupé par pertinence)</option>
            <option value="minimal">Minimal (seulement l'essentiel)</option>
          </select>
        </div>

        <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={onPreview}
            disabled={isLoadingPreview}
            style={{
              padding: '0.5rem 1rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '4px',
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              cursor: isLoadingPreview ? 'not-allowed' : 'pointer',
              opacity: isLoadingPreview ? 0.6 : 1,
            }}
          >
            {isLoadingPreview ? 'Chargement...' : 'Prévisualiser le contexte'}
          </button>
          <InfoIcon
            content={
              <div>
                <div style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>Conseils</div>
                <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem' }}>
                  <li style={{ marginBottom: '0.25rem' }}>Utilisez "Détecter automatiquement" pour découvrir tous les champs disponibles</li>
                  <li style={{ marginBottom: '0.25rem' }}>Les champs suggérés sont particulièrement pertinents pour le type de génération</li>
                  <li>Utilisez la prévisualisation pour vérifier le contexte avant de générer</li>
                </ul>
              </div>
            }
            position="right"
          />
        </div>

        {previewText && (
          <div>
            <div style={{ marginBottom: '0.5rem', color: theme.text.secondary, fontSize: '0.9rem' }}>
              Tokens estimés: {previewTokens}
            </div>
            <pre
              style={{
                padding: '1rem',
                backgroundColor: theme.background.secondary,
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '4px',
                overflow: 'auto',
                maxHeight: '400px',
                fontSize: '0.85rem',
                color: theme.text.primary,
                whiteSpace: 'pre-wrap',
              }}
            >
              {previewText}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Onglet affichant les raccourcis clavier disponibles.
 */
function ShortcutsTab() {
  const [shortcuts, setShortcuts] = useState<Array<{ key: string; description: string }>>([])

  useEffect(() => {
    // Récupérer les raccourcis dynamiques enregistrés
    const dynamicShortcuts = getAllShortcuts()
    const defaultShortcuts = [
      { key: 'ctrl+enter', description: 'Générer un dialogue' },
      { key: 'alt+s', description: 'Échanger les personnages (swap)' },
      { key: 'ctrl+k', description: 'Ouvrir la palette de commandes' },
      { key: '/', description: 'Filtrer dans le panneau de gauche' },
      { key: 'ctrl+e', description: 'Exporter le dialogue Unity' },
      { key: 'ctrl+s', description: 'Sauvegarder le dialogue' },
      { key: 'ctrl+n', description: 'Nouveau dialogue (réinitialiser)' },
      { key: 'ctrl+,', description: 'Ouvrir les options' },
      { key: 'escape', description: 'Fermer les modals/panels' },
      { key: 'ctrl+/', description: 'Afficher l\'aide des raccourcis' },
      { key: 'ctrl+1', description: 'Naviguer vers Dashboard' },
      { key: 'ctrl+2', description: 'Naviguer vers Dialogues Unity' },
      { key: 'ctrl+3', description: 'Naviguer vers Usage/Statistiques' },
    ]
    
    const combined = [...defaultShortcuts, ...dynamicShortcuts]
    
    // Dédupliquer par key (garder la première occurrence)
    const unique = new Map<string, { key: string; description: string }>()
    combined.forEach(s => {
      if (!unique.has(s.key)) {
        unique.set(s.key, s)
      }
    })
    
    setShortcuts(Array.from(unique.values()).sort((a, b) => a.key.localeCompare(b.key)))
  }, [])

  return (
    <div>
      <h3 style={{ marginTop: 0, color: theme.text.primary, marginBottom: '1rem' }}>Raccourcis clavier</h3>
      <p style={{ color: theme.text.secondary, marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        Utilisez ces raccourcis pour accélérer votre workflow. La plupart fonctionnent même lorsque vous êtes dans un champ de saisie.
      </p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {shortcuts.map((shortcut, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.75rem',
              backgroundColor: theme.background.secondary,
              borderRadius: '4px',
              border: `1px solid ${theme.border.primary}`,
            }}
          >
            <span style={{ color: theme.text.primary, flex: 1 }}>{shortcut.description}</span>
            <kbd
              style={{
                padding: '0.25rem 0.5rem',
                backgroundColor: theme.input.background,
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '4px',
                fontSize: '0.85rem',
                fontFamily: 'monospace',
                color: theme.text.primary,
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
              }}
            >
              {formatShortcut(shortcut.key)}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Onglet affichant les statistiques d'utilisation LLM.
 */
function UsageTab() {
  return (
    <div>
      <UsageDashboard />
    </div>
  )
}

