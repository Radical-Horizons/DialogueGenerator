/**
 * Story 9.4 — hook entrée preview sans persistance document.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGraphStore } from '../store/graphStore'
import { useGraphViewStore } from '../store/graphViewStore'
import { useDialoguePreview } from './useDialoguePreview'

describe('useDialoguePreview', () => {
  beforeEach(() => {
    useGraphStore.setState({
      dialogueFlagBindings: [{ flagId: 'K', type: 'bool', initialValue: true }],
      nodes: [
        {
          id: 'START',
          type: 'dialogueNode',
          position: { x: 0, y: 0 },
          data: { id: 'START', line: 'Hi' },
        },
      ],
      edges: [],
    })
    useGraphViewStore.getState().exitScenarioPlaythrough()
  })

  it('enterDialoguePreview hydrate visibilityEvalState et active playthrough', () => {
    const { result } = renderHook(() => useDialoguePreview())
    act(() => result.current.enterDialoguePreview())
    expect(useGraphViewStore.getState().dialoguePreviewActive).toBe(true)
    expect(useGraphViewStore.getState().scenarioPlaythrough.active).toBe(true)
    expect(useGraphViewStore.getState().visibilityEvalState.flags.K).toBe(true)
    act(() => result.current.exitDialoguePreview())
    expect(useGraphViewStore.getState().dialoguePreviewActive).toBe(false)
  })
})
