/**
 * Tests overlay playthrough VN.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScenarioPlaythroughOverlay } from './ScenarioPlaythroughOverlay'
import { useGraphStore } from '../../../store/graphStore'
import { useGraphViewStore } from '../../../store/graphViewStore'

vi.mock('../../../hooks/useScenarioPlaythrough', () => ({
  useScenarioPlaythrough: () => ({
    selectChoice: vi.fn(),
    continueLinear: vi.fn(),
    goBack: vi.fn(),
    jumpToNode: vi.fn(),
    resetScenarioPlaythrough: vi.fn(),
    exitScenarioPlaythrough: vi.fn(),
  }),
}))

vi.mock('../../../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
}))

describe('ScenarioPlaythroughOverlay', () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: [
        {
          id: 'START',
          type: 'dialogueNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'START',
            speaker: 'Akthar',
            line: 'Bonjour voyageur.',
            choices: [{ text: 'Saluer', targetNode: 'B' }],
          },
        },
        {
          id: 'B',
          type: 'dialogueNode',
          position: { x: 0, y: 100 },
          data: { id: 'B', line: 'Suite.' },
        },
      ],
      edges: [],
    } as Partial<ReturnType<typeof useGraphStore.getState>>)
    useGraphViewStore.setState({
      dialoguePreviewActive: true,
      visibilityEvalState: { flags: {}, reputation: {} },
      previewGameSystemsState: {
        attributes: {},
        skills: {},
        effortPool: 10,
        reputationValues: {},
        factionTitles: {},
        simulationLimits: [],
      },
      scenarioPlaythrough: {
        active: true,
        currentNodeId: 'START',
        history: [],
        visitedNodeIds: { START: true },
        visitedChoiceKeys: {},
        forcedSkillCheckIssue: null,
        showDevDrawer: false,
        showGraphPeek: false,
        transientMessage: null,
      },
    })
  })

  it('affiche speaker, line et choix non testé', () => {
    render(<ScenarioPlaythroughOverlay dialogueTitle="TestQuest" onExit={vi.fn()} />)
    expect(screen.getByTestId('scenario-playthrough-overlay')).toBeInTheDocument()
    expect(screen.getByTestId('playthrough-speaker')).toHaveTextContent('Akthar')
    expect(screen.getByTestId('playthrough-line')).toHaveTextContent('Bonjour voyageur.')
    const choice = screen.getByTestId('playthrough-choice-0')
    expect(choice).toHaveAttribute('data-choice-status', 'untested')
    expect(choice).toHaveTextContent('Non testé')
  })
})
