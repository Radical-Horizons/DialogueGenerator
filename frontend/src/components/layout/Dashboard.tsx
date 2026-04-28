/**
 * Composant Dashboard avec layout 3 panneaux redimensionnables.
 */
import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { ContextSelector } from '../context/ContextSelector'
import { GDD_CONTEXT_PANEL_TITLE } from '../context/constants'
import { GenerationPanel } from '../generation/GenerationPanel'
import { EstimatedPromptPanel } from '../generation/EstimatedPromptPanel'
import { UnityDialogueEditor, type UnityDialogueEditorHandle } from '../generation/UnityDialogueEditor'
import { ReasoningTraceViewer } from '../generation/ReasoningTraceViewer'
import { ContextDetail } from '../context/ContextDetail'
import { ResizablePanels, type ResizablePanelsRef } from '../shared/ResizablePanels'
import { SaveStatusIndicator } from '../shared/SaveStatusIndicator'
import { Tabs, type Tab } from '../shared/Tabs'
import { UnityDialogueList, type UnityDialogueListRef } from '../unityDialogues/UnityDialogueList'
import { DialogueEditionNarrowProvider } from '../unityDialogues/DialogueEditionNarrowContext'
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
import { useViewportMode } from '../../hooks/useViewportMode'
import { useMobileShellKeyboardComfort } from '../../hooks/useMobileShellKeyboardComfort'
import { useNarrowInlineSize } from '../../hooks/useNarrowInlineSize'
import {
  PANEL_COMFORT_MIN_WIDTH_PX,
  SEGMENTED_CHROME_COMFORT_MIN_WIDTH_PX,
  panelHeaderTitleTypography,
} from '../../theme/responsiveChrome'
import { remSize } from '../../theme/uiTypography'
import {
  unityDialogueListColumnStyle,
  unityDialogueWorkspaceColumnStyle,
} from '../../theme/unityDialogueListShell'
import { NarrowOverlayDrawer } from './NarrowOverlayDrawer'
import type { CharacterResponse, LocationResponse, ItemResponse, SpeciesResponse, CommunityResponse, UnityDialogueMetadata } from '../../types/api'
import { theme } from '../../theme'
import { TOUCH_TARGET_MIN_PX } from '../../constants'

type ContextItem = CharacterResponse | LocationResponse | ItemResponse | SpeciesResponse | CommunityResponse

function ChevronIcon({ direction, size = 16 }: { direction: 'left' | 'right'; size?: number }) {
  const isLeft = direction === 'left'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flexShrink: 0 }}
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

/**
 * Bouton d'en-tête pour replier un panneau latéral.
 * Affiche un chevron + label court; le label disparaît sur les petits panneaux via overflow hidden.
 */
/**
 * direction : sens de repliement (détermine l'icône chevron et son animation).
 * chevronPosition : côté où le chevron apparaît par rapport au label (défaut = même côté que direction).
 */
function PanelCollapseButton({
  direction,
  chevronPosition,
  label,
  onClick,
  ariaLabel,
}: {
  direction: 'left' | 'right'
  chevronPosition?: 'left' | 'right'
  label: string
  onClick: () => void
  ariaLabel: string
}) {
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)

  const chevronSide = chevronPosition ?? direction
  const translateX = hovered ? (direction === 'left' ? -2 : 2) : 0

  const scale = pressed ? 0.93 : hovered ? 1.04 : 1
  const bg = hovered ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)'
  const borderColor = hovered ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.09)'
  const textColor = hovered ? theme.text.primary : theme.text.tertiary

  const chevron = (
    <span style={{ transform: `translateX(${translateX}px)`, transition: 'transform 0.18s ease', display: 'flex' }}>
      <ChevronIcon direction={direction} size={13} />
    </span>
  )

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false) }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      title={ariaLabel}
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.3rem',
        padding: '0.35rem 0.5rem',
        minHeight: TOUCH_TARGET_MIN_PX,
        minWidth: TOUCH_TARGET_MIN_PX,
        boxSizing: 'border-box',
        borderRadius: 99,
        border: `1px solid ${borderColor}`,
        backgroundColor: bg,
        color: textColor,
        cursor: 'pointer',
        flexShrink: 0,
        overflow: 'hidden',
        maxWidth: 90,
        transform: `scale(${scale})`,
        transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: hovered ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
      }}
    >
      {chevronSide === 'left' && chevron}
      <span style={{
        fontSize: remSize('caption'),
        fontWeight: 600,
        letterSpacing: '0.03em',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        lineHeight: 1,
      }}>
        {label}
      </span>
      {chevronSide === 'right' && chevron}
    </button>
  )
}

/**
 * Bouton flottant sur le bord du panneau central pour ré-ouvrir un panneau replié.
 * Pill vertical avec une ligne de texte rotée et halo coloré au hover.
 *
 * `anchor`:
 *  - `'center'` (défaut) : centré verticalement — mode comfortable (bureau).
 *  - `'bottom'` : ancré en bas à `bottomOffset`px du bord — mode narrow, évite de
 *    couvrir les onglets internes qui occupent le centre du panneau.
 */
function PanelExpandButton({
  side,
  label,
  onClick,
  ariaLabel,
  anchor = 'center',
  bottomOffset = 24,
}: {
  side: 'left' | 'right'
  label: string
  onClick: () => void
  ariaLabel: string
  /** Ancrage vertical du pill — 'center' (bureau) ou 'bottom' (narrow). */
  anchor?: 'center' | 'bottom'
  /** Distance du bas en px quand `anchor='bottom'`. */
  bottomOffset?: number
}) {
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)

  const accentColor = theme.button.primary.background
  const isActive = hovered || pressed
  const scale = pressed ? 0.94 : hovered ? 1.05 : 1
  const translateX = hovered ? (side === 'left' ? 2 : -2) : 0

  /* Transparence "très auto" :
   *   repos  → quasi invisible (15% opacité globale)
   *   hover/focus → pleinement visible (100%) avec halo accentué */
  const globalOpacity = isActive ? 1 : 0.38
  /* Fond opaque même au repos pour éviter que les éléments derrière (ex: flèche native du <select>)
   * transparaissent à travers le rail — seuls les textes/bords/ombres varient avec l'opacité globale. */
  const bg = isActive ? `rgba(0,123,255,0.22)` : 'rgba(18, 18, 22, 1)'
  const borderColor = isActive ? accentColor : 'rgba(255,255,255,0.15)'
  const glow = isActive
    ? `0 0 18px ${accentColor}55, 0 6px 18px rgba(0,0,0,0.5)`
    : '0 2px 8px rgba(0,0,0,0.3)'

  const verticalStyle =
    anchor === 'bottom'
      ? { bottom: bottomOffset, transform: `scale(${scale}) translateX(${translateX}px)` }
      : { top: '50%', transform: `translateY(-50%) scale(${scale}) translateX(${translateX}px)` }

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false) }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      title={ariaLabel}
      aria-label={ariaLabel}
      style={{
        position: 'absolute',
        [side]: 4,
        ...verticalStyle,
        zIndex: 50,
        width: 24,
        minWidth: 24,
        height: 56,
        minHeight: 56,
        borderRadius: 7,
        border: `1px solid ${borderColor}`,
        backgroundColor: bg,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        color: isActive ? '#fff' : theme.text.secondary,
        cursor: 'pointer',
        boxShadow: glow,
        opacity: globalOpacity,
        transition: 'opacity 0.2s ease, background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, transform 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        padding: '2px 0',
        overflow: 'hidden',
      }}
    >
      {/* ‹ › typographiques : rendu fiable, clairement distinct du ▼ des selects */}
      <span style={{ fontSize: 14, fontWeight: 900, lineHeight: 1, color: 'inherit', userSelect: 'none' }}>
        {side === 'left' ? '›' : '‹'}
      </span>
      <span
        style={{
          fontSize: '0.65rem',
          fontWeight: 700,
          letterSpacing: '0.04em',
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
          lineHeight: 1,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          color: 'inherit',
        }}
      >
        {label.slice(0, 3).toUpperCase()}
      </span>
    </button>
  )
}


export function Dashboard() {
  const [selectedContextItem, setSelectedContextItem] = useState<ContextItem | null>(null)
  const [selectedContextHistoryStem, setSelectedContextHistoryStem] = useState<string | null>(null)
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
  const { selectedNodeId, isGenerating: isGraphGenerating } = useGraphStore()

  // Boutons replier/déplier panneaux gauche & droite (layout 3 panneaux)
  const panelsRef = useRef<ResizablePanelsRef>(null)
  const expandedSizesRef = useRef<number[] | null>(null)
  const suppressSizesSyncRef = useRef(false)
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false)
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false)
  const viewportMode = useViewportMode()
  /** FR120 : &lt; 1024px — panneaux latéraux en overlay drawer, pas en colonnes compressées */
  const useNarrowSidePanels = viewportMode !== 'desktop'
  const { bottomInsetPx: keyboardBottomInsetPx } = useMobileShellKeyboardComfort(useNarrowSidePanels)
  const shellKeyboardInsetStyle = useMemo(
    (): CSSProperties => ({
      paddingBottom: keyboardBottomInsetPx,
      boxSizing: 'border-box',
    }),
    [keyboardBottomInsetPx]
  )
  /** Drawer narrow plein écran : ne pas réserver d’inset sous le canvas masqué par l’overlay. */
  const narrowDrawerObscuresCenter =
    useNarrowSidePanels && (!isLeftPanelCollapsed || !isRightPanelCollapsed)
  const centerColumnKeyboardStyle = useMemo(
    (): CSSProperties => ({
      paddingBottom: narrowDrawerObscuresCenter ? 0 : keyboardBottomInsetPx,
      boxSizing: 'border-box',
    }),
    [narrowDrawerObscuresCenter, keyboardBottomInsetPx]
  )
  const { ref: centerColumnRef, isNarrow: isNarrowCenterColumn } = useNarrowInlineSize(
    SEGMENTED_CHROME_COMFORT_MIN_WIDTH_PX,
    { measureParentClientWidth: true }
  )
  const { ref: dialogueEditionWorkspaceRef, isNarrow: isDialogueEditionNarrow } = useNarrowInlineSize(
    PANEL_COMFORT_MIN_WIDTH_PX
  )
  const panelTitleFontRem = isNarrowCenterColumn
    ? panelHeaderTitleTypography.narrowFontRem
    : panelHeaderTitleTypography.comfortableFontRem
  const showCollapsedLeftAffordance = isLeftPanelCollapsed
  const showCollapsedRightAffordance = isRightPanelCollapsed
  const lastViewportModeRef = useRef(viewportMode)
  const didApplyInitialViewportRef = useRef(false)
  
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
            return
          }
          if (useNarrowSidePanels) {
            if (!isLeftPanelCollapsed) {
              setIsLeftPanelCollapsed(true)
              return
            }
            if (!isRightPanelCollapsed) {
              setIsRightPanelCollapsed(true)
            }
          }
        },
        description: 'Fermer les modals/panels',
        enabled:
          isHelpModalOpen ||
          (useNarrowSidePanels && (!isLeftPanelCollapsed || !isRightPanelCollapsed)),
      },
    ],
    [
      isHelpModalOpen,
      useNarrowSidePanels,
      isLeftPanelCollapsed,
      isRightPanelCollapsed,
    ]
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
          padding: '0.65rem',
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
            <ContextDetail
              item={selectedContextItem}
              historyCategoryStem={selectedContextHistoryStem}
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
              Sélectionnez un élément de contexte pour voir ses détails
            </div>
          )}
        </div>
      ),
    },
  ], [unityDialogueResponse, rawPrompt, isEstimating, tokenCount, promptHash, selectedContextItem, selectedContextHistoryStem, actions.isLoading, generationState.isEstimating, isGraphGenerating, setUnityDialogueResponse])

  // En mode éditeur de graphe : masquer "Prompt". En mode Génération : masquer "Édition de nœud"
  const visibleRightPanelTabs = useMemo(() => {
    if (centerPanelTab === 'graph') {
      return rightPanelTabs.filter((t) => t.id !== 'prompt')
    }
    if (centerPanelTab === 'generation') {
      return rightPanelTabs.filter((t) => t.id !== 'node')
    }
    return rightPanelTabs
  }, [centerPanelTab, rightPanelTabs])

  // Onglet actif affiché : ne jamais rester sur un onglet caché pour le panneau central actuel
  const effectiveRightPanelTab =
    centerPanelTab === 'graph' && rightPanelTab === 'prompt'
      ? 'node'
      : centerPanelTab === 'generation' && rightPanelTab === 'node'
        ? 'prompt'
        : rightPanelTab

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

  // Si l'onglet actif est caché pour le panneau central actuel, basculer vers un onglet visible
  useEffect(() => {
    if (centerPanelTab === 'graph' && rightPanelTab === 'prompt') {
      setRightPanelTab('node')
    } else if (centerPanelTab === 'generation' && rightPanelTab === 'node') {
      setRightPanelTab('prompt')
    }
  }, [centerPanelTab, rightPanelTab])

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

  useEffect(() => {
    const isInitialApply = !didApplyInitialViewportRef.current
    if (!isInitialApply && lastViewportModeRef.current === viewportMode) return
    didApplyInitialViewportRef.current = true
    lastViewportModeRef.current = viewportMode

    if (!panelsRef.current) return

    // Capture expanded sizes once before forcing a responsive collapse
    if (viewportMode !== 'desktop' && !expandedSizesRef.current) {
      expandedSizesRef.current = panelsRef.current.getSizes()
    }

    if (viewportMode === 'mobile') {
      setIsLeftPanelCollapsed(true)
      setIsRightPanelCollapsed(true)
      applyCollapsedLayout(true, true)
      return
    }

    if (viewportMode === 'tablet') {
      setIsLeftPanelCollapsed(true)
      setIsRightPanelCollapsed(true)
      applyCollapsedLayout(true, true)
      return
    }

    // desktop: restore (do not persist; storage remains authoritative)
    setIsLeftPanelCollapsed(false)
    setIsRightPanelCollapsed(false)
    const restore = expandedSizesRef.current
    if (restore && restore.length >= 3) {
      suppressSizesSyncRef.current = true
      panelsRef.current.setSizes(restore, { persist: false })
      setTimeout(() => {
        suppressSizesSyncRef.current = false
      }, 0)
    }
  }, [viewportMode, applyCollapsedLayout])

  /**
   * Narrow : fermer les drawers au changement d’onglet central (génération / édition / graphe).
   * Évite un overlay modal au-dessus du graphe ou du flux génération (FR120 AC2).
   */
  useEffect(() => {
    if (viewportMode === 'desktop') return
    setIsLeftPanelCollapsed(true)
    setIsRightPanelCollapsed(true)
  }, [centerPanelTab, viewportMode])

  const toggleLeftPanel = useCallback(() => {
    const next = !isLeftPanelCollapsed
    if (!expandedSizesRef.current && panelsRef.current) {
      expandedSizesRef.current = panelsRef.current.getSizes()
    }
    if (viewportMode !== 'desktop' && !next) {
      setIsRightPanelCollapsed(true)
    }
    setIsLeftPanelCollapsed(next)
    if (viewportMode !== 'desktop') {
      applyCollapsedLayout(true, true)
    } else {
      applyCollapsedLayout(next, isRightPanelCollapsed)
    }
  }, [applyCollapsedLayout, isLeftPanelCollapsed, isRightPanelCollapsed, viewportMode])

  const toggleRightPanel = useCallback(() => {
    const next = !isRightPanelCollapsed
    if (!expandedSizesRef.current && panelsRef.current) {
      expandedSizesRef.current = panelsRef.current.getSizes()
    }
    if (viewportMode !== 'desktop' && !next) {
      setIsLeftPanelCollapsed(true)
    }
    setIsRightPanelCollapsed(next)
    if (viewportMode !== 'desktop') {
      applyCollapsedLayout(true, true)
    } else {
      applyCollapsedLayout(isLeftPanelCollapsed, next)
    }
  }, [applyCollapsedLayout, isLeftPanelCollapsed, isRightPanelCollapsed, viewportMode])



  const onContextItemSelected = useCallback(
    (item: ContextItem | null, historyStem?: string | null) => {
      setSelectedContextItem(item)
      setSelectedContextHistoryStem(item ? historyStem ?? null : null)
      if (item) {
        setRightPanelTab('details')
      }
    },
    []
  )

  const narrowDetailsHeaderEnd =
    actions.handleGenerate ? (
      <SaveStatusIndicator
        appearance="discreet"
        status={actions.saveStatus}
        lastSavedAt={actions.draftLastSavedAt}
        style={{ flexShrink: 0, maxWidth: 'min(200px, 38vw)' }}
      />
    ) : null

  /** Barre d’actions bas du panneau droit (Prompt / Dialogue) — desktop et drawer narrow. */
  const renderRightActionsFooter = (): ReactNode => {
    if (
      !actions.handleGenerate ||
      (effectiveRightPanelTab !== 'prompt' && effectiveRightPanelTab !== 'dialogue')
    ) {
      return null
    }
    return (
      <div
        style={{
          padding: '0.5rem 0.75rem',
          borderTop: `2px solid ${theme.border.primary}`,
          backgroundColor: theme.background.panelHeader,
          flexShrink: 0,
          flexGrow: 0,
          boxSizing: 'border-box',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {(actions.isLoading || generationState.isEstimating || isGraphGenerating) && (
          <>
            <div
              style={{
                width: '100%',
                height: '3px',
                backgroundColor: theme.border.primary,
                borderRadius: '2px',
                overflow: 'hidden',
                marginBottom: '0.5rem',
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
                fontSize: remSize('small'),
                color: theme.text.secondary,
                textAlign: 'center',
                marginBottom: '0.4rem',
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
        {rightPanelTab === 'dialogue' && unityDialogueResponse ? (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              onClick={() => unityDialogueEditorRef.current?.handleSave()}
              disabled={
                !unityDialogueEditorRef.current?.isValid ||
                unityDialogueEditorRef.current?.isSaving ||
                actions.isLoading ||
                isGraphGenerating
              }
              style={{
                flex: 1,
                padding: '0.5rem 0.75rem',
                fontSize: remSize('body'),
                fontWeight: 700,
                backgroundColor: theme.button.primary.background,
                color: theme.button.primary.color,
                border: 'none',
                borderRadius: '6px',
                cursor:
                  unityDialogueEditorRef.current?.isValid &&
                  !unityDialogueEditorRef.current?.isSaving &&
                  !actions.isLoading &&
                  !isGraphGenerating
                    ? 'pointer'
                    : 'not-allowed',
                opacity:
                  unityDialogueEditorRef.current?.isValid &&
                  !unityDialogueEditorRef.current?.isSaving &&
                  !actions.isLoading &&
                  !isGraphGenerating
                    ? 1
                    : 0.6,
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
                padding: '0.5rem',
                fontSize: remSize('body'),
                backgroundColor: theme.button.default.background,
                color: theme.button.default.color,
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '6px',
                cursor: actions.isLoading || isGraphGenerating ? 'not-allowed' : 'pointer',
                opacity: actions.isLoading || isGraphGenerating ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '44px',
                height: '44px',
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
        ) : effectiveRightPanelTab === 'dialogue' || effectiveRightPanelTab === 'prompt' ? (
          <button
            onClick={actions.handleGenerate}
            disabled={actions.isLoading || isGraphGenerating}
            style={{
              width: '100%',
              padding: '0.55rem 0.75rem',
              fontSize: remSize('section'),
              fontWeight: 'bold',
              backgroundColor: theme.button.primary.background,
              color: theme.button.primary.color,
              border: 'none',
              borderRadius: '6px',
              cursor: actions.isLoading || isGraphGenerating ? 'not-allowed' : 'pointer',
              opacity: actions.isLoading || isGraphGenerating ? 0.6 : 1,
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
                fontSize: remSize('caption'),
                opacity: 0.8,
                fontWeight: 'normal',
              }}
            >
              Ctrl+Enter
            </span>
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div
      data-dashboard-shell="true"
      style={{
        height: '100%',
        minHeight: 0,
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
    <ResizablePanels
      key={viewportMode}
      ref={panelsRef}
      storageKey={viewportMode === 'desktop' ? 'dashboard_panels' : undefined}
      defaultSizes={[20, 58, 22]}
      minSizes={
        viewportMode === 'mobile'
          ? [0, 320, 0]
          : viewportMode === 'tablet'
            ? [0, 400, 220]
            : [200, 400, 200]
      }
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
          backgroundColor: theme.background.secondary,
          height: '100%',
          minHeight: 0,
          position: 'relative',
        }}
      >
        {!useNarrowSidePanels && !isLeftPanelCollapsed && (
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
              <div style={{ fontSize: `${panelTitleFontRem}rem`, fontWeight: 700, color: theme.text.primary }}>
                {GDD_CONTEXT_PANEL_TITLE}
              </div>
              <PanelCollapseButton
                direction="left"
                label="Replier"
                onClick={toggleLeftPanel}
                ariaLabel="Replier le panneau gauche"
              />
            </div>
            <ContextSelector onItemSelected={onContextItemSelected} />
          </>
        )}
      </div>

      {/* Panneau central: Génération / Édition avec onglets */}
      <div
        ref={centerColumnRef as unknown as RefObject<HTMLDivElement>}
        style={{
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: theme.background.panel,
          height: '100%',
          position: 'relative',
          minWidth: 0,
          ...centerColumnKeyboardStyle,
        }}
      >
        {/* Rails latéraux — visibles quand un panneau est replié.
            Transparence "très auto" : quasi invisible au repos (17%), pleinement
            visible au hover/focus. Centrés verticalement dans les deux modes. */}
        {showCollapsedLeftAffordance && (
          <PanelExpandButton
            side="left"
            label="GDD"
            onClick={toggleLeftPanel}
            ariaLabel="Déplier le panneau gauche"
          />
        )}
        {showCollapsedRightAffordance && (
          <PanelExpandButton
            side="right"
            label="Détails"
            onClick={toggleRightPanel}
            ariaLabel="Déplier le panneau droit"
          />
        )}
          <Tabs
            variant="segmented"
            tabs={[
              {
                id: 'generation',
              label: '💬 Génération de Dialogues',
              content: (
                <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  <GenerationPanel />
                </div>
              ),
            },
            {
              id: 'edition',
              label: '✏️ Édition de Dialogues',
              content: (
                <div
                  style={{
                    display: 'flex',
                    height: '100%',
                    width: '100%',
                    minWidth: 0,
                    overflow: 'hidden',
                  }}
                >
                  <div style={unityDialogueListColumnStyle}>
                    <UnityDialogueList
                      ref={dialogueListRef}
                      onSelectDialogue={setSelectedDialogue}
                      selectedFilename={selectedDialogue?.filename || null}
                    />
                  </div>
                  <div
                    ref={dialogueEditionWorkspaceRef as unknown as RefObject<HTMLDivElement>}
                    style={unityDialogueWorkspaceColumnStyle}
                  >
                    <DialogueEditionNarrowProvider value={isDialogueEditionNarrow}>
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
                    </DialogueEditionNarrowProvider>
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
          keepAliveTabIds={['graph']}
          style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
          contentStyle={centerPanelTab === 'graph' ? { overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' } : undefined}
        />
      </div>

      {/* Panneau droit: Prompt Estimé / Détails */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: theme.background.secondary,
          height: '100%',
          minHeight: 0,
          maxHeight: '100%',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {useNarrowSidePanels ? (
          <div style={{ flex: 1, minHeight: 0 }} />
        ) : isRightPanelCollapsed ? (
          <div style={{ flex: 1, minHeight: 0 }} />
        ) : (
          <>
        <div
          style={{
            padding: '0.5rem 0.75rem',
            paddingRight: '1.25rem',
            borderBottom: `1px solid ${theme.border.primary}`,
            backgroundColor: theme.background.panelHeader,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            flexShrink: 0,
            minHeight: 40,
            boxSizing: 'border-box',
          }}
        >
          <PanelCollapseButton
            direction="right"
            chevronPosition="right"
            label="Replier"
            onClick={toggleRightPanel}
            ariaLabel="Replier le panneau droit"
          />
          <div
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: 'center',
              fontSize: `${panelTitleFontRem}rem`,
              fontWeight: 700,
              color: theme.text.primary,
            }}
          >
            Détails
          </div>
          {actions.handleGenerate ? (
            <SaveStatusIndicator
              appearance="discreet"
              status={actions.saveStatus}
              lastSavedAt={actions.draftLastSavedAt}
              style={{ flexShrink: 0, maxWidth: 'min(200px, 38vw)' }}
            />
          ) : (
            <span style={{ width: 'min(200px, 38vw)', flexShrink: 0 }} aria-hidden />
          )}
        </div>
        {/* Zone de contenu avec scroll (prend l'espace restant, mais laisse toujours de la place pour le bouton) */}
        <div
          data-testid="right-panel-keyboard-inset"
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative',
            ...shellKeyboardInsetStyle,
          }}
        >
          <Tabs
            variant="segmented"
            tabs={visibleRightPanelTabs}
            activeTabId={effectiveRightPanelTab}
            onTabChange={(tabId) => setRightPanelTab(tabId as 'prompt' | 'dialogue' | 'node' | 'details')}
            style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
            // Important: overflow: 'hidden' pour éviter le double scroll, mais scrollbar-gutter réserve l'espace
            // Le contenu enfant gère son propre scroll avec scrollbar-gutter: stable
            contentStyle={{ overflow: 'hidden', scrollbarGutter: 'stable' }}
          />
        </div>
        {renderRightActionsFooter()}
          </>
        )}
      </div>

      <KeyboardShortcutsHelp
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
      />
    </ResizablePanels>

    {useNarrowSidePanels && !isLeftPanelCollapsed && (
      <NarrowOverlayDrawer
        open
        side="left"
        titleId="dashboard-narrow-gdd-title"
        title={GDD_CONTEXT_PANEL_TITLE}
        closeLabel="Fermer le panneau contexte GDD"
        onClose={() => setIsLeftPanelCollapsed(true)}
        contentBottomInsetPx={keyboardBottomInsetPx}
      >
        <ContextSelector onItemSelected={onContextItemSelected} />
      </NarrowOverlayDrawer>
    )}

    {useNarrowSidePanels && !isRightPanelCollapsed && (
      <NarrowOverlayDrawer
        open
        side="right"
        titleId="dashboard-narrow-details-title"
        title="Détails"
        headerEnd={narrowDetailsHeaderEnd}
        closeLabel="Fermer le panneau détails"
        onClose={() => setIsRightPanelCollapsed(true)}
        contentBottomInsetPx={keyboardBottomInsetPx}
      >
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
            variant="segmented"
            tabs={visibleRightPanelTabs}
            activeTabId={effectiveRightPanelTab}
            onTabChange={(tabId) => setRightPanelTab(tabId as 'prompt' | 'dialogue' | 'node' | 'details')}
            style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
            contentStyle={{ overflow: 'hidden', scrollbarGutter: 'stable' }}
          />
        </div>
        {renderRightActionsFooter()}
      </NarrowOverlayDrawer>
    )}
    </div>
  )
}

