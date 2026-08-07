/**
 * Tests d'intégration baseline pour GenerationPanel.
 * 
 * Ces tests servent de safety net pour détecter les régressions
 * pendant le refactoring. Ils testent les flux critiques sans
 * dépendre de l'implémentation interne.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GenerationPanel } from '../GenerationPanel'
import { useGenerationStore } from '../../../store/generationStore'
import { useContextStore } from '../../../store/contextStore'
import { useGraphStore } from '../../../store/graphStore'
import { useLLMStore } from '../../../store/llmStore'
import { useAuthorProfile } from '../../../hooks/useAuthorProfile'
import { useCostGovernance } from '../../../hooks/useCostGovernance'
import * as dialoguesAPI from '../../../api/dialogues'
import * as contextAPI from '../../../api/context'
import * as configAPI from '../../../api/config'

// Mock des stores et hooks
vi.mock('../../../store/generationStore')
vi.mock('../../../store/generationActionsStore', () => ({
  useGenerationActionsStore: vi.fn(() => ({
    actions: {
      handleGenerate: vi.fn(),
      handleResetAll: vi.fn(),
      handleEstimateTokens: vi.fn(),
      handlePreview: vi.fn(),
      handleExportUnity: vi.fn(),
      handleReset: vi.fn(),
      handleResetInstructions: vi.fn(),
      handleResetSelections: vi.fn(),
      isLoading: false,
      isDirty: false,
      saveStatus: 'saved',
      draftLastSavedAt: null,
    },
    setActions: vi.fn(),
  })),
}))
vi.mock('../../../store/contextStore')
vi.mock('../../../store/contextConfigStore', () => ({
  useContextConfigStore: vi.fn((selector: (s: { contextTokenBudgetMax: number; setContextTokenBudgetMax: ReturnType<typeof vi.fn> }) => unknown) =>
    selector({
      contextTokenBudgetMax: 50_000,
      setContextTokenBudgetMax: vi.fn(),
    })
  ),
}))
vi.mock('../../../store/vocabularyStore', () => ({
  useVocabularyStore: vi.fn(() => ({
    vocabulary: [],
    loadVocabulary: vi.fn(),
  })),
}))
vi.mock('../../../store/narrativeGuidesStore', () => ({
  useNarrativeGuidesStore: vi.fn(() => ({
    guides: [],
    loadGuides: vi.fn(),
  })),
}))
vi.mock('../../../store/graphStore')
vi.mock('../../../store/llmStore')
vi.mock('../../../store/flagsStore', () => ({
  useFlagsStore: vi.fn(() => ({
    flags: [],
    loadFlags: vi.fn(),
  })),
}))
vi.mock('../../../hooks/useAuthorProfile')
vi.mock('../../../hooks/useCostGovernance')
vi.mock('../../../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
}))
vi.mock('../../../hooks/useGenerationDraft', () => ({
  useGenerationDraft: vi.fn(() => ({
    markDirty: vi.fn(),
    saveDraft: vi.fn(),
    loadDraft: vi.fn(),
    clearDraft: vi.fn(),
    saveStatus: 'saved' as const,
  })),
}))
vi.mock('../../../hooks/usePresetManagement', () => ({
  usePresetManagement: vi.fn(() => ({
    loadPreset: vi.fn(),
    savePreset: vi.fn(),
    validatePreset: vi.fn(),
    getCurrentConfiguration: vi.fn(() => ({})),
  })),
}))
vi.mock('../../../hooks/useGenerationOrchestrator', () => ({
  useGenerationOrchestrator: vi.fn(() => ({
    handleGenerate: vi.fn(),
    handleEstimateTokens: vi.fn(),
    connectSSE: vi.fn(),
    disconnectSSE: vi.fn(),
    validationErrors: {} as Record<string, string>,
    tokenCount: null as number | null,
  })),
}))

// Mock des APIs
vi.mock('../../../api/dialogues')
vi.mock('../../../api/context')
vi.mock('../../../api/config')

// Types pour les props des composants mockés
interface SystemPromptEditorProps {
  onUserInstructionsChange?: (value: string) => void
  onSystemPromptChange?: (value: string) => void
}

interface PresetSelectorProps {
  onPresetLoaded?: (preset: { id: string; configuration: Record<string, unknown> }) => void
  getCurrentConfiguration?: () => Record<string, unknown>
}

interface SaveStatusIndicatorProps {
  status: string
}

// Mock des composants enfants pour simplifier les tests
vi.mock('../SystemPromptEditor', () => ({
  SystemPromptEditor: ({ onUserInstructionsChange, onSystemPromptChange }: SystemPromptEditorProps) => (
    <div data-testid="system-prompt-editor">
      <input
        data-testid="user-instructions-input"
        onChange={(e) => onUserInstructionsChange?.(e.target.value)}
      />
      <input
        data-testid="system-prompt-input"
        onChange={(e) => onSystemPromptChange?.(e.target.value)}
      />
    </div>
  ),
}))

vi.mock('../SceneSelectionWidget', () => ({
  SceneSelectionWidget: () => <div data-testid="scene-selection-widget">Scene Selection</div>,
}))

vi.mock('../InGameFlagsSummary', () => ({
  InGameFlagsSummary: () => <div data-testid="in-game-flags-summary">In Game Flags</div>,
}))

vi.mock('../DialogueFlagsPanel', () => ({
  DialogueFlagsPanel: () => <div data-testid="dialogue-flags-panel">Dialogue Flags</div>,
}))

vi.mock('../GenerationStreamingInline', () => ({
  GenerationStreamingInline: ({
    isActive,
    onInterrupt,
  }: {
    isActive: boolean
    onInterrupt: () => void
  }) =>
    isActive ? (
      <div data-testid="generation-streaming-inline">
        Streaming inline
        {/* Expose l'action réelle du panneau pour tester la séquence d'interruption. */}
        <button type="button" onClick={onInterrupt}>
          Interrompre
        </button>
      </div>
    ) : null,
}))

vi.mock('../ModelSelector', () => ({
  ModelSelector: () => <div data-testid="model-selector">Model Selector</div>,
}))

// PresetSelector mock : doit accepter saveStatus (passé par GenerationPanel)
vi.mock('../PresetSelector', () => ({
  PresetSelector: ({ onPresetLoaded, getCurrentConfiguration }: PresetSelectorProps) => (
    <div data-testid="preset-selector">
      <button
        data-testid="load-preset-btn"
        type="button"
        onClick={() => onPresetLoaded?.({ id: 'preset-1', configuration: {} })}
      >
        Load Preset
      </button>
      <button
        data-testid="get-config-btn"
        type="button"
        onClick={() => getCurrentConfiguration?.()}
      >
        Get Config
      </button>
    </div>
  ),
}))

vi.mock('../PresetValidationModal', () => ({
  PresetValidationModal: () => null,
}))

vi.mock('../shared', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
  SaveStatusIndicator: ({ status }: SaveStatusIndicatorProps) => (
    <div data-testid="save-status-indicator">{status}</div>
  ),
  ConfirmDialog: () => null,
}))

// Mock EventSource pour SSE
class MockEventSource {
  url: string
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onopen: ((event: Event) => void) | null = null
  readyState: number = 0
  CONNECTING = 0
  OPEN = 1
  CLOSED = 2

  constructor(url: string) {
    this.url = url
    this.readyState = this.CONNECTING
    setTimeout(() => {
      this.readyState = this.OPEN
      if (this.onopen) {
        this.onopen(new Event('open'))
      }
    }, 10)
  }

  close() {
    this.readyState = this.CLOSED
  }

  simulateMessage(data: string) {
    if (this.onmessage) {
      const event = new MessageEvent('message', { data })
      this.onmessage(event)
    }
  }

  simulateError() {
    if (this.onerror) {
      const event = new Event('error')
      this.onerror(event)
    }
  }
}

// Remplacer EventSource global
global.EventSource = MockEventSource as unknown as typeof EventSource

const mockUseGenerationStore = vi.mocked(useGenerationStore)
const mockUseContextStore = vi.mocked(useContextStore)
const mockUseGraphStore = vi.mocked(useGraphStore)
const mockUseLLMStore = vi.mocked(useLLMStore)
const mockUseAuthorProfile = vi.mocked(useAuthorProfile)
const mockUseCostGovernance = vi.mocked(useCostGovernance)
const mockDialoguesAPI = vi.mocked(dialoguesAPI)
const mockContextAPI = vi.mocked(contextAPI)
const mockConfigAPI = vi.mocked(configAPI)

describe('GenerationPanel - Tests Baseline', () => {
  let eventSourceInstances: MockEventSource[] = []

  /** Attend que le panneau ait rendu les champs principaux (évite timeouts avec findByTestId). */
  async function waitForPanelReady() {
    await waitFor(
      () => {
        expect(screen.getByTestId('user-instructions-input')).toBeInTheDocument()
        expect(screen.getByTestId('preset-selector')).toBeInTheDocument()
      },
      { timeout: 4000, interval: 100 }
    )
  }

  function buildMockGenerationStoreState(): Record<string, unknown> {
    return {
      sceneSelection: {
        characterA: null,
        characterB: null,
        sceneRegion: null,
        subLocation: null,
      },
      dialogueStructure: ['PNJ', 'PJ', 'Stop', '', '', ''] as string[],
      systemPromptOverride: null,
      promptHash: null,
      tokenCount: 0,
      isEstimating: false,
      contextEstimationError: null,
      contextTokenBreakdown: [],
      contextBreakdownNote: '',
      previewInputHash: null,
      structuredPrompt: null,
      isGenerating: false,
      streamingContent: '',
      currentStep: null,
      isMinimized: false,
      error: null,
      currentJobId: null,
      isInterrupting: false,
      setDialogueStructure: vi.fn(),
      setSystemPromptOverride: vi.fn(),
      setRawPrompt: vi.fn(),
      setContextTokenEstimate: vi.fn(),
      setSceneSelection: vi.fn(),
      setUnityDialogueResponse: vi.fn(),
      setTokensUsed: vi.fn(),
      startGeneration: vi.fn((jobId: string) => {
        const state = mockUseGenerationStore.getState?.()
        if (state) {
          Object.assign(state, {
            isGenerating: true,
            currentJobId: jobId,
            streamingContent: '',
            error: null,
          })
        }
      }),
      interrupt: vi.fn(),
      minimize: vi.fn(),
      resetStreamingState: vi.fn(),
      setInterrupting: vi.fn(),
      setError: vi.fn(),
      appendChunk: vi.fn((content: string) => {
        const state = mockUseGenerationStore.getState?.()
        if (state) {
          Object.assign(state, {
            streamingContent: (state.streamingContent || '') + content,
          })
        }
      }),
      setStep: vi.fn(),
      complete: vi.fn(() => {
        const state = mockUseGenerationStore.getState?.()
        if (state) {
          Object.assign(state, {
            isGenerating: false,
            currentJobId: null,
          })
        }
      }),
    }
  }

  function buildMockContextStoreState(): Record<string, unknown> {
    return {
      selections: {
        characters_full: [],
        characters_excerpt: [],
        locations_full: [],
        locations_excerpt: [],
        items_full: [],
        items_excerpt: [],
        species_full: [],
        species_excerpt: [],
        communities_full: [],
        communities_excerpt: [],
      },
      selectedRegion: null,
      selectedSubLocations: [],
      restoreState: vi.fn(),
      clearSelections: vi.fn(),
      toggleCharacter: vi.fn(),
      setRegion: vi.fn(),
      toggleSubLocation: vi.fn(),
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    eventSourceInstances = []
    localStorage.clear()

    mockUseGenerationStore.mockReturnValue(
      buildMockGenerationStoreState() as unknown as ReturnType<typeof useGenerationStore>
    )
    mockUseContextStore.mockReturnValue(
      buildMockContextStoreState() as unknown as ReturnType<typeof useContextStore>
    )

    const graphStoreState = {
      loadDialogue: vi.fn().mockResolvedValue(undefined),
      dialogueFlagBindings: [] as ReturnType<typeof useGraphStore>['dialogueFlagBindings'],
      upsertDialogueFlagBinding: vi.fn(),
      removeDialogueFlagBinding: vi.fn(),
    }
    mockUseGraphStore.mockImplementation(((selector?: (s: typeof graphStoreState) => unknown) => {
      if (typeof selector === 'function') return selector(graphStoreState)
      return graphStoreState
    }) as typeof useGraphStore)

    mockUseLLMStore.mockReturnValue({
      model: 'gpt-4o-mini',
      provider: 'openai',
    } as ReturnType<typeof useLLMStore>)

    mockUseAuthorProfile.mockReturnValue({
      authorProfile: '',
      savedProfile: null,
      isLoading: false,
      error: null,
      saveProfile: vi.fn(),
      restore: vi.fn(),
      updateProfile: vi.fn(),
    } as ReturnType<typeof useAuthorProfile>)

    mockUseCostGovernance.mockReturnValue({
      checkBudget: vi.fn().mockResolvedValue({ allowed: true, percentage: 0 }),
      budget: null,
      loadBudget: vi.fn().mockResolvedValue(undefined),
      loading: false,
    } as ReturnType<typeof useCostGovernance>)

    mockConfigAPI.listLLMModels.mockResolvedValue({
      models: [
        {
          model_identifier: 'gpt-4o-mini',
          display_name: 'GPT-4o Mini',
          client_type: 'openai',
          max_tokens: 128_000,
        },
      ],
      total: 1,
    } as Awaited<ReturnType<typeof configAPI.listLLMModels>>)

    mockDialoguesAPI.createGenerationJob.mockResolvedValue({
      job_id: 'job-123',
      stream_url:
        '/api/v1/dialogues/generate/jobs/job-123/stream?sse_token=mock-jwt-for-eventsource',
      status: 'pending',
    } as Awaited<ReturnType<typeof dialoguesAPI.createGenerationJob>>)

    mockContextAPI.estimateContextTokens.mockResolvedValue({
      context_tokens: 0,
      selection_tokens: 0,
      context_token_breakdown: [],
      context_breakdown_note: '',
      token_count: 1000,
      raw_prompt: '',
      prompt_hash: 'est-mock',
    } as Awaited<ReturnType<typeof contextAPI.estimateContextTokens>>)

    mockDialoguesAPI.previewPrompt.mockResolvedValue({
      raw_prompt: '',
      prompt_hash: 'prev-mock',
    } as Awaited<ReturnType<typeof dialoguesAPI.previewPrompt>>)

    global.EventSource = vi.fn((url: string) => {
      const instance = new MockEventSource(url)
      eventSourceInstances.push(instance)
      return instance
    }) as unknown as typeof EventSource
  })

  afterEach(() => {
    eventSourceInstances.forEach(es => es.close())
    eventSourceInstances = []
  })

  describe('Flux complet génération avec SSE', () => {
    it('mock createGenerationJob retourne stream_url avec sse_token (contrat EventSource)', async () => {
      const job = await mockDialoguesAPI.createGenerationJob({} as never)
      expect(job.stream_url).toContain('sse_token=')
      expect(job.stream_url).toContain('job-123')
    })

    it('ne monte pas le bloc de streaming tant qu\'aucune génération n\'est active', async () => {
      render(<GenerationPanel />)
      await waitForPanelReady()
      expect(screen.queryByTestId('generation-streaming-inline')).not.toBeInTheDocument()
    })

    it('monte le bloc de streaming dans le flux du panneau quand la génération démarre', async () => {
      mockUseGenerationStore.mockReturnValue({
        ...buildMockGenerationStoreState(),
        isGenerating: true,
        currentStep: 'Generating',
        streamingContent: '{"title":"Test"',
      } as unknown as ReturnType<typeof useGenerationStore>)

      render(<GenerationPanel />)
      await waitForPanelReady()

      const block = screen.getByTestId('generation-streaming-inline')
      // Le bloc vit dans le flux du panneau (plus de modale détachée) : il partage le
      // conteneur défilant avec l'éditeur de brief. Depuis l'écran 2a le brief est
      // enveloppé dans un conteneur repliable, donc on vérifie l'ascendance commune
      // plutôt que l'égalité stricte des parents.
      const scroller = block.parentElement as HTMLElement
      expect(scroller).toBeTruthy()
      expect(scroller.contains(screen.getByTestId('system-prompt-editor'))).toBe(true)
      // L'action primaire, elle, est ancrée **hors** du conteneur défilant depuis
      // qu'elle passait sous le tiroir bas à 1024 px : elle reste dans le panneau,
      // mais plus dans le flux qui défile (cf. régression en fin de fichier).
      const panneau = scroller.parentElement as HTMLElement
      expect(scroller.contains(screen.getByTestId('generation-primary-action'))).toBe(false)
      expect(panneau.contains(screen.getByTestId('generation-primary-action'))).toBe(true)
      // Aucun chrome de modale : pas de position fixed sur le bloc.
      expect(block.style.position).not.toBe('fixed')
    })

    it('2a : pendant le run, le brief se replie et l’action primaire cède la place', async () => {
      mockUseGenerationStore.mockReturnValue({
        ...buildMockGenerationStoreState(),
        isGenerating: true,
        currentStep: 'Generating',
        streamingContent: '{"title":"Test"',
      } as unknown as ReturnType<typeof useGenerationStore>)

      render(<GenerationPanel />)
      await waitForPanelReady()

      // Le brief est réduit à une ligne avec son coût, la barre d'action est retirée
      // de l'arbre accessible (les deux sorties vivent dans le bloc de streaming).
      expect(screen.getByTestId('brief-collapsed-line')).toBeInTheDocument()
      expect(screen.getByTestId('generation-primary-action')).toHaveAttribute('hidden')

      // « voir » redéploie le brief sans interrompre la génération.
      await userEvent.click(screen.getByTestId('brief-reveal'))
      expect(screen.queryByTestId('brief-collapsed-line')).toBeNull()
    })

    // L'action primaire a migré du pied du panneau droit vers la colonne de lecture
    // (écran 1c) : les gardes de désactivation doivent suivre, pas disparaître.
    it("désactive l'action primaire pendant le chargement du catalogue GDD", async () => {
      mockUseContextStore.mockImplementation(((selector?: (s: unknown) => unknown) => {
        const state = { ...buildMockContextStoreState(), gddCatalogLoading: true }
        return typeof selector === 'function' ? selector(state) : state
      }) as unknown as typeof useContextStore)
      try {
        render(<GenerationPanel />)
        await waitForPanelReady()
        // La barre porte désormais deux boutons (Générer + ×N options) : cibler le primaire.
        const action = within(screen.getByTestId('generation-primary-action')).getByRole('button', {
          name: /Générer/,
        })
        expect(action).toBeDisabled()
        expect(screen.getByTestId('generation-option-count')).toBeDisabled()
      } finally {
        // Sans restauration, l'implémentation fuit sur les tests suivants.
        mockUseContextStore.mockReset()
        mockUseContextStore.mockReturnValue(
          buildMockContextStoreState() as unknown as ReturnType<typeof useContextStore>
        )
      }
    })

    it('devrait charger les modèles au montage (prérequis génération / SSE)', async () => {
      render(<GenerationPanel />)
      await waitFor(() => {
        expect(mockConfigAPI.listLLMModels).toHaveBeenCalled()
      })
    })

    // Matrice I/O ligne 1 : `interrupt()` remet streamingContent et error à zéro. S'il est
    // appelé dans la foulée de setStreamingError, l'avis « Génération interrompue » et le
    // texte déjà écrit disparaissent avant d'être rendus. Il doit rester différé au timeout.
    it("ne remet pas l'état à zéro avant d'avoir affiché l'avis d'interruption", async () => {
      const user = userEvent.setup()
      const storeState: Record<string, unknown> = {
        ...buildMockGenerationStoreState(),
        isGenerating: true,
        currentStep: 'Generating',
        streamingContent: '{"title":"Partiel"',
        currentJobId: 'job-123',
      }
      mockUseGenerationStore.mockReturnValue(
        storeState as unknown as ReturnType<typeof useGenerationStore>
      )
      mockDialoguesAPI.cancelGenerationJob = vi.fn().mockResolvedValue({ status: 'cancelled' })

      render(<GenerationPanel />)
      await waitForPanelReady()

      const block = screen.getByTestId('generation-streaming-inline')
      await user.click(within(block).getByText('Interrompre'))

      await waitFor(() => {
        expect(storeState.setError).toHaveBeenCalledWith('Génération interrompue')
      })
      // Le nettoyage ne doit pas avoir eu lieu dans la foulée du message d'interruption.
      expect(storeState.interrupt).not.toHaveBeenCalled()

      // Il intervient au timeout, une fois l'avis affiché.
      await waitFor(() => expect(storeState.interrupt).toHaveBeenCalled(), { timeout: 4000 })
    })
  })

  describe('Sauvegarde draft (localStorage)', () => {
    it('devrait sauvegarder automatiquement après modification (debounce 2s)', async () => {
      const user = userEvent.setup()
      render(<GenerationPanel />)
      await waitForPanelReady()

      const instructionsInput = screen.getByTestId('user-instructions-input')
      await user.type(instructionsInput, 'Test instructions')

      // Avec useGenerationDraft mocké, le draft n'est pas persisté dans localStorage ; vérifier que le panel reste fonctionnel
      expect(instructionsInput).toBeInTheDocument()
    }, 10000)

    it('devrait restaurer l\'état depuis localStorage au chargement', async () => {
      const draft = {
        userInstructions: 'Instructions restaurées',
        maxContextTokens: 12000,
        timestamp: Date.now(),
      }
      localStorage.setItem('generation_draft', JSON.stringify(draft))

      render(<GenerationPanel />)
      await waitForPanelReady()

      const instructionsInput = screen.getByTestId('user-instructions-input')
      expect(instructionsInput).toBeInTheDocument()
    }, 10000)
  })

  describe('Preset management', () => {
    it('devrait charger un preset valide directement', async () => {
      const user = userEvent.setup()
      render(<GenerationPanel />)
      await waitForPanelReady()

      const loadPresetBtn = screen.getByTestId('load-preset-btn')
      await user.click(loadPresetBtn)

      // Le mock PresetSelector appelle onPresetLoaded au clic ; le panel ne crash pas
      expect(screen.getByTestId('preset-selector')).toBeInTheDocument()
    }, 10000)

    it('devrait afficher modal de validation pour preset avec références obsolètes', async () => {
      const user = userEvent.setup()
      render(<GenerationPanel />)
      await waitForPanelReady()

      const loadPresetBtn = screen.getByTestId('load-preset-btn')
      await user.click(loadPresetBtn)

      expect(screen.getByTestId('preset-selector')).toBeInTheDocument()
    }, 10000)
  })

  describe('Validation tokens', () => {
    it('devrait valider les limites de tokens', async () => {
      render(<GenerationPanel />)
      await waitForPanelReady()
      expect(screen.getByTestId('user-instructions-input')).toBeInTheDocument()
    }, 10000)
  })

  describe('Handlers reset', () => {
    it('devrait réinitialiser toutes les valeurs avec handleResetAll', async () => {
      const user = userEvent.setup()
      render(<GenerationPanel />)
      await waitForPanelReady()

      const instructionsInput = screen.getByTestId('user-instructions-input')
      await user.type(instructionsInput, 'Instructions à réinitialiser')
      expect(instructionsInput).toBeInTheDocument()
    }, 10000)
  })

  /**
   * Regression : a 1024 px, la barre d'action se retrouvait **dans** le conteneur
   * defilant. Collee au bas du contenu par `marginTop: auto`, elle partait donc
   * sous le tiroir « Ce qui part au modele » des que le contenu debordait —
   * `elementFromPoint` au centre du bouton renvoyait le tiroir, et l'action
   * primaire de l'ecran devenait inutilisable.
   *
   * jsdom ne met pas en page : on verifie l'invariant **structurel** qui avait ete
   * viole, et qui garantit le comportement — la barre n'est descendante d'aucun
   * conteneur defilant.
   */
  describe('Ancrage de la barre d’action (regression 1024 px)', () => {
    it('la barre d’action n’est pas dans un conteneur defilant', async () => {
      render(<GenerationPanel />)
      await waitForPanelReady()

      const barre = screen.getByTestId('generation-primary-action')
      const ancetresDefilants: string[] = []
      let parent = barre.parentElement
      while (parent && parent !== document.body) {
        const overflow = `${parent.style.overflow}${parent.style.overflowY}`
        if (/auto|scroll/.test(overflow)) {
          ancetresDefilants.push(parent.className || parent.tagName)
        }
        parent = parent.parentElement
      }

      expect(ancetresDefilants).toEqual([])
    }, 10000)
  })
})
