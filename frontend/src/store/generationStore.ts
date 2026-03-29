/**
 * Store Zustand pour gérer l'état de génération.
 */
import { create } from 'zustand'
import type { SceneSelection } from '../types/generation'
import type { GenerateUnityDialogueResponse, RawPrompt } from '../types/api'
import type { PromptStructure } from '../types/prompt'

interface GenerationState {
  // Sélection de scène
  sceneSelection: SceneSelection
  
  // Structure de dialogue
  dialogueStructure: string[]
  
  // System prompt
  systemPromptOverride: string | null
  defaultSystemPrompt: string | null
  
  // Source de vérité unique pour le prompt
  rawPrompt: RawPrompt | null
  structuredPrompt: PromptStructure | null
  promptHash: string | null
  /** Hash des paramètres d’entrée (SHA des params normalisés) — aligné avec computeStateHash ; sert au cache d’estimation. */
  previewInputHash: string | null
  tokenCount: number | null
  isEstimating: boolean
  
  // Résultats de génération
  unityDialogueResponse: GenerateUnityDialogueResponse | null
  tokensUsed: number | null

  /** Instructions scène (panneau génération) — pour estimation budget contexte côté ContextSelector */
  generationUserInstructions: string
  setGenerationUserInstructions: (value: string) => void
  
  // État streaming (Task 2 - Story 0.2)
  isGenerating: boolean
  streamingContent: string
  currentStep: 'Prompting' | 'Generating' | 'Validating' | 'Complete'
  isMinimized: boolean
  error: string | null
  currentJobId: string | null
  isInterrupting: boolean  // Task 4 - Story 0.8
  chunkBuffer: Map<number, string>  // Buffer pour réordonner les chunks avec séquence
  lastProcessedSequence: number  // Dernière séquence traitée (pour réordonnancement)
  
  // Actions
  setSceneSelection: (selection: Partial<SceneSelection>) => void
  setDialogueStructure: (structure: string[]) => void
  setSystemPromptOverride: (prompt: string | null) => void
  setDefaultSystemPrompt: (prompt: string | null) => void
  resetSystemPrompt: () => void
  setRawPrompt: (
    prompt: RawPrompt | null,
    tokens: number | null,
    hash: string | null,
    isEstimating: boolean,
    structuredPrompt?: PromptStructure | null,
    previewHashUpdate?: 'invalidate' | 'preserve' | string
  ) => void
  setUnityDialogueResponse: (response: GenerateUnityDialogueResponse | null) => void
  setTokensUsed: (tokens: number | null) => void
  clearGenerationResults: () => void
  
  // Actions streaming (Task 2 - Story 0.2)
  startGeneration: (jobId: string) => void
  appendChunk: (chunk: string, sequence?: number) => void
  setStep: (step: 'Prompting' | 'Generating' | 'Validating' | 'Complete') => void
  interrupt: () => void
  minimize: () => void
  complete: () => void
  setError: (error: string) => void
  resetStreamingState: () => void
  setInterrupting: (isInterrupting: boolean) => void  // Task 4 - Story 0.8
}


const defaultSceneSelection: SceneSelection = {
  characterA: null,
  characterB: null,
  sceneRegion: null,
  subLocation: null,
}

const defaultDialogueStructure: string[] = ['PNJ', 'PJ', 'Stop', '', '', '']

export const useGenerationStore = create<GenerationState>((set) => ({
  sceneSelection: defaultSceneSelection,
  dialogueStructure: defaultDialogueStructure,
  systemPromptOverride: null,
  defaultSystemPrompt: null,
  rawPrompt: null,
  structuredPrompt: null,
  promptHash: null,
  previewInputHash: null,
  tokenCount: null,
  isEstimating: false,
  unityDialogueResponse: null,
  tokensUsed: null,
  generationUserInstructions: '',
  setGenerationUserInstructions: (value) => set({ generationUserInstructions: value }),

  // État streaming initial (Task 2 - Story 0.2)
  isGenerating: false,
  streamingContent: '',
  currentStep: 'Prompting',
  isMinimized: false,
  error: null,
  currentJobId: null,
  isInterrupting: false,  // Task 4 - Story 0.8
  chunkBuffer: new Map<number, string>(),
  lastProcessedSequence: -1,  // Dernière séquence traitée

  setSceneSelection: (selection) =>
    set((state) => ({
      sceneSelection: { ...state.sceneSelection, ...selection },
    })),

  setDialogueStructure: (structure) =>
    set({ dialogueStructure: structure }),

  setSystemPromptOverride: (prompt) =>
    set({ systemPromptOverride: prompt }),

  setDefaultSystemPrompt: (prompt) =>
    set({ defaultSystemPrompt: prompt }),

  resetSystemPrompt: () =>
    set((state) => ({
      systemPromptOverride: state.defaultSystemPrompt,
    })),

  setRawPrompt: (prompt, tokens, hash, isEstimating, structuredPrompt = null, previewHashUpdate) =>
    set((state) => {
      let nextPreview = state.previewInputHash
      if (previewHashUpdate === undefined || previewHashUpdate === 'invalidate') {
        nextPreview = null
      } else if (previewHashUpdate === 'preserve') {
        nextPreview = state.previewInputHash
      } else {
        nextPreview = previewHashUpdate
      }
      return {
        rawPrompt: prompt,
        structuredPrompt: structuredPrompt ?? null,
        tokenCount: tokens,
        promptHash: hash,
        isEstimating,
        previewInputHash: nextPreview,
      }
    }),

  setUnityDialogueResponse: (response) =>
    set({ unityDialogueResponse: response }),

  setTokensUsed: (tokens) =>
    set({ tokensUsed: tokens }),

  clearGenerationResults: () =>
    set({ unityDialogueResponse: null, tokensUsed: null }),

  // Actions streaming (Task 2 - Story 0.2)
  startGeneration: (jobId) =>
    set({
      isGenerating: true,
      streamingContent: '',
      currentStep: 'Prompting',
      isMinimized: false,
      error: null,
      currentJobId: jobId,
      chunkBuffer: new Map<number, string>(),
      lastProcessedSequence: -1,
    }),

  appendChunk: (chunk, sequence) =>
    set((state) => {
      // Si pas de séquence, comportement legacy (ajout direct) - pour compatibilité
      if (sequence === undefined) {
        const newContent = state.streamingContent + chunk;
        return { streamingContent: newContent };
      }
      
      // Avec séquence : système de réordonnancement pour gérer les cas de buffering
      // TCP garantit normalement l'ordre, mais on garde ce système comme sécurité
      
      // Détecter le début d'une nouvelle génération : si on reçoit séquence 0 alors que
      // lastProcessedSequence > 0, c'est qu'une nouvelle génération a commencé
      // (startGeneration n'a pas été appelé à temps ou il y a un délai)
      if (sequence === 0 && state.lastProcessedSequence >= 0 && state.streamingContent.length > 0) {
        // Nouvelle génération détectée : ajouter un séparateur au lieu de réinitialiser
        // IMPORTANT: Réinitialiser complètement le buffer pour éviter les chunks en retard de l'ancienne génération
        const separator = '\n\n---\n\n'
        const newBuffer = new Map<number, string>()
        newBuffer.set(0, chunk)
        return {
          streamingContent: state.streamingContent + separator + chunk,
          chunkBuffer: newBuffer,
          lastProcessedSequence: 0,
        }
      }
      
      // Si on a déjà traité ce chunk dans la détection de nouvelle génération, l'ignorer
      // (peut arriver si le chunk arrive deux fois dans le flux)
      if (sequence === 0 && state.lastProcessedSequence === 0 && state.chunkBuffer.has(0)) {
        // Chunk déjà traité, ignorer
        return state
      }
      
      const newBuffer = new Map(state.chunkBuffer)
      newBuffer.set(sequence, chunk)
      
      // Utiliser lastProcessedSequence au lieu de currentLength pour éviter les blocages
      // Si des chunks arrivent dans le désordre, on peut avoir currentLength < lastProcessedSequence
      let nextExpected = state.lastProcessedSequence + 1
      let newContent = state.streamingContent
      
      // Trier les séquences disponibles
      const sortedSequences = Array.from(newBuffer.keys()).sort((a, b) => a - b)
      
      // Ajouter tous les chunks consécutifs depuis nextExpected
      // On continue tant qu'on a des chunks consécutifs disponibles
      let lastAdded = -1
      for (const seq of sortedSequences) {
        if (seq === nextExpected) {
          newContent += newBuffer.get(seq)!
          newBuffer.delete(seq)
          lastAdded = seq
          nextExpected++
        } else if (seq < nextExpected) {
          // Chunk en retard (déjà traité ou doublon) - ignorer et nettoyer
          newBuffer.delete(seq)
        } else {
          // Gap détecté (seq > nextExpected), on s'arrête ici et on attend
          break
        }
      }
      
      // Mettre à jour lastProcessedSequence si on a ajouté des chunks
      const newLastProcessedSequence = lastAdded >= 0 ? lastAdded : state.lastProcessedSequence
      
      return {
        streamingContent: newContent,
        chunkBuffer: newBuffer,
        lastProcessedSequence: newLastProcessedSequence,
      };
    }),

  setStep: (step) =>
    set({ currentStep: step }),

  interrupt: () =>
    set({
      isGenerating: false,
      streamingContent: '',
      chunkBuffer: new Map<number, string>(),
      lastProcessedSequence: -1,
      currentStep: 'Prompting',
      error: null,
      currentJobId: null,
      isInterrupting: false,  // Fix: Réinitialiser isInterrupting (Issue #4)
    }),

  minimize: () =>
    set((state) => ({
      isMinimized: !state.isMinimized,
    })),

  complete: () =>
    set({
      isGenerating: false,
      currentStep: 'Complete',
      chunkBuffer: new Map<number, string>(),
      lastProcessedSequence: -1,
    }),

  setError: (error) =>
    set({
      isGenerating: false,
      error,
    }),

  resetStreamingState: () =>
    set({
      isGenerating: false,
      streamingContent: '',
      currentStep: 'Prompting',
      isMinimized: false,
      error: null,
      currentJobId: null,
      isInterrupting: false,
      chunkBuffer: new Map<number, string>(),
      lastProcessedSequence: -1,
    }),

  setInterrupting: (isInterrupting) =>
    set({ isInterrupting }),  // Task 4 - Story 0.8
}))


