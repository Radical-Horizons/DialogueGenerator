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
} from 'react'
import { ContextSelector } from '../context/ContextSelector'
import { GDD_CONTEXT_PANEL_TITLE } from '../context/constants'
import { GenerationPanel } from '../generation/GenerationPanel'
import { EstimatedPromptPanel } from '../generation/EstimatedPromptPanel'
import { UnityDialogueEditor, type UnityDialogueEditorHandle } from '../generation/UnityDialogueEditor'
import { ReasoningTraceViewer } from '../generation/ReasoningTraceViewer'
import { ContextDetail } from '../context/ContextDetail'
import { ContextSelectionBudgetBar } from '../generation/ContextSelectionBudgetBar'
import { ResizablePanels, type ResizablePanelsRef } from '../shared/ResizablePanels'
import { SaveStatusIndicator } from '../shared/SaveStatusIndicator'
import { Tabs, type Tab } from '../shared/Tabs'
import { type UnityDialogueListRef } from '../unityDialogues/UnityDialogueList'
import { DialogueEditionTabContent } from './DialogueEditionTabContent'
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
  SEGMENTED_CHROME_COMFORT_MIN_WIDTH_PX,
  panelCollapseButtonChrome,
  panelHeaderMonoLabel,
  panelSideHeaderChrome,
} from '../../theme/responsiveChrome'
import { remSize } from '../../theme/uiTypography'
import { NarrowOverlayDrawer } from './NarrowOverlayDrawer'
import type { CharacterResponse, LocationResponse, ItemResponse, SpeciesResponse, CommunityResponse, UnityDialogueMetadata } from '../../types/api'
import { theme } from '../../theme'
import { redesignAccent, redesignFont, redesignHairline, redesignText } from '../../theme/redesignTokens'
import { useUiLayoutStore } from '../../store/uiLayoutStore'

type ContextItem = CharacterResponse | LocationResponse | ItemResponse | SpeciesResponse | CommunityResponse
type ContextLoadState = {
  isLoading: boolean
  error: string | null
  refresh: (() => void) | null
}

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
 * Bouton d'en-tête pour replier un panneau latéral (desktop).
 * Icône chevron seule ; l'intention est portée par `aria-label` / `title`.
 */
function PanelCollapseButton({
  direction,
  chevronPosition,
  onClick,
  ariaLabel,
  density = 'comfortable',
}: {
  direction: 'left' | 'right'
  chevronPosition?: 'left' | 'right'
  onClick: () => void
  ariaLabel: string
  /** Desktop confortable = rail compact ; narrow = cible tactile FR119. */
  density?: 'comfortable' | 'narrow'
}) {
  const collapseChrome = panelCollapseButtonChrome[density]
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
        padding: collapseChrome.padding,
        minHeight: collapseChrome.minHeightPx,
        minWidth: collapseChrome.minWidthPx,
        boxSizing: 'border-box',
        borderRadius: 99,
        border: `1px solid ${borderColor}`,
        backgroundColor: bg,
        color: textColor,
        cursor: 'pointer',
        flexShrink: 0,
        justifyContent: 'center',
        transform: `scale(${scale})`,
        transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: hovered ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
      }}
    >
      {chevronSide === 'left' && chevron}
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
  const [contextLoadState, setContextLoadState] = useState<ContextLoadState>({
    isLoading: false,
    error: null,
    refresh: null,
  })
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false)
  const [rightPanelTab, setRightPanelTab] = useState<'prompt' | 'dialogue' | 'node' | 'details'>('prompt')
  const [centerPanelTab, setCenterPanelTab] = useState<'generation' | 'edition' | 'graph'>('generation')
  const [selectedDialogue, setSelectedDialogue] = useState<UnityDialogueMetadata | null>(null)
  const dialogueListRef = useRef<UnityDialogueListRef>(null)
  const unityDialogueEditorRef = useRef<UnityDialogueEditorHandle>(null)
  const [generatedEditorSaveState, setGeneratedEditorSaveState] = useState({
    isValid: true,
    isSaving: false,
  })
  const { rawPrompt, isEstimating, unityDialogueResponse, setUnityDialogueResponse } = useGenerationStore()
  const generationState = useGenerationStore((state) => ({
    isEstimating: state.isEstimating,
    unityDialogueResponse: state.unityDialogueResponse,
    tokenCount: state.tokenCount,
  }))
  const { actions } = useGenerationActionsStore()

  const { loadDefaultConfig } = useContextConfigStore()
  const commandPalette = useCommandPalette()
  
  // État du graphe pour détecter si un nœud est sélectionné et si une génération est en cours
  const { selectedNodeId, isGenerating: isGraphGenerating, applyUnityDocumentNodes } = useGraphStore()

  const handleGeneratedDialogueContentChange = useCallback(
    (jsonContent: string) => {
      try {
        const parsed: unknown = JSON.parse(jsonContent)
        if (!Array.isArray(parsed)) return
        applyUnityDocumentNodes(parsed)
        const current = useGenerationStore.getState().unityDialogueResponse
        if (current && current.json_content !== jsonContent) {
          setUnityDialogueResponse({ ...current, json_content: jsonContent })
        }
      } catch {
        // Contenu partiellement édité / invalide : ignorer jusqu'à la prochaine saisie valide.
      }
    },
    [applyUnityDocumentNodes, setUnityDialogueResponse],
  )

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
  /** Densité adaptive conservée (FR118 17.6), transposée à l'étiquette mono. */
  const panelHeaderMonoLabelPx = isNarrowCenterColumn
    ? panelHeaderMonoLabel.narrowFontPx
    : panelHeaderMonoLabel.comfortableFontPx
  const panelSideHeaderPadding = isNarrowCenterColumn
    ? panelSideHeaderChrome.narrow.padding
    : panelSideHeaderChrome.comfortable.padding
  const panelCollapseDensity = isNarrowCenterColumn ? 'narrow' : 'comfortable'
  const { ref: generatedResultRef, isNarrow: isNarrowGeneratedResult } = useNarrowInlineSize(420)

  /**
   * Diagnostic du dialogue généré : uniquement des valeurs réellement présentes dans la réponse
   * (compteurs dérivés du JSON, tokens estimés, effort de raisonnement). Rien d'inféré.
   */
  const generatedDialogueDiagnostic = useMemo((): Array<{ label: string; value: string }> => {
    if (!unityDialogueResponse) return []
    const rows: Array<{ label: string; value: string }> = []
    try {
      const parsed: unknown = JSON.parse(unityDialogueResponse.json_content)
      if (Array.isArray(parsed)) {
        rows.push({ label: 'Nœuds', value: String(parsed.length) })
        const choiceCount = parsed.reduce<number>((total, node) => {
          const nodeChoices = (node as { choices?: unknown }).choices
          return total + (Array.isArray(nodeChoices) ? nodeChoices.length : 0)
        }, 0)
        rows.push({ label: 'Choix', value: String(choiceCount) })
      }
    } catch {
      // json_content non parsable : on n'affiche simplement pas les compteurs.
    }
    if (typeof unityDialogueResponse.estimated_tokens === 'number') {
      rows.push({ label: 'Tokens', value: unityDialogueResponse.estimated_tokens.toLocaleString('fr-FR') })
    }
    if (unityDialogueResponse.reasoning_trace?.effort) {
      rows.push({ label: 'Effort', value: String(unityDialogueResponse.reasoning_trace.effort) })
    }
    return rows
  }, [unityDialogueResponse])
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
            isActive={rightPanelTab === 'prompt' && centerPanelTab !== 'graph'}
          />
        </div>
      ),
    },

    {
      id: 'dialogue',
      label: 'Dialogue généré',
      content: (
        <div style={{ flex: 1, minHeight: 0, maxHeight: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
          {unityDialogueResponse ? (
            <div
              ref={generatedResultRef}
              data-testid="generated-dialogue-result"
              style={{
                flex: 1,
                minHeight: 0,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                borderLeft: `2px solid ${redesignAccent.base}`,
                backgroundColor: redesignAccent.selectedBgStrong,
              }}
            >
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: isNarrowGeneratedResult ? 'column' : 'row',
                  overflow: 'hidden',
                }}
              >
                <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  {/* Reasoning Trace (dépliable en haut) */}
                  {unityDialogueResponse.reasoning_trace && (
                    <div style={{ flexShrink: 0, borderBottom: `1px solid ${redesignHairline.standard}` }}>
                      <ReasoningTraceViewer
                        reasoningTrace={unityDialogueResponse.reasoning_trace}
                        isGenerating={false}
                      />
                    </div>
                  )}

                  {/* Contenu du dialogue */}
                  <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                    <UnityDialogueEditor
                      ref={unityDialogueEditorRef}
                      json_content={unityDialogueResponse.json_content}
                      title={unityDialogueResponse.title}
                      hideHeaderSaveButton={true}
                      onContentChange={handleGeneratedDialogueContentChange}
                      onSaveStateChange={setGeneratedEditorSaveState}
                      onSave={() => {
                        dialogueListRef.current?.refresh()
                        setUnityDialogueResponse(null)
                      }}
                    />
                  </div>
                </div>

                {/* Diagnostic : seulement ce que la réponse contient déjà */}
                {generatedDialogueDiagnostic.length > 0 && (
                  <aside
                    data-testid="generated-dialogue-diagnostic"
                    style={{
                      flexShrink: 0,
                      width: isNarrowGeneratedResult ? 'auto' : '132px',
                      display: 'flex',
                      flexDirection: isNarrowGeneratedResult ? 'row' : 'column',
                      flexWrap: isNarrowGeneratedResult ? 'wrap' : 'nowrap',
                      gap: isNarrowGeneratedResult ? '0.9rem' : '0.65rem',
                      padding: '0.65rem 0.75rem',
                      borderLeft: isNarrowGeneratedResult ? 'none' : `1px solid ${redesignHairline.standard}`,
                      borderTop: isNarrowGeneratedResult ? `1px solid ${redesignHairline.standard}` : 'none',
                      overflowY: isNarrowGeneratedResult ? 'visible' : 'auto',
                    }}
                  >
                    {generatedDialogueDiagnostic.map((row) => (
                      <div key={row.label} style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontFamily: redesignFont.mono,
                            fontSize: remSize('caption'),
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: theme.text.tertiary,
                          }}
                        >
                          {row.label}
                        </div>
                        <div
                          style={{
                            fontFamily: redesignFont.mono,
                            fontSize: remSize('body'),
                            color: theme.text.primary,
                          }}
                        >
                          {row.value}
                        </div>
                      </div>
                    ))}
                  </aside>
                )}
              </div>

              {/* Action unique du résultat */}
              <div
                style={{
                  flexShrink: 0,
                  padding: '0.6rem 0.75rem',
                  borderTop: `1px solid ${redesignHairline.standard}`,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    void unityDialogueEditorRef.current?.handleSave()
                  }}
                  disabled={
                    !generatedEditorSaveState.isValid ||
                    generatedEditorSaveState.isSaving ||
                    actions.isLoading ||
                    isGraphGenerating
                  }
                  style={{
                    width: '100%',
                    minHeight: '44px',
                    padding: '0.5rem 0.75rem',
                    fontSize: remSize('body'),
                    fontWeight: 700,
                    backgroundColor: redesignAccent.base,
                    color: theme.button.primary.color,
                    border: 'none',
                    borderRadius: '6px',
                    cursor:
                      generatedEditorSaveState.isValid &&
                      !generatedEditorSaveState.isSaving &&
                      !actions.isLoading &&
                      !isGraphGenerating
                        ? 'pointer'
                        : 'not-allowed',
                    opacity:
                      generatedEditorSaveState.isValid &&
                      !generatedEditorSaveState.isSaving &&
                      !actions.isLoading &&
                      !isGraphGenerating
                        ? 1
                        : 0.6,
                    boxSizing: 'border-box',
                  }}
                  title="Garder et continuer (Ctrl+S)"
                >
                  {generatedEditorSaveState.isSaving ? 'Sauvegarde...' : 'Garder et continuer'}
                </button>
              </div>
            </div>
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
  ], [unityDialogueResponse, rawPrompt, isEstimating, rightPanelTab, centerPanelTab, selectedContextItem, selectedContextHistoryStem, actions.isLoading, generationState.isEstimating, isGraphGenerating, setUnityDialogueResponse, handleGeneratedDialogueContentChange, generatedDialogueDiagnostic, generatedEditorSaveState, generatedResultRef, isNarrowGeneratedResult])

  // En mode éditeur de graphe : masquer "Prompt". Hors graphe : masquer "Édition de nœud".
  const visibleRightPanelTabs = useMemo(() => {
    if (centerPanelTab === 'graph') {
      // Écran 2e : la colonne droite du graphe, c'est l'inspecteur de GraphEditor.
      // L'édition de nœud y a migré (onglet NŒUD) — ne pas la dupliquer ici.
      return rightPanelTabs.filter((t) => t.id !== 'prompt' && t.id !== 'node')
    }
    if (centerPanelTab === 'generation' || centerPanelTab === 'edition') {
      return rightPanelTabs.filter((t) => t.id !== 'node')
    }
    return rightPanelTabs
  }, [centerPanelTab, rightPanelTabs])

  // Onglet actif affiché : ne jamais rester sur un onglet caché pour le panneau central actuel
  const effectiveRightPanelTab =
    centerPanelTab === 'graph' && rightPanelTab === 'prompt'
      ? 'node'
      : (centerPanelTab === 'generation' || centerPanelTab === 'edition') && rightPanelTab === 'node'
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
    } else if ((centerPanelTab === 'generation' || centerPanelTab === 'edition') && rightPanelTab === 'node') {
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

  // ── Mode écriture (écran 2c) ──────────────────────────────────────────────
  // Ctrl+\ (ou ⌘\) bascule : les deux panneaux se replient, la colonne passe à 760px.
  // Rien n'est supprimé : les rails restent cliquables, sortir restaure l'état d'avant.
  const writingMode = useUiLayoutStore((s) => s.writingMode)
  const panelsBeforeWritingRef = useRef<{ left: boolean; right: boolean } | null>(null)
  const collapsedStateRef = useRef({ left: isLeftPanelCollapsed, right: isRightPanelCollapsed })
  collapsedStateRef.current = { left: isLeftPanelCollapsed, right: isRightPanelCollapsed }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '\\' || e.code === 'Backslash')) {
        e.preventDefault()
        useUiLayoutStore.getState().toggleWritingMode()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (writingMode) {
      panelsBeforeWritingRef.current = { ...collapsedStateRef.current }
      if (!expandedSizesRef.current && panelsRef.current) {
        expandedSizesRef.current = panelsRef.current.getSizes()
      }
      setIsLeftPanelCollapsed(true)
      setIsRightPanelCollapsed(true)
      applyCollapsedLayout(true, true)
    } else if (panelsBeforeWritingRef.current) {
      const prev = panelsBeforeWritingRef.current
      panelsBeforeWritingRef.current = null
      setIsLeftPanelCollapsed(prev.left)
      setIsRightPanelCollapsed(prev.right)
      applyCollapsedLayout(prev.left, prev.right)
    }
  }, [writingMode, applyCollapsedLayout])



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

  const onContextLoadStateChange = useCallback((state: ContextLoadState) => {
    setContextLoadState(state)
  }, [])

  const narrowDetailsHeaderEnd =
    actions.handleGenerate ? (
      <SaveStatusIndicator
        appearance="discreet"
        status={actions.saveStatus}
        lastSavedAt={actions.draftLastSavedAt}
        style={{ flexShrink: 0, maxWidth: 'min(200px, 38vw)' }}
      />
    ) : null

  /**
   * Bloc « Dernier résultat » en pied de colonne droite (écran 1c).
   * Il ne remplace pas l'onglet « Dialogue généré » : il en est le point d'entrée
   * permanent, avec la phrase d'état vide exigée par le handoff.
   */
  const renderLastResultBlock = (): ReactNode => (
    <div
      data-testid="last-result-block"
      style={{
        flexShrink: 0,
        borderTop: `1px solid ${redesignHairline.standard}`,
        padding: '15px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <span
        style={{
          fontFamily: redesignFont.mono,
          fontSize: '10px',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: redesignText.label,
        }}
      >
        Dernier résultat
      </span>
      {unityDialogueResponse ? (
        <button
          type="button"
          onClick={() => setRightPanelTab('dialogue')}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            textAlign: 'left',
            cursor: 'pointer',
            fontSize: '12.5px',
            lineHeight: 1.5,
            color: redesignAccent.light,
          }}
        >
          {unityDialogueResponse.title ?? 'Dialogue généré'} — ouvrir
        </button>
      ) : (
        <span style={{ fontSize: '12.5px', lineHeight: 1.5, color: redesignText.muted }}>
          Rien pour cette scène. Le dialogue généré s&apos;ouvre ici, éditable, avec sa trace de
          raisonnement.
        </span>
      )}
    </div>
  )

  /** Barre d’actions bas du panneau droit (Prompt / Dialogue) — desktop et drawer narrow. */
  const renderRightActionsFooter = (): ReactNode => {
    if (
      !actions.handleGenerate ||
      (effectiveRightPanelTab !== 'prompt' && effectiveRightPanelTab !== 'dialogue')
    ) {
      return null
    }
    const contextRefresh = contextLoadState.refresh
    const hasContextLoadError = contextLoadState.error !== null
    const isGenerateActionBlocked =
      actions.isLoading ||
      isGraphGenerating ||
      contextLoadState.isLoading ||
      generationState.isEstimating
    const isRefreshActionDisabled = contextLoadState.isLoading || !contextRefresh
    const primaryActionLabel = hasContextLoadError ? 'Rafraîchir le contexte' : 'Générer le dialogue'
    const primaryActionTitle = hasContextLoadError
      ? 'Rafraîchir le contexte GDD'
      : 'Générer (Ctrl+Enter)'
    const handlePrimaryGenerateAction = hasContextLoadError
      ? contextRefresh ?? undefined
      : actions.handleGenerate
    const isPrimaryGenerateDisabled = hasContextLoadError
      ? isRefreshActionDisabled
      : isGenerateActionBlocked
    // Écran 1c : l'action primaire vit en bas de la colonne de lecture. On ne garde ce
    // bouton que là où cette colonne n'est pas visible (tiroir narrow) ou quand il porte
    // le repli « Rafraîchir le contexte » après un échec de chargement GDD.
    const showFooterPrimaryAction = useNarrowSidePanels || hasContextLoadError

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
        {(actions.isLoading || generationState.isEstimating || isGraphGenerating || contextLoadState.isLoading) && (
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
              {contextLoadState.isLoading && !actions.isLoading && !generationState.isEstimating && !isGraphGenerating
                ? 'Chargement du contexte...'
                : isGraphGenerating
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
        {/* Le résultat généré porte lui-même son action « Garder et continuer » (onglet Dialogue généré). */}
        {showFooterPrimaryAction ? (
          <>
            <button
              onClick={handlePrimaryGenerateAction}
              disabled={isPrimaryGenerateDisabled}
              style={{
                width: '100%',
                height: 46,
                padding: '0 0.75rem',
                fontSize: remSize('section'),
                fontWeight: 'bold',
                backgroundColor: redesignAccent.base,
                color: theme.button.primary.color,
                border: 'none',
                borderRadius: 6,
                cursor: isPrimaryGenerateDisabled ? 'not-allowed' : 'pointer',
                opacity: isPrimaryGenerateDisabled ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                boxSizing: 'border-box',
              }}
              title={primaryActionTitle}
            >
              <span>{primaryActionLabel}</span>
              {!hasContextLoadError && (
                <span
                  style={{
                    fontFamily: redesignFont.mono,
                    fontSize: remSize('caption'),
                    opacity: 0.8,
                    fontWeight: 'normal',
                  }}
                >
                  CTRL+&#9166;
                </span>
              )}
            </button>
          </>
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
                padding: panelSideHeaderPadding,
                borderBottom: `1px solid ${theme.border.primary}`,
                backgroundColor: theme.background.panelHeader,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.5rem',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  fontFamily: redesignFont.mono,
                  fontSize: `${panelHeaderMonoLabelPx}px`,
                  letterSpacing: '0.09em',
                  textTransform: 'uppercase',
                  color: redesignText.label,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {GDD_CONTEXT_PANEL_TITLE}
              </div>
              <PanelCollapseButton
                direction="left"
                onClick={toggleLeftPanel}
                ariaLabel="Replier le panneau gauche"
                density={panelCollapseDensity}
              />
            </div>
            <ContextSelector
              onItemSelected={onContextItemSelected}
              onLoadStateChange={onContextLoadStateChange}
            />
          </>
        )}
      </div>

      {/* Panneau central: Génération / Édition avec onglets */}
      <div
        ref={centerColumnRef}
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
            variant="nav"
            tabs={[
              {
                id: 'generation',
              label: 'Générer',
              content: (
                <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  <GenerationPanel />
                </div>
              ),
            },
            {
              id: 'edition',
              label: 'Éditer',
              content: (
                <DialogueEditionTabContent
                  selectedDialogue={selectedDialogue}
                  setSelectedDialogue={setSelectedDialogue}
                  dialogueListRef={dialogueListRef}
                  onGenerateContinuation={() => {
                    setCenterPanelTab('generation')
                  }}
                />
              ),
            },
            {
              id: 'graph',
              label: 'Graphe',
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
            padding: panelSideHeaderPadding,
            paddingRight: '1.25rem',
            borderBottom: `1px solid ${theme.border.primary}`,
            backgroundColor: theme.background.panelHeader,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            flexShrink: 0,
            boxSizing: 'border-box',
          }}
        >
          <PanelCollapseButton
            direction="right"
            chevronPosition="right"
            onClick={toggleRightPanel}
            ariaLabel="Replier le panneau droit"
            density={panelCollapseDensity}
          />
          <div
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: 'left',
              fontFamily: redesignFont.mono,
              fontSize: '10px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: redesignText.label,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            Ce qui part au modèle
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
          <ContextSelectionBudgetBar
            visible={centerPanelTab === 'generation' || centerPanelTab === 'edition'}
          />
          <Tabs
            variant="nav"
            tabs={visibleRightPanelTabs}
            activeTabId={effectiveRightPanelTab}
            onTabChange={(tabId) => setRightPanelTab(tabId as 'prompt' | 'dialogue' | 'node' | 'details')}
            style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
            // Important: overflow: 'hidden' pour éviter le double scroll, mais scrollbar-gutter réserve l'espace
            // Le contenu enfant gère son propre scroll avec scrollbar-gutter: stable
            contentStyle={{ overflow: 'hidden', scrollbarGutter: 'stable' }}
          />
        </div>
        {renderLastResultBlock()}
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
        <ContextSelector
          onItemSelected={onContextItemSelected}
          onLoadStateChange={onContextLoadStateChange}
        />
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
          <ContextSelectionBudgetBar
            visible={centerPanelTab === 'generation' || centerPanelTab === 'edition'}
          />
          <Tabs
            variant="nav"
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

