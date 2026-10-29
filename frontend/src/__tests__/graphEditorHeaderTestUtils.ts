/**
 * Fixtures partagées pour les tests GraphEditorHeader (Story 17.11).
 */
import { createElement, type ComponentProps } from 'react'
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import type { UseGraphToolbarReturn } from '../hooks/useGraphToolbar'
import { useGraphStore } from '../store/graphStore'
import { GraphEditorHeader } from '../components/graph/GraphEditorHeader'
import * as narrowHook from '../hooks/useNarrowInlineSize'
import { makeMockGraphToolbar } from '../testFixtures/graphToolbar'

type NarrowHookReturn = ReturnType<typeof narrowHook.useNarrowInlineSize>

/**
 * Baseline complète UseGraphToolbarReturn : déléguée à la fixture partagée
 * (`src/testFixtures/graphToolbar.ts`), seul endroit où les ~75 champs sont énumérés.
 * Surcouche locale : undo/redo câblés sur le vrai store, ce que les tests header exercent.
 */
export const defaultMockToolbarState: UseGraphToolbarReturn = makeMockGraphToolbar({
  undo: () => useGraphStore.getState().undo(),
  redo: () => useGraphStore.getState().redo(),
})

export function makeMockToolbar(
  overrides: Partial<UseGraphToolbarReturn> = {},
): UseGraphToolbarReturn {
  return { ...defaultMockToolbarState, ...overrides }
}

/** Mocks `useNarrowInlineSize` for the toolbar narrow threshold (640px). */
export function mockNarrowToolbar(narrowToolbar: boolean): void {
  vi.spyOn(narrowHook, 'useNarrowInlineSize').mockImplementation(
    () => ({ ref: () => {}, isNarrow: narrowToolbar }) as NarrowHookReturn,
  )
}

export const defaultGraphEditorHeaderProps = {
  hasActiveDialogue: true,
  activeDialogueFilename: 'test.json',
  handleSave: async () => {},
  onBatchTagApply: () => {},
  handleBatchValidateSelection: () => {},
  handleBatchDeleteSelection: () => {},
  canEditGraph: true,
  isStandalone: false,
} satisfies Omit<ComponentProps<typeof GraphEditorHeader>, 'toolbar'>

type RenderGraphEditorHeaderOptions = Partial<
  ComponentProps<typeof GraphEditorHeader>
> & {
  narrow?: boolean
}

/** Render minimal GraphEditorHeader pour tests mount / density. */
export function renderGraphEditorHeader(
  options: RenderGraphEditorHeaderOptions = {},
) {
  const { narrow, toolbar, ...headerProps } = options
  if (narrow !== undefined) {
    mockNarrowToolbar(narrow)
  }
  return render(
    createElement(GraphEditorHeader, {
      toolbar: toolbar ?? makeMockToolbar(),
      ...defaultGraphEditorHeaderProps,
      ...headerProps,
    }),
  )
}
