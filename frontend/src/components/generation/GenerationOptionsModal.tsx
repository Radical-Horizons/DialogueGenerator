/**
 * Modal pour configurer les options de génération (contexte, vocabulaire, prompts, budget, sync GDD, suivi).
 */
import { useState, useCallback, useEffect, useRef, type Ref } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useContextConfigStore } from '../../store/contextConfigStore'
import { useContextStore } from '../../store/contextStore'
import { ContextFieldSelector } from './ContextFieldSelector'
import { VocabularyGuidesTab } from './VocabularyGuidesTab'
import { GddNotionSyncSection } from './GddNotionSyncSection'
import { PromptsTab } from './PromptsTab'
import { ErrorBoundary } from '../shared/ErrorBoundary'
import { BudgetSettings, type BudgetSettingsHandle } from '../settings/BudgetSettings'
import { UsageDashboard } from '../usage/UsageDashboard'
import { GenerationLogsPanel } from '../usage/GenerationLogsPanel'
import { theme } from '../../theme'
import { StyledSelect } from '../shared/StyledSelect'
import * as unityDialoguesAPI from '../../api/unityDialogues'
import { getAllShortcuts, formatShortcut } from '../../hooks/useKeyboardShortcuts'
import * as configAPI from '../../api/config'
import { type BudgetResponse } from '../../api/costs'
import {
  GDD_FULL_SYNC_CHECKPOINT_QUERY_KEY,
  getGddFullSyncCheckpoint,
} from '../../api/gddNotionSync'
import { InfoIcon } from '../shared/Tooltip'
import { remSize } from '../../theme/uiTypography'
import { useNarrowInlineSize } from '../../hooks/useNarrowInlineSize'
import { modalTypography } from '../../theme/responsiveChrome'
import {
  redesignAccent,
  redesignControl,
  redesignFont,
  redesignHairline,
  redesignMonoLabelStyle,
  redesignRadius,
  redesignSpacing,
  redesignSurface,
  redesignText,
} from '../../theme/redesignTokens'

/**
 * Contrôle bordé, fond transparent — le défaut de la refonte. Le seul bouton plein
 * `redesignAccent.base` de cet écran est « Appliquer » (invariant : une action
 * primaire par écran).
 */
const outlineButtonStyle: React.CSSProperties = {
  padding: `${redesignSpacing.sm}px ${redesignSpacing.md}px`,
  border: `1px solid ${redesignControl.border}`,
  borderRadius: redesignRadius.control,
  backgroundColor: 'transparent',
  color: redesignText.row,
  cursor: 'pointer',
}

/** Champ de saisie / select de la modale. */
const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: `${redesignSpacing.sm}px ${redesignSpacing.md}px`,
  border: `1px solid ${redesignControl.border}`,
  borderRadius: redesignRadius.control,
  backgroundColor: redesignSurface.base,
  color: redesignText.strong,
}

/** Titre de section : serif, comme les titres de scène et de nœud. */
const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  marginBottom: redesignSpacing.md,
  fontFamily: redesignFont.serif,
  fontWeight: 400,
  color: redesignText.strong,
}

export interface GenerationOptionsModalProps {
  isOpen: boolean
  onClose: () => void
  onApply?: () => void
  initialTab?:
    | 'context'
    | 'metadata'
    | 'general'
    | 'vocabulary'
    | 'gdd_notion'
    | 'prompts'
    | 'shortcuts'
    | 'usage'
    | 'logs'
}

type TabId =
  | 'context'
  | 'metadata'
  | 'general'
  | 'vocabulary'
  | 'gdd_notion'
  | 'prompts'
  | 'shortcuts'
  | 'usage'
  | 'logs'

interface Tab {
  id: TabId
  label: string
}

export function GenerationOptionsModal({
  isOpen,
  onClose,
  onApply,
  initialTab = 'general',
}: GenerationOptionsModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab as TabId)
  const { ref: panelRef, isNarrow } = useNarrowInlineSize(720)
  const typo = isNarrow ? modalTypography.narrow : modalTypography.comfortable
  
  // Mettre à jour l'onglet actif quand initialTab change
  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab as TabId)
    }
  }, [isOpen, initialTab])
  const [previewText, setPreviewText] = useState<string>('')
  const [previewTokens, setPreviewTokens] = useState<number>(0)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const budgetSettingsRef = useRef<BudgetSettingsHandle>(null)

  const {
    organization,
    setOrganization,
    resetToDefault,
    getPreview,
    detectFields,
    loadSuggestions,
    loadDefaultConfig,
  } = useContextConfigStore()

  const queryClient = useQueryClient()

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
    { id: 'general', label: 'Général' },
    { id: 'gdd_notion', label: 'Notion' },
    { id: 'context', label: 'Contexte' },
    { id: 'metadata', label: 'Métadonnées' },
    { id: 'vocabulary', label: 'Vocabulaire & Guides' },
    { id: 'prompts', label: 'Prompts' },
    { id: 'usage', label: 'Usage IA' },
    { id: 'logs', label: 'Logs' },
    { id: 'shortcuts', label: 'Raccourcis' },
  ]

  const { data: notionResumeCheckpoint } = useQuery({
    queryKey: GDD_FULL_SYNC_CHECKPOINT_QUERY_KEY,
    queryFn: getGddFullSyncCheckpoint,
    enabled: isOpen,
    staleTime: 10_000,
  })
  const notionResumeAvailable = notionResumeCheckpoint?.resumable === true

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
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '5vh',
        paddingBottom: '5vh',
        overflowY: 'auto',
        boxSizing: 'border-box',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: redesignSurface.panel,
          border: `1px solid ${redesignControl.border}`,
          borderRadius: redesignRadius.frame,
          width: '90%',
          maxWidth: '1200px',
          maxHeight: 'min(90vh, calc(100vh - 10vh))',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.4)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
        ref={panelRef}
      >
        {/* Header */}
        <div
          style={{
            padding: isNarrow
              ? `${redesignSpacing.md}px`
              : `${redesignSpacing.lg}px ${redesignSpacing.xl}px`,
            borderBottom: `1px solid ${redesignHairline.standard}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: redesignFont.serif,
              fontWeight: 400,
              color: redesignText.strong,
              fontSize: `${typo.titleFontRem}rem`,
            }}
          >
            Options
          </h2>
          <button
            onClick={onClose}
            aria-label="Fermer les options"
            style={{
              background: 'none',
              border: 'none',
              color: redesignText.label,
              fontFamily: redesignFont.mono,
              fontSize: `${typo.titleFontRem}rem`,
              lineHeight: 1,
              cursor: 'pointer',
              padding: `${redesignSpacing.xs}px ${redesignSpacing.sm}px`,
            }}
          >
            ×
          </button>
        </div>

        {/* Tabs - En dehors du conteneur scrollable */}
        <div
          style={{
            display: 'flex',
            borderBottom: `1px solid ${redesignHairline.standard}`,
            backgroundColor: 'transparent',
            flexShrink: 0,
            overflowX: 'auto',
          }}
        >
          {tabs.map((tab) => {
            const tabLabel =
              tab.id === 'gdd_notion' && notionResumeAvailable ? 'Notion · reprise' : tab.label
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                data-options-tab
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: isNarrow
                    ? `${redesignSpacing.sm}px ${redesignSpacing.md}px`
                    : `${redesignSpacing.md}px ${redesignSpacing.lg}px`,
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: isActive ? redesignText.strong : redesignText.label,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  fontSize: '10.5px',
                  ...redesignMonoLabelStyle,
                }}
              >
                {/* Le filet actif appartient au libellé, pas à la cible cliquable :
                    posé sur le bouton, il se dessine sous le padding et se confond
                    avec le filet du conteneur. Même idiome que `navTabLabelStyle`. */}
                <span
                  style={{
                    paddingBottom: redesignSpacing.xs,
                    boxShadow: isActive ? `inset 0 -1px 0 ${redesignAccent.base}` : 'none',
                  }}
                >
                  {tabLabel}
                </span>
              </button>
            )
          })}
        </div>

        {notionResumeAvailable && activeTab !== 'gdd_notion' ? (
          <div
            style={{
              padding: `${redesignSpacing.sm}px ${redesignSpacing.lg}px`,
              backgroundColor: redesignAccent.selectedBg,
              borderBottom: `1px solid ${redesignHairline.standard}`,
              boxShadow: `inset 2px 0 0 ${redesignAccent.base}`,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: redesignSpacing.md,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                color: redesignText.body,
                fontSize: remSize('body'),
                lineHeight: 1.45,
                flex: '1 1 220px',
              }}
            >
              Synchronisation Notion complète en pause sur le serveur. Vous pouvez la reprendre après
              avoir fermé le navigateur ou l&apos;application : onglet <strong>Notion</strong>, puis{' '}
              <strong>Reprendre la sync</strong>.
            </span>
            <button
              type="button"
              onClick={() => setActiveTab('gdd_notion')}
              style={{ ...outlineButtonStyle, fontSize: remSize('small'), flexShrink: 0 }}
            >
              Aller à Notion
            </button>
          </div>
        ) : null}

        {/* Content - Seul ce conteneur scroll */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            minHeight: 0,
            padding: isNarrow
              ? `${redesignSpacing.md}px`
              : `${redesignSpacing.lg}px ${redesignSpacing.xl}px`,
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

          {activeTab === 'vocabulary' && (
            <ErrorBoundary
              fallback={
                <div
                  style={{
                    padding: redesignSpacing.xl,
                    color: redesignText.body,
                    backgroundColor: redesignSurface.base,
                    borderRadius: redesignRadius.control,
                    border: `1px solid ${redesignControl.border}`,
                  }}
                >
                  <h3 style={sectionTitleStyle}>Erreur lors du chargement</h3>
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

          {/* Toujours monté pour conserver le draft quota et permettre apply via Appliquer. */}
          <div style={{ display: activeTab === 'general' ? 'block' : 'none' }}>
            <GeneralTab
              organization={organization}
              setOrganization={setOrganization}
              previewText={previewText}
              previewTokens={previewTokens}
              isLoadingPreview={isLoadingPreview}
              onPreview={handlePreview}
              budgetSettingsRef={budgetSettingsRef}
              onBudgetUpdated={() => {
                // Optionnel: recharger les données si nécessaire
              }}
            />
          </div>

          {activeTab === 'gdd_notion' && (
            <ErrorBoundary
              fallback={
                <div
                  style={{
                    padding: redesignSpacing.xl,
                    color: redesignText.body,
                    backgroundColor: redesignSurface.base,
                    borderRadius: redesignRadius.control,
                    border: `1px solid ${redesignControl.border}`,
                  }}
                >
                  <h3 style={sectionTitleStyle}>Erreur lors du chargement</h3>
                  <p>
                    Une erreur s&apos;est produite lors du chargement de la synchronisation GDD
                    Notion. Veuillez réessayer.
                  </p>
                </div>
              }
            >
              <GddNotionSyncSection
                onCheckpointDiskChanged={() => {
                  void queryClient.invalidateQueries({
                    queryKey: GDD_FULL_SYNC_CHECKPOINT_QUERY_KEY,
                  })
                }}
              />
            </ErrorBoundary>
          )}

          {activeTab === 'usage' && (
            <UsageTab />
          )}

          {activeTab === 'logs' && (
            <LogsTab />
          )}

          {activeTab === 'shortcuts' && (
            <ShortcutsTab />
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: `${redesignSpacing.md}px ${redesignSpacing.lg}px`,
            borderTop: `1px solid ${redesignHairline.standard}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: redesignSpacing.sm,
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => {
              resetToDefault()
              onClose()
            }}
            style={outlineButtonStyle}
          >
            Réinitialiser
          </button>
          <button
            onClick={() => {
              void (async () => {
                const applied = await budgetSettingsRef.current?.apply()
                if (applied === false) {
                  setActiveTab('general')
                  return
                }
                onApply?.()
                onClose()
              })()
            }}
            style={{
              padding: `${redesignSpacing.sm}px ${redesignSpacing.lg}px`,
              border: `1px solid ${redesignAccent.base}`,
              borderRadius: redesignRadius.control,
              backgroundColor: redesignAccent.base,
              color: '#ffffff',
              fontWeight: 600,
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
        <StyledSelect
          value={selectedElementType}
          onChange={(e) => setSelectedElementType(e.target.value)}
          style={{
            padding: '0.5rem',
            border: `1px solid ${theme.border.primary}`,
            borderRadius: '4px',
            backgroundColor: theme.input.background,
            color: theme.input.color,
          }}
          wrapperStyle={{ width: 'auto' }}
        >
          {elementTypes.map((et) => (
            <option key={et.id} value={et.id}>
              {et.label}
            </option>
          ))}
        </StyledSelect>
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
                <div style={{ fontSize: remSize('body') }}>
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
  budgetSettingsRef,
  onBudgetUpdated,
}: {
  organization: 'default' | 'narrative' | 'minimal'
  setOrganization: (mode: 'default' | 'narrative' | 'minimal') => void
  previewText: string
  previewTokens: number
  isLoadingPreview: boolean
  onPreview: () => void
  budgetSettingsRef: Ref<BudgetSettingsHandle>
  onBudgetUpdated?: (budget: BudgetResponse) => void
}) {
  return (
    <div>
      {/* Section Budget LLM */}
      <div style={{ marginBottom: redesignSpacing.xl }}>
        <BudgetSettings ref={budgetSettingsRef} onBudgetUpdated={onBudgetUpdated} />
      </div>

      {/* Section Organisation */}
      <div>
        <h3 style={sectionTitleStyle}>Organisation du prompt</h3>

        <div style={{ marginBottom: redesignSpacing.lg }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: redesignSpacing.xs,
              marginBottom: redesignSpacing.sm,
            }}
          >
            <label style={{ ...redesignMonoLabelStyle, fontSize: '10px', color: redesignText.label }}>
              Mode d&apos;organisation
            </label>
            <InfoIcon
              content={
                <div>
                  <div style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>Modes d'Organisation</div>
                  <div style={{ fontSize: remSize('body') }}>
                    <p style={{ margin: '0.25rem 0' }}><strong>Par défaut :</strong> Ordre linéaire selon la configuration</p>
                    <p style={{ margin: '0.25rem 0' }}><strong>Narratif :</strong> Groupement logique (Identité → Caractérisation → Voix → Background → Mécaniques)</p>
                    <p style={{ margin: '0.25rem 0' }}><strong>Minimal :</strong> Seulement les champs essentiels pour la génération</p>
                  </div>
                  <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: `1px solid ${theme.border.primary}`, fontSize: remSize('body') }}>
                    <strong>Conseil :</strong> Le mode "Narratif" améliore la compréhension du LLM en organisant logiquement les informations.
                  </div>
                </div>
              }
              position="right"
            />
          </div>
          <StyledSelect
            value={organization}
            onChange={(e) => setOrganization(e.target.value as 'default' | 'narrative' | 'minimal')}
            style={fieldStyle}
          >
            <option value="default">Par défaut (ordre de la config)</option>
            <option value="narrative">Narratif (groupé par pertinence)</option>
            <option value="minimal">Minimal (seulement l'essentiel)</option>
          </StyledSelect>
        </div>

        <div
          style={{
            marginBottom: redesignSpacing.lg,
            display: 'flex',
            alignItems: 'center',
            gap: redesignSpacing.sm,
          }}
        >
          <button
            onClick={onPreview}
            disabled={isLoadingPreview}
            style={{
              ...outlineButtonStyle,
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
                <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: remSize('body') }}>
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
            <div
              style={{
                marginBottom: redesignSpacing.sm,
                color: redesignText.label,
                fontSize: '10px',
                ...redesignMonoLabelStyle,
              }}
            >
              Tokens estimés {previewTokens}
            </div>
            <pre
              style={{
                padding: redesignSpacing.md,
                backgroundColor: redesignSurface.base,
                border: `1px solid ${redesignControl.border}`,
                borderRadius: redesignRadius.control,
                overflow: 'auto',
                maxHeight: '400px',
                fontFamily: redesignFont.mono,
                fontSize: remSize('small'),
                color: redesignText.body,
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
      <p style={{ color: theme.text.secondary, marginBottom: '1.5rem', fontSize: remSize('body') }}>
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
                fontSize: remSize('small'),
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

/**
 * Onglet "Logs de génération" (US 1-15) : sélecteur de dialogue puis panneau liste + détail, export JSON/CSV.
 */
function LogsTab() {
  const [selectedDialogueId, setSelectedDialogueId] = useState<string>('')
  const { data, isLoading } = useQuery({
    queryKey: ['unity-dialogues-list'],
    queryFn: () => unityDialoguesAPI.listUnityDialogues(),
    staleTime: 30_000,
  })
  const dialogues = data?.dialogues ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 200 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <label htmlFor="logs-dialogue-select" style={{ color: theme.text.secondary, fontSize: remSize('accent') }}>
          Dialogue :
        </label>
        <StyledSelect
          id="logs-dialogue-select"
          value={selectedDialogueId}
          onChange={(e) => setSelectedDialogueId(e.target.value)}
          disabled={isLoading}
          style={{
            padding: '0.5rem 0.75rem',
            border: `1px solid ${theme.border.primary}`,
            borderRadius: '6px',
            backgroundColor: theme.input.background,
            color: theme.input.color,
            minWidth: 220,
          }}
        >
          <option value="">— Choisir un dialogue —</option>
          {dialogues.map((d) => (
            <option key={d.filename} value={d.filename}>
              {d.title ?? d.filename}
            </option>
          ))}
        </StyledSelect>
      </div>
      {selectedDialogueId ? (
        <ErrorBoundary
          fallback={
            <div style={{ padding: '1rem', color: theme.state.error.color, border: `1px solid ${theme.border.primary}`, borderRadius: 8 }}>
              Erreur lors du chargement des logs.
            </div>
          }
        >
          <GenerationLogsPanel dialogueId={selectedDialogueId} />
        </ErrorBoundary>
      ) : (
        <div style={{ color: theme.text.secondary, fontSize: remSize('body') }}>
          Sélectionnez un dialogue pour afficher les logs de génération (prompts, réponses, coûts).
        </div>
      )}
    </div>
  )
}

