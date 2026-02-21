/**
 * Composant Dashboard avec layout 3 panneaux redimensionnables.
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { ContextSelector } from '../context/ContextSelector'
import { GenerationPanel } from '../generation/GenerationPanel'
import { EstimatedPromptPanel } from '../generation/EstimatedPromptPanel'
import { UnityDialogueEditor, type UnityDialogueEditorHandle } from '../generation/UnityDialogueEditor'
import { ReasoningTraceViewer } from '../generation/ReasoningTraceViewer'
import { ContextDetail } from '../context/ContextDetail'
import { ResizablePanels, type ResizablePanelsRef } from '../shared/ResizablePanels'
import { Tabs, type Tab } from '../shared/Tabs'
import { UnityDialogueList, type UnityDialogueListRef } from '../unityDialogues/UnityDialogueList'
import { UnityDialogueDetails } from '../unityDialogues/UnityDialogueDetails'
import { GraphEditor } from '../graph/GraphEditor'
import { NodeEditorPanel } from '../graph/NodeEditorPanel'
import { KeyboardShortcutsHelp } from '../shared/KeyboardShortcutsHelp'
import { useGenerationStore } from '../../store/generationStore'
import { useGenerationActionsStore } from '../../store/generationActionsStore'
import { useContextConfigStore } from '../../store/contextConfigStore'
import { useGraphStore } from '../../store/graphStore'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useCommandPalette } from '../../hooks/useCommandPalette'
import type { CharacterResponse, LocationResponse, ItemResponse, SpeciesResponse, CommunityResponse, UnityDialogueMetadata } from '../../types/api'
import { theme } from '../../theme'

type ContextItem = CharacterResponse | LocationResponse | ItemResponse | SpeciesResponse | CommunityResponse

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  const isLeft = direction === 'left'
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', transition: 'transform 0.2s ease' }}
    >
      <path
        d={isLeft ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'}
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Dashboard() {
  const [selectedContextItem, setSelectedContextItem] = useState<ContextItem | null>(null)
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false)
  const [rightPanelTab, setRightPanelTab] = useState<'prompt' | 'dialogue' | 'node' | 'details'>('prompt')
  const [centerPanelTab, setCenterPanelTab] = useState<'generation' | 'edition' | 'graph'>('generation')
  const [selectedDialogue, setSelectedDialogue] = useState<UnityDialogueMetadata | null>(null)
  const dialogueListRef = useRef<UnityDialogueListRef>(null)
  const unityDialogueEditorRef = useRef<UnityDialogueEditorHandle>(null)
  const { rawPrompt, tokenCount, promptHash, isEstimating, unityDialogueResponse, setUnityDialogueResponse } = useGenerationStore()
  const generationState = useGenerationStore((state) => ({
    isEstimating: state.isEstimating,
    unityDialogueResponse: state.unityDialogueResponse,
  }))
  const { actions } = useGenerationActionsStore()

  const { loadDefaultConfig } = useContextConfigStore()
  const commandPalette = useCommandPalette()
  
  // État du graphe pour détecter si un nœud est sélectionné et si une génération est en cours
  const { selectedNodeId, nodes: graphNodes, isGenerating: isGraphGenerating } = useGraphStore()

  // Boutons replier/déplier panneaux gauche & droite (layout 3 panneaux)
  const panelsRef = useRef<ResizablePanelsRef>(null)
  const expandedSizesRef = useRef<number[] | null>(null)
  const suppressSizesSyncRef = useRef(false)
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false)
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false)
  
  // Charger la configuration par défaut au démarrage pour initialiser les fieldConfigs
  // Cela garantit que tous les navigateurs ont la même configuration initiale
  useEffect(() => {
    loadDefaultConfig().catch((err) => {
      console.warn('Erreur lors du chargement de la config par défaut au démarrage:', err)
    })
  }, [loadDefaultConfig])

  // Raccourcis clavier
  useKeyboardShortcuts(
    [
      {
        key: 'ctrl+k',
        handler: () => {
          commandPalette.open()
        },
        description: 'Ouvrir la palette de commandes',
      },
      {
        key: 'ctrl+,',
        handler: () => {
          // Les options sont maintenant dans le Header
          // Cette fonctionnalité sera gérée par le Header
        },
        description: 'Ouvrir les options',
      },
      {
        key: 'ctrl+/',
        handler: () => {
          setIsHelpModalOpen(true)
        },
        description: 'Afficher l\'aide des raccourcis',
      },
      {
        key: 'escape',
        handler: () => {
          if (isHelpModalOpen) {
            setIsHelpModalOpen(false)
          }
        },
        description: 'Fermer les modals/panels',
        enabled: isHelpModalOpen,
      },
    ],
    [isHelpModalOpen]
  )

  
  // Ref pour suivre l'ID du dernier dialogue pour lequel on a fait le basculement automatique
  const lastAutoSwitchedDialogueRef = useRef<string | null>(null)
  
  // Ref pour suivre l'ID du dernier nœud pour lequel on a fait le basculement automatique
  const lastAutoSwitchedNodeRef = useRef<string | null>(null)
  
  // Basculer automatiquement vers l'onglet Dialogue quand la génération commence
  useEffect(() => {
    if (actions.isLoading && rightPanelTab !== 'dialogue') {
      setRightPanelTab('dialogue')
    }
  }, [actions.isLoading, rightPanelTab])

  // Basculer automatiquement vers l'onglet Dialogue quand un NOUVEAU dialogue Unity est généré
  // (seulement lors de la création, pas à chaque changement d'onglet manuel)
  useEffect(() => {
    if (unityDialogueResponse) {
      // Créer un ID unique pour ce dialogue (basé sur le titre ou le contenu)
      const dialogueId = unityDialogueResponse.title || 
        (unityDialogueResponse.json_content ? 
          JSON.stringify(unityDialogueResponse.json_content).slice(0, 100) : 
          'unknown')
      
      // Basculer seulement si c'est un nouveau dialogue (pas encore traité)
      if (lastAutoSwitchedDialogueRef.current !== dialogueId) {
        setRightPanelTab('dialogue')
        lastAutoSwitchedDialogueRef.current = dialogueId
      }
    } else {
      // Si le dialogue est supprimé, réinitialiser la ref
      lastAutoSwitchedDialogueRef.current = null
    }
    // Ne pas inclure rightPanelTab dans les dépendances pour éviter les basculements
    // lors des changements manuels d'onglet
  }, [unityDialogueResponse])

  const rightPanelTabs: Tab[] = useMemo(() => [
    {
      id: 'prompt',
      label: 'Prompt',
      content: (
        <div style={{ flex: 1, minHeight: 0, maxHeight: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
          <EstimatedPromptPanel
            raw_prompt={rawPrompt}
            isEstimating={isEstimating}
            tokenCount={tokenCount}
            promptHash={promptHash}
          />
        </div>
      ),
    },

    {
      id: 'dialogue',
      label: 'Dialogue généré',
      content: (
        <div style={{ flex: 1, minHeight: 0, maxHeight: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Reasoning Trace (dépliable en haut) */}
          {unityDialogueResponse?.reasoning_trace && (
            <div style={{ flexShrink: 0, borderBottom: `1px solid ${theme.border.primary}` }}>
              <ReasoningTraceViewer
                reasoningTrace={unityDialogueResponse.reasoning_trace}
                isGenerating={false}
              />
            </div>
          )}
          
          {/* Contenu du dialogue */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {unityDialogueResponse ? (
              <UnityDialogueEditor
                ref={unityDialogueEditorRef}
                json_content={unityDialogueResponse.json_content}
                title={unityDialogueResponse.title}
                hideHeaderSaveButton={true}
                onSave={() => {
                  // Rafraîchir la liste des dialogues après sauvegarde
                  dialogueListRef.current?.refresh()
                  // Nettoyer le panneau "Dialogue généré" pour revenir à l'état initial
                  setUnityDialogueResponse(null)
                }}
              />
            ) : (
              <div style={{ 
                padding: '2rem', 
                textAlign: 'center', 
                color: theme.text.secondary,
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {actions.isLoading || generationState.isEstimating || isGraphGenerating
                  ? 'Génération en cours...'
                  : 'Aucun dialogue Unity généré'}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      id: 'node',
      label: 'Édition de nœud',
      content: (
        <div style={{ 
          flex: 1, 
          minHeight: 0, 
          maxHeight: '100%', 
          display: 'flex', 
          flexDirection: 'column', 
          height: '100%',
          padding: '1rem',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}>
          <NodeEditorPanel />
        </div>
      ),
    },
    {
      id: 'details',
      label: 'Détails',
      content: (
        <div style={{ flex: 1, minHeight: 0, maxHeight: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
          {selectedContextItem ? (
            <ContextDetail item={selectedContextItem} />
          ) : (
            <div style={{ 
              padding: '2rem', 
              textAlign: 'center', 
              color: theme.text.secondary,
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              Sélectionnez un élément de contexte pour voir ses détails
            </div>
          )}
        </div>
      ),
    },
  ], [unityDialogueResponse, rawPrompt, isEstimating, tokenCount, promptHash, selectedContextItem, actions.isLoading, generationState.isEstimating, isGraphGenerating, setUnityDialogueResponse])
  
  // Basculer automatiquement vers l'onglet "Édition de nœud" quand un NOUVEAU nœud est sélectionné dans le graphe
  // (seulement lors de la sélection initiale, pas à chaque changement d'onglet manuel)
  useEffect(() => {
    if (selectedNodeId && centerPanelTab === 'graph') {
      // Basculer seulement si c'est un nouveau nœud (pas encore traité)
      if (lastAutoSwitchedNodeRef.current !== selectedNodeId) {
        setRightPanelTab('node')
        lastAutoSwitchedNodeRef.current = selectedNodeId
      }
    } else if (!selectedNodeId) {
      // Si aucun nœud n'est sélectionné, réinitialiser la ref
      lastAutoSwitchedNodeRef.current = null
    }
    // Ne pas inclure rightPanelTab dans les dépendances pour éviter les basculements
    // lors des changements manuels d'onglet
  }, [selectedNodeId, centerPanelTab])

  // À l'ouverture du graphe avec des nœuds chargés, afficher le panneau "Édition de nœud" si on est encore sur Prompt
  useEffect(() => {
    if (centerPanelTab === 'graph' && graphNodes.length > 0 && rightPanelTab === 'prompt') {
      setRightPanelTab('node')
    }
  }, [centerPanelTab, graphNodes.length, rightPanelTab])

  const applyCollapsedLayout = useCallback(
    (nextLeftCollapsed: boolean, nextRightCollapsed: boolean) => {
      const base = expandedSizesRef.current ?? panelsRef.current?.getSizes()
      if (!base || base.length < 3 || !panelsRef.current) return

      // 0% = panneau réellement replié (bouton sur la barre de séparation)
      const COLLAPSED_PCT = 0
      const leftSize = nextLeftCollapsed ? COLLAPSED_PCT : base[0]
      const rightSize = nextRightCollapsed ? COLLAPSED_PCT : base[2]
      const centerSize = Math.max(0, 100 - leftSize - rightSize)

      suppressSizesSyncRef.current = true
      panelsRef.current.setSizes([leftSize, centerSize, rightSize], { persist: false })
      // libère le verrou après le tick pour éviter d'écraser expandedSizesRef
      setTimeout(() => {
        suppressSizesSyncRef.current = false
      }, 0)
    },
    []
  )

  const toggleLeftPanel = useCallback(() => {
    const next = !isLeftPanelCollapsed
    if (!expandedSizesRef.current && panelsRef.current) {
      expandedSizesRef.current = panelsRef.current.getSizes()
    }
    setIsLeftPanelCollapsed(next)
    applyCollapsedLayout(next, isRightPanelCollapsed)
  }, [applyCollapsedLayout, isLeftPanelCollapsed, isRightPanelCollapsed])

  const toggleRightPanel = useCallback(() => {
    const next = !isRightPanelCollapsed
    if (!expandedSizesRef.current && panelsRef.current) {
      expandedSizesRef.current = panelsRef.current.getSizes()
    }
    setIsRightPanelCollapsed(next)
    applyCollapsedLayout(isLeftPanelCollapsed, next)
  }, [applyCollapsedLayout, isLeftPanelCollapsed, isRightPanelCollapsed])

  const applyToggleHover = useCallback(
    (el: HTMLButtonElement, isHover: boolean) => {
      el.style.backgroundColor = isHover ? 'rgba(60, 60, 60, 0.95)' : 'rgba(45, 45, 45, 0.85)'
      el.style.borderColor = isHover ? theme.button.primary.background : 'rgba(255, 255, 255, 0.1)'
      el.style.transform = isHover ? 'translateY(-50%) scale(1.1)' : 'translateY(-50%) scale(1)'
      el.style.boxShadow = isHover 
        ? `0 0 20px ${theme.button.primary.background}44, 0 8px 16px rgba(0, 0, 0, 0.5)` 
        : '0 4px 12px rgba(0, 0, 0, 0.4)'
      el.style.color = isHover ? '#fff' : theme.text.primary
    },
    []
  )

  const applyHeaderToggleHover = useCallback(
    (el: HTMLButtonElement, isHover: boolean) => {
      el.style.backgroundColor = isHover ? 'rgba(255, 255, 255, 0.08)' : 'transparent'
      el.style.borderColor = isHover ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)'
      el.style.transform = isHover ? 'scale(1.05)' : 'scale(1)'
      el.style.color = isHover ? '#fff' : theme.text.secondary
    },
    []
  )


  return (
    <ResizablePanels
      ref={panelsRef}
      storageKey="dashboard_panels"
      defaultSizes={[20, 50, 30]}
      minSizes={[200, 400, 250]}
      direction="horizontal"
      style={{
        height: '100%',
        backgroundColor: theme.background.primary,
      }}
      onSizesChange={(sizes) => {
        if (suppressSizesSyncRef.current) return
        // On mémorise uniquement quand les deux panneaux sont dépliés
        if (!isLeftPanelCollapsed && !isRightPanelCollapsed) {
          expandedSizesRef.current = sizes
        }
      }}
    >
      {/* Panneau gauche: Sélection du contexte */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: theme.background.panel,
          height: '100%',
          minHeight: 0,
          position: 'relative',
        }}
      >
        {!isLeftPanelCollapsed && (
          <>
            <div
              style={{
                padding: '0.5rem 0.75rem',
                borderBottom: `1px solid ${theme.border.primary}`,
                backgroundColor: theme.background.panelHeader,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.5rem',
                flexShrink: 0,
              }}
            >
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: theme.text.primary }}>
                Contexte
              </div>
              <button
                onClick={toggleLeftPanel}
                onMouseDown={(e) => {
                  e.currentTarget.style.transform = 'scale(0.92)'
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)'
                }}
                title="Replier le panneau gauche"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  backgroundColor: 'transparent',
                  color: theme.text.secondary,
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onMouseEnter={(e) => applyHeaderToggleHover(e.currentTarget, true)}
                onMouseLeave={(e) => applyHeaderToggleHover(e.currentTarget, false)}
                aria-label="Replier le panneau gauche"
              >
                <ChevronIcon direction="left" />
              </button>
            </div>
            <ContextSelector 
              onItemSelected={(item) => {
                setSelectedContextItem(item)
                if (item) {
                  setRightPanelTab('details')
                }
              }}
            />
          </>
        )}
      </div>

      {/* Panneau central: Génération / Édition avec onglets */}
      <div
        style={{
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: theme.background.panel,
          height: '100%',
          position: 'relative',
        }}
      >
        {/* Rails (boutons) visibles quand un panneau latéral est replié */}
        {isLeftPanelCollapsed && (
          <button
            onClick={toggleLeftPanel}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'translateY(-50%) scale(0.95)'
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)'
            }}
            title="Déplier le panneau gauche"
            style={{
              position: 'absolute',
              left: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 50,
              width: 24,
              height: 48,
              borderRadius: 12,
              border: '1px solid rgba(255, 255, 255, 0.1)',
              backgroundColor: 'rgba(45, 45, 45, 0.85)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              color: theme.text.primary,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              display: 'grid',
              placeItems: 'center',
            }}
            onMouseEnter={(e) => applyToggleHover(e.currentTarget, true)}
            onMouseLeave={(e) => applyToggleHover(e.currentTarget, false)}
            aria-label="Déplier le panneau gauche"
          >
            <ChevronIcon direction="right" />
          </button>
        )}
        {isRightPanelCollapsed && (
          <button
            onClick={toggleRightPanel}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'translateY(-50%) scale(0.95)'
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)'
            }}
            title="Déplier le panneau droit"
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 50,
              width: 24,
              height: 48,
              borderRadius: 12,
              border: '1px solid rgba(255, 255, 255, 0.1)',
              backgroundColor: 'rgba(45, 45, 45, 0.85)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              color: theme.text.primary,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              display: 'grid',
              placeItems: 'center',
            }}
            onMouseEnter={(e) => applyToggleHover(e.currentTarget, true)}
            onMouseLeave={(e) => applyToggleHover(e.currentTarget, false)}
            aria-label="Déplier le panneau droit"
          >
            <ChevronIcon direction="left" />
          </button>
        )}
        <Tabs
          tabs={[
            {
              id: 'generation',
              label: 'Génération de Dialogues',
              content: (
                <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  <GenerationPanel />
                </div>
              ),
            },
            {
              id: 'edition',
              label: 'Édition de Dialogues',
              content: (
                <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
                  <div
                    style={{
                      // Panneau gauche (recherche/liste) volontairement compact pour donner de la place à l'édition
                      width: 'clamp(260px, 22vw, 340px)',
                      minWidth: '240px',
                      borderRight: `1px solid ${theme.border.primary}`,
                      overflow: 'hidden',
                      backgroundColor: theme.background.panel,
                    }}
                  >
                    <UnityDialogueList
                      ref={dialogueListRef}
                      onSelectDialogue={setSelectedDialogue}
                      selectedFilename={selectedDialogue?.filename || null}
                    />
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden', backgroundColor: theme.background.panel }}>
                    {selectedDialogue ? (
                      <UnityDialogueDetails
                        filename={selectedDialogue.filename}
                        onClose={() => setSelectedDialogue(null)}
                        onDeleted={async () => {
                          await dialogueListRef.current?.refresh()
                        }}
                        onGenerateContinuation={() => {
                          // Basculer vers l'onglet Génération
                          setCenterPanelTab('generation')
                          // TODO: Pré-remplir le contexte avec le dialogue existant pour générer la suite
                          // Pour l'instant, on bascule juste vers l'onglet génération
                        }}
                      />
                    ) : (
                      <div style={{ padding: '2rem', textAlign: 'center', color: theme.text.secondary }}>
                        Sélectionnez un dialogue Unity pour le voir et l'éditer
                      </div>
                    )}
                  </div>
                </div>
              ),
            },
            {
              id: 'graph',
              label: '📊 Éditeur de Graphe',
              content: (
                <GraphEditor />
              ),
            },
          ]}
          activeTabId={centerPanelTab}
          onTabChange={(tabId) => setCenterPanelTab(tabId as 'generation' | 'edition' | 'graph')}
          style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
          contentStyle={centerPanelTab === 'graph' ? { overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' } : undefined}
        />
      </div>

      {/* Panneau droit: Prompt Estimé / Détails */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: theme.background.panel,
          height: '100%',
          minHeight: 0,
          maxHeight: '100%',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {isRightPanelCollapsed ? (
          <div style={{ flex: 1, minHeight: 0 }} />
        ) : (
          <>
        <div
          style={{
            padding: '0.5rem 0.75rem',
            borderBottom: `1px solid ${theme.border.primary}`,
            backgroundColor: theme.background.panelHeader,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: theme.text.primary }}>
            Détails
          </div>
          <button
            onClick={toggleRightPanel}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'scale(0.92)'
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)'
            }}
            title="Replier le panneau droit"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: '1px solid rgba(255, 255, 255, 0.1)',
              backgroundColor: 'transparent',
              color: theme.text.secondary,
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseEnter={(e) => applyHeaderToggleHover(e.currentTarget, true)}
            onMouseLeave={(e) => applyHeaderToggleHover(e.currentTarget, false)}
            aria-label="Replier le panneau droit"
          >
            <ChevronIcon direction="right" />
          </button>
        </div>
        {/* Indicateur de brouillon non sauvegardé */}
        {actions.handleGenerate && actions.isDirty && (
          <div
            style={{
              padding: '0.5rem',
              borderBottom: `1px solid ${theme.border.primary}`,
              backgroundColor: theme.background.panelHeader,
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                fontSize: '0.85rem',
                color: theme.state.info.color,
                fontStyle: 'italic',
              }}
            >
              ● Brouillon non sauvegardé
            </div>
          </div>
        )}
        {/* Zone de contenu avec scroll (prend l'espace restant, mais laisse toujours de la place pour le bouton) */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <Tabs
            tabs={rightPanelTabs}
            activeTabId={rightPanelTab}
            onTabChange={(tabId) => setRightPanelTab(tabId as 'prompt' | 'dialogue' | 'node' | 'details')}
            style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
            // Important: overflow: 'hidden' pour éviter le double scroll, mais scrollbar-gutter réserve l'espace
            // Le contenu enfant gère son propre scroll avec scrollbar-gutter: stable
            contentStyle={{ overflow: 'hidden', scrollbarGutter: 'stable' }}
          />
        </div>
        {/* Boutons en bas (visible sur Prompt et Dialogue généré) */}
        {actions.handleGenerate && (rightPanelTab === 'prompt' || rightPanelTab === 'dialogue') && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderTop: `2px solid ${theme.border.primary}`,
              backgroundColor: theme.background.panelHeader,
              flexShrink: 0,
              flexGrow: 0,
              boxSizing: 'border-box',
              position: 'relative',
              zIndex: 10,
            }}
          >
            {/* Barre de progression */}
            {(actions.isLoading || generationState.isEstimating || isGraphGenerating) && (
              <>
                <div
                  style={{
                    width: '100%',
                    height: '4px',
                    backgroundColor: theme.border.primary,
                    borderRadius: '2px',
                    overflow: 'hidden',
                    marginBottom: '0.75rem',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      height: '100%',
                      width: '40%',
                      backgroundColor: theme.button.primary.background,
                      animation: 'loading-slide 1.5s ease-in-out infinite',
                    }}
                  />
                </div>
                <div
                  style={{
                    fontSize: '0.85rem',
                    color: theme.text.secondary,
                    textAlign: 'center',
                    marginBottom: '0.5rem',
                  }}
                >
                  {isGraphGenerating
                    ? 'Génération de nœud...'
                    : generationState.isEstimating && !actions.isLoading
                    ? 'Estimation des tokens...'
                    : actions.isLoading && !generationState.unityDialogueResponse
                    ? 'Génération du dialogue...'
                    : actions.isLoading
                    ? 'Validation et finalisation...'
                    : 'Traitement en cours...'}
                </div>
                <style>{`
                  @keyframes loading-slide {
                    0% {
                      left: -40%;
                    }
                    100% {
                      left: 100%;
                    }
                  }
                `}</style>
              </>
            )}
            {/* Si un dialogue a déjà été généré, afficher Sauvegarder + bouton reload Générer */}
            {rightPanelTab === 'dialogue' && unityDialogueResponse ? (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  onClick={() => unityDialogueEditorRef.current?.handleSave()}
                  disabled={!unityDialogueEditorRef.current?.isValid || unityDialogueEditorRef.current?.isSaving || actions.isLoading || isGraphGenerating}
                  style={{
                    flex: 1,
                    padding: '0.875rem 1rem',
                    fontSize: '1.1rem',
                    fontWeight: 'bold',
                    backgroundColor: theme.button.primary.background,
                    color: theme.button.primary.color,
                    border: 'none',
                    borderRadius: '6px',
                    cursor: (unityDialogueEditorRef.current?.isValid && !unityDialogueEditorRef.current?.isSaving && !actions.isLoading && !isGraphGenerating) ? 'pointer' : 'not-allowed',
                    opacity: (unityDialogueEditorRef.current?.isValid && !unityDialogueEditorRef.current?.isSaving && !actions.isLoading && !isGraphGenerating) ? 1 : 0.6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    boxSizing: 'border-box',
                  }}
                  title="Sauvegarder (Ctrl+S)"
                >
                  {unityDialogueEditorRef.current?.isSaving ? 'Sauvegarde...' : 'Sauvegarder'}
                </button>
                <button
                  onClick={actions.handleGenerate}
                  disabled={actions.isLoading || isGraphGenerating}
                  style={{
                    padding: '0.875rem',
                    fontSize: '1.1rem',
                    backgroundColor: theme.button.default.background,
                    color: theme.button.default.color,
                    border: `1px solid ${theme.border.primary}`,
                    borderRadius: '6px',
                    cursor: (actions.isLoading || isGraphGenerating) ? 'not-allowed' : 'pointer',
                    opacity: (actions.isLoading || isGraphGenerating) ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '48px',
                    height: '48px',
                    transition: 'all 0.2s',
                    boxSizing: 'border-box',
                  }}
                  title="Générer à nouveau (Ctrl+Enter)"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      animation: actions.isLoading || isGraphGenerating ? 'spin 1s linear infinite' : 'none',
                    }}
                  >
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                  </svg>
                  <style>{`
                    @keyframes spin {
                      from { transform: rotate(0deg); }
                      to { transform: rotate(360deg); }
                    }
                  `}</style>
                </button>
              </div>
            ) : (rightPanelTab === 'dialogue' || rightPanelTab === 'prompt') ? (
              // Sur l'onglet Prompt ou Dialogue généré sans dialogue, afficher le bouton Générer normal
              <button
                onClick={actions.handleGenerate}
                disabled={actions.isLoading || isGraphGenerating}
                style={{
                  width: '100%',
                  padding: '0.875rem 1rem',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  backgroundColor: theme.button.primary.background,
                  color: theme.button.primary.color,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: (actions.isLoading || isGraphGenerating) ? 'not-allowed' : 'pointer',
                  opacity: (actions.isLoading || isGraphGenerating) ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  transition: 'all 0.2s',
                  boxSizing: 'border-box',
                }}
                title="Générer (Ctrl+Enter)"
              >
                <span>Générer</span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    opacity: 0.8,
                    fontWeight: 'normal',
                  }}
                >
                  Ctrl+Enter
                </span>
              </button>
            ) : null}
          </div>
        )}
          </>
        )}
      </div>

      <KeyboardShortcutsHelp
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
      />
    </ResizablePanels>
  )
}

