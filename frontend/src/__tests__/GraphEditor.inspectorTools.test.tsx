/**
 * Sur bureau, les outils du menu Qualités vivent dans l'inspecteur : le canvas n'est jamais
 * masqué et aucune fenêtre flottante ne se superpose à lui.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GraphEditor } from '../components/graph/GraphEditor'
import { useGraphStore } from '../store/graphStore'
import { useUiLayoutStore } from '../store/uiLayoutStore'

const toolbarOverrides = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))

vi.mock('../components/graph/GraphCanvas', () => ({
  GraphCanvas: () => React.createElement('div', { 'data-testid': 'graph-canvas-stub' }),
}))

vi.mock('../components/graph/GraphEditorHeader', () => ({
  GraphEditorHeader: () => null,
}))

vi.mock('../components/graph/AIGenerationPanel', () => ({
  AIGenerationPanel: () => null,
}))

vi.mock('../components/graph/DeleteNodeConfirmModal', () => ({
  DeleteNodeConfirmModal: () => null,
}))

vi.mock('../components/shared', () => ({
  useToast: () => vi.fn(),
  SaveStatusIndicator: () => null,
  ConfirmDialog: () => null,
  Badge: ({ children }: { children: React.ReactNode }) => React.createElement('span', null, children),
}))

vi.mock('../utils/graphExport', () => ({
  exportGraphToPNG: vi.fn(),
  exportGraphToSVG: vi.fn(),
}))

vi.mock('../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => undefined,
}))

vi.mock('../hooks/useNarrowInlineSize', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../hooks/useNarrowInlineSize')>()
  return { ...mod, useNarrowInlineSize: () => ({ ref: () => undefined, isNarrow: false }) }
})

vi.mock('../components/unityDialogues/UnityDialogueList', () => ({
  UnityDialogueList: React.forwardRef(function UnityDialogueListMock(_props, ref) {
    React.useImperativeHandle(ref, () => ({ refresh: () => undefined }))
    return React.createElement('div', { 'data-testid': 'unity-dialogue-list' })
  }),
}))

vi.mock('../hooks/useGraphToolbar', async () => {
  const { makeMockGraphToolbar } = await import('../testFixtures/graphToolbar')
  return { useGraphToolbar: () => makeMockGraphToolbar(toolbarOverrides.current) }
})

vi.mock('../hooks/useDialogueLoader', () => ({
  useDialogueLoader: () => ({
    selectedDialogue: null,
    setSelectedDialogue: vi.fn(),
    isLoadingDialogue: false,
    activeDialogueFilename: 'test-dialogue.json',
    activeDialogueTitle: 'Test',
    hasActiveDialogue: true,
    handleSave: async () => {},
    dialogueListRef: { current: { refresh: vi.fn() } },
  }),
}))

vi.mock('../api/graph', () => ({
  getNodePrompt: vi.fn(),
  loadGraph: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  generateNode: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
  detectAiSlop: vi.fn(),
}))

function renderEditor() {
  return render(
    React.createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      React.createElement(GraphEditor)
    )
  )
}

describe('GraphEditor — outils dans l’inspecteur', () => {
  beforeEach(() => {
    toolbarOverrides.current = {}
    useGraphStore.getState().resetGraph()
    useUiLayoutStore.setState({ inspectorTab: 'node' })
  })

  it('l’onglet SLOP affiche l’anti-slop dans l’inspecteur, canvas toujours présent', () => {
    useUiLayoutStore.setState({ inspectorTab: 'slop' })
    renderEditor()

    const inspector = screen.getByTestId('graph-inspector')
    expect(within(inspector).getByTestId('graph-inspector-tab-slop')).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(within(inspector).getByTestId('graph-ai-slop-panel')).toBeInTheDocument()
    expect(within(inspector).getByTestId('graph-ai-slop-detect')).toBeInTheDocument()
    expect(screen.getByTestId('graph-canvas-stub')).toBeVisible()
  })

  it('l’anti-slop du toolbar n’ouvre plus de fenêtre flottante sur bureau', () => {
    toolbarOverrides.current = { showAiSlopPanel: true, showQualityLlmPanel: true }
    renderEditor()

    expect(screen.queryByTestId('graph-ai-slop-panel')).not.toBeInTheDocument()
    expect(screen.queryByTestId('graph-quality-llm-panel')).not.toBeInTheDocument()
  })

  it('la validation schéma s’ouvre dans SANTÉ, avec son verdict', () => {
    toolbarOverrides.current = {
      showSchemaValidationPanel: true,
      schemaValidationIsValid: false,
      schemaValidationErrors: ['choices trop long'],
      schemaValidationErrorCount: 1,
    }
    renderEditor()

    expect(useUiLayoutStore.getState().inspectorTab).toBe('health')
    const inspector = screen.getByTestId('graph-inspector')
    expect(within(inspector).getByTestId('schema-validation-panel')).toBeInTheDocument()
    expect(within(inspector).getByTestId('schema-status-badge')).toHaveTextContent('1 erreur')
  })

  it('sans validation demandée, SANTÉ n’affiche pas de bloc schéma', () => {
    useUiLayoutStore.setState({ inspectorTab: 'health' })
    renderEditor()

    expect(screen.queryByTestId('schema-validation-panel')).not.toBeInTheDocument()
  })
})
