/**
 * Tests unitaires pour le store generationStore (extensions streaming).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useGenerationStore } from '@/store/generationStore'

describe('generationStore - Streaming Extensions', () => {
  beforeEach(() => {
    // Réinitialiser le store avant chaque test
    const store = useGenerationStore.getState()
    // Réinitialiser l'état streaming
    if (store.resetStreamingState) {
      store.resetStreamingState()
    }
  })

  it('should have initial streaming state as false', () => {
    const { isGenerating } = useGenerationStore.getState()
    expect(isGenerating).toBe(false)
  })

  it('should start generation and set isGenerating to true', () => {
    const { startGeneration, isGenerating: initialState } = useGenerationStore.getState()
    expect(initialState).toBe(false)

    startGeneration('job-1')

    const { isGenerating } = useGenerationStore.getState()
    expect(isGenerating).toBe(true)
  })

  it('should append chunk to streamingContent', () => {
    const { startGeneration, appendChunk, streamingContent: initialContent } = useGenerationStore.getState()
    expect(initialContent).toBe('')

    startGeneration('job-1')
    appendChunk('Hello ')
    appendChunk('World')

    const { streamingContent } = useGenerationStore.getState()
    expect(streamingContent).toBe('Hello World')
  })

  it('should update currentStep', () => {
    const { startGeneration, setStep, currentStep: initialStep } = useGenerationStore.getState()
    expect(initialStep).toBe('Prompting')

    startGeneration('job-1')
    setStep('Generating')

    const { currentStep } = useGenerationStore.getState()
    expect(currentStep).toBe('Generating')
  })

  it('should set error and stop generation', () => {
    const { startGeneration, setError, isGenerating: initialGen, error: initialError } = useGenerationStore.getState()
    expect(initialGen).toBe(false)
    expect(initialError).toBeNull()

    startGeneration('job-1')
    setError('Test error message')

    const { isGenerating, error } = useGenerationStore.getState()
    expect(isGenerating).toBe(false)
    expect(error).toBe('Test error message')
  })

  it('should complete generation successfully', () => {
    const { startGeneration, complete, isGenerating: initialGen } = useGenerationStore.getState()
    expect(initialGen).toBe(false)

    startGeneration('job-1')
    complete()

    const { isGenerating, currentStep } = useGenerationStore.getState()
    expect(isGenerating).toBe(false)
    expect(currentStep).toBe('Complete')
  })

  it('should interrupt generation', () => {
    const { startGeneration, interrupt, isGenerating: initialGen } = useGenerationStore.getState()
    expect(initialGen).toBe(false)

    startGeneration('job-1')
    const { isGenerating: afterStart } = useGenerationStore.getState()
    expect(afterStart).toBe(true)

    interrupt()

    const { isGenerating } = useGenerationStore.getState()
    expect(isGenerating).toBe(false)
  })

  it('should toggle minimize state', () => {
    const { startGeneration, minimize, isMinimized: initialMin } = useGenerationStore.getState()
    expect(initialMin).toBe(false)

    startGeneration('job-1')
    minimize()

    const { isMinimized: afterFirst } = useGenerationStore.getState()
    expect(afterFirst).toBe(true)

    minimize() // Toggle again

    const { isMinimized: afterSecond } = useGenerationStore.getState()
    expect(afterSecond).toBe(false)
  })

  it('should maintain immutable updates', () => {
    const { startGeneration, appendChunk } = useGenerationStore.getState()
    const stateBefore = useGenerationStore.getState()

    startGeneration('job-1')
    appendChunk('Test')

    const stateAfter = useGenerationStore.getState()

    // Les références doivent être différentes (immutabilité)
    expect(stateAfter).not.toBe(stateBefore)
    // Mais les propriétés non modifiées doivent rester les mêmes
    expect(stateAfter.sceneSelection).toBe(stateBefore.sceneSelection)
  })

  it('should reset streaming state', () => {
    const { startGeneration, appendChunk, setStep, resetStreamingState } = useGenerationStore.getState()

    startGeneration('job-1')
    appendChunk('Test content')
    setStep('Generating')

    resetStreamingState()

    const { isGenerating, streamingContent, currentStep, error } = useGenerationStore.getState()
    expect(isGenerating).toBe(false)
    expect(streamingContent).toBe('')
    expect(currentStep).toBe('Prompting')
    expect(error).toBeNull()
  })
})
