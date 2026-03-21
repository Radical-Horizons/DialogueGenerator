/**
 * Changement de cible via ConnectionTargetSelect → connectNodes (store réel).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConnectionTargetSelect } from '../components/graph/ConnectionTargetSelect'
import { useGraphStore } from '../store/graphStore'

vi.mock('../api/graph', () => ({
  loadGraph: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  generateNode: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

describe('ConnectionTargetSelect', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
  })

  it('variant choice: sélectionner une cible crée une arête de choix', async () => {
    const user = userEvent.setup()
    useGraphStore.getState().addNode({
      id: 'D1',
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: {
        id: 'D1',
        line: 'Hi',
        choices: [{ text: 'Go', choiceId: '__idx_0' }],
      },
    })
    useGraphStore.getState().addNode({
      id: 'T1',
      type: 'dialogueNode',
      position: { x: 100, y: 0 },
      data: { id: 'T1', line: 'Target line' },
    })

    render(
      <ConnectionTargetSelect
        variant="choice"
        dialogueNodeId="D1"
        choiceIndex={0}
        label="Cible"
        value=""
        data-testid="cts-choice"
      />
    )

    await user.click(screen.getByTestId('cts-choice').querySelector('div') as HTMLElement)
    await user.click(await screen.findByText(/Target line \(T1\)/))

    const edges = useGraphStore.getState().edges
    expect(edges.some((e) => e.source === 'D1' && e.target === 'T1')).toBe(true)
  })
})
