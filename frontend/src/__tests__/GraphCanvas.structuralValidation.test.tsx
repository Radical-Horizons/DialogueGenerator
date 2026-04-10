/**
 * Story 4.1 (FR36) : erreurs structurelles → style d’erreur sur les nœuds passés à React Flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render } from '@testing-library/react'
import { GraphCanvas } from '../components/graph/GraphCanvas'
import { useGraphStore } from '../store/graphStore'
import { theme } from '../theme'

type ReactFlowProps = Record<string, unknown>

let capturedReactFlowProps: ReactFlowProps | null = null

vi.mock('reactflow', () => ({
  default: (props: ReactFlowProps) => {
    capturedReactFlowProps = props
    return React.createElement('div', { 'data-testid': 'mock-reactflow' })
  },
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  useReactFlow: () => ({
    fitView: vi.fn(),
    getNode: vi.fn(),
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
}))

describe('GraphCanvas validation structurelle FR36', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
    capturedReactFlowProps = null
  })

  it('applique bordure erreur aux nœuds avec erreur FR36 (missing_display_name)', () => {
    useGraphStore.setState({
      nodes: [
        {
          id: 'n1',
          type: 'dialogueNode',
          position: { x: 0, y: 0 },
          data: { id: 'n1', line: 'x' },
        },
        {
          id: 'n2',
          type: 'dialogueNode',
          position: { x: 100, y: 0 },
          data: { id: 'n2', displayName: 'OK', line: 'y' },
        },
      ],
      edges: [],
      validationErrors: [
        {
          type: 'missing_display_name',
          node_id: 'n1',
          message: 'Nœud [n1] : DisplayName manquant',
          severity: 'error' as const,
        },
      ],
    })

    render(React.createElement(GraphCanvas))

    const rfNodes = capturedReactFlowProps?.nodes as Array<{
      id: string
      style?: { border?: string; boxShadow?: string }
    }>
    expect(rfNodes).toBeTruthy()
    const n1 = rfNodes!.find((n) => n.id === 'n1')
    const n2 = rfNodes!.find((n) => n.id === 'n2')
    expect(n1?.style?.border).toContain(theme.state.error.border)
    expect(n1?.style?.boxShadow).toContain(theme.state.error.border)
    expect(n2?.style?.border === undefined || !String(n2?.style?.border).includes(theme.state.error.border)).toBe(
      true
    )
  })

  it('applique bordure complétude (orange) pour missing_dialogue_text seul (FR37)', () => {
    useGraphStore.setState({
      nodes: [
        {
          id: 'n1',
          type: 'dialogueNode',
          position: { x: 0, y: 0 },
          data: { id: 'n1', displayName: 'OK', line: '' },
        },
      ],
      edges: [],
      validationErrors: [
        {
          type: 'missing_dialogue_text',
          node_id: 'n1',
          message: 'Nœud [n1] : contenu vide (ni dialogue ni choix)',
          severity: 'error' as const,
        },
      ],
    })

    render(React.createElement(GraphCanvas))

    const rfNodes = capturedReactFlowProps?.nodes as Array<{ id: string; style?: { border?: string } }>
    const n1 = rfNodes!.find((n) => n.id === 'n1')
    expect(String(n1?.style?.border)).toContain(theme.state.warning.border)
    expect(String(n1?.style?.border)).not.toContain(theme.state.error.border)
  })

  it('priorise le rouge structure si missing_display_name et missing_dialogue_text (FR36 > FR37)', () => {
    useGraphStore.setState({
      nodes: [
        {
          id: 'n1',
          type: 'dialogueNode',
          position: { x: 0, y: 0 },
          data: { id: 'n1', line: '' },
        },
      ],
      edges: [],
      validationErrors: [
        {
          type: 'missing_display_name',
          node_id: 'n1',
          message: 'Nœud [n1] : DisplayName manquant',
          severity: 'error' as const,
        },
        {
          type: 'missing_dialogue_text',
          node_id: 'n1',
          message: 'Nœud [n1] : contenu vide (ni dialogue ni choix)',
          severity: 'error' as const,
        },
      ],
    })

    render(React.createElement(GraphCanvas))

    const rfNodes = capturedReactFlowProps?.nodes as Array<{ id: string; style?: { border?: string } }>
    const n1 = rfNodes!.find((n) => n.id === 'n1')
    expect(String(n1?.style?.border)).toContain(theme.state.error.border)
  })

  it('surligne le nœud en rouge canvas pour broken_reference (kind structural hors types FR36 stricts)', () => {
    useGraphStore.setState({
      nodes: [
        {
          id: 'n1',
          type: 'dialogueNode',
          position: { x: 0, y: 0 },
          data: { id: 'n1', displayName: 'A', line: 'x' },
        },
      ],
      edges: [],
      validationErrors: [
        {
          type: 'broken_reference',
          node_id: 'n1',
          message: 'Edge target missing',
          severity: 'error' as const,
          target: 'ghost',
        },
      ],
    })

    render(React.createElement(GraphCanvas))

    const rfNodes = capturedReactFlowProps?.nodes as Array<{ id: string; style?: { border?: string } }>
    const n1 = rfNodes!.find((n) => n.id === 'n1')
    expect(String(n1?.style?.border)).toContain(theme.state.error.border)
  })
})
