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
      nodes: [],
    })
    useGraphViewStore.getState().exitDialoguePreview()
  })

  it('enterDialoguePreview hydrate visibilityEvalState depuis les liaisons', () => {
    const { result } = renderHook(() => useDialoguePreview())
    act(() => result.current.enterDialoguePreview())
    expect(useGraphViewStore.getState().dialoguePreviewActive).toBe(true)
    expect(useGraphViewStore.getState().visibilityEvalState.flags.K).toBe(true)
    act(() => result.current.exitDialoguePreview())
    expect(useGraphViewStore.getState().dialoguePreviewActive).toBe(false)
  })
})
