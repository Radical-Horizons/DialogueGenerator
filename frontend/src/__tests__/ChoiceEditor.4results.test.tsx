/**
 * Tests pour ChoiceEditor avec 4 résultats de test (Combobox cibles).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { FormProvider, useForm } from 'react-hook-form'
import { ChoiceEditor } from '../components/graph/ChoiceEditor'
import { dialogueNodeDataSchema, type DialogueNodeData } from '../schemas/nodeEditorSchema'
import { zodResolver } from '@hookform/resolvers/zod'
import { useGraphStore } from '../store/graphStore'

vi.mock('../store/graphStore', () => ({
  useGraphStore: vi.fn(),
}))

describe('ChoiceEditor - 4 résultats de test', () => {
  const mockNodes = [
    { id: 'START', type: 'dialogueNode', data: {} },
    { id: 'NODE_1', type: 'dialogueNode', data: {} },
    { id: 'NODE_CRITICAL_FAILURE', type: 'dialogueNode', data: {} },
    { id: 'NODE_FAILURE', type: 'dialogueNode', data: {} },
    { id: 'NODE_SUCCESS', type: 'dialogueNode', data: {} },
    { id: 'NODE_CRITICAL_SUCCESS', type: 'dialogueNode', data: {} },
  ]

  beforeEach(() => {
    vi.mocked(useGraphStore).mockImplementation(((selector?: (s: unknown) => unknown) => {
      const state = {
        nodes: mockNodes,
        edges: [],
        isGenerating: false,
        connectNodes: vi.fn(),
        disconnectNodes: vi.fn(),
      }
      return selector != null ? selector(state) : state
    }) as typeof useGraphStore)
  })

  const TestWrapper = ({
    children,
    defaultValues,
  }: {
    children: React.ReactNode
    defaultValues?: DialogueNodeData
  }) => {
    const form = useForm<DialogueNodeData>({
      resolver: zodResolver(dialogueNodeDataSchema),
      defaultValues: defaultValues || {
        id: 'START',
        choices: [
          {
            text: 'Choix test',
          },
        ],
      },
    })

    return <FormProvider {...form}>{children}</FormProvider>
  }

  it('devrait afficher les 4 combobox de résultat quand test est défini', async () => {
    const defaultValues: DialogueNodeData = {
      id: 'START',
      choices: [
        {
          text: 'Tenter de convaincre',
          test: 'Raison+Diplomatie:8',
        },
      ],
    }

    render(
      <TestWrapper defaultValues={defaultValues}>
        <ChoiceEditor dialogueNodeId="START" choiceIndex={0} />
      </TestWrapper>
    )

    await waitFor(() => {
      expect(screen.getByTestId('choice-test-cf-0')).toBeInTheDocument()
      expect(screen.getByTestId('choice-test-f-0')).toBeInTheDocument()
      expect(screen.getByTestId('choice-test-s-0')).toBeInTheDocument()
      expect(screen.getByTestId('choice-test-cs-0')).toBeInTheDocument()
    })
  })

  it('ne devrait pas afficher les 4 combobox quand test n\'est pas défini', async () => {
    const defaultValues: DialogueNodeData = {
      id: 'START',
      choices: [
        {
          text: 'Choix normal',
        },
      ],
    }

    render(
      <TestWrapper defaultValues={defaultValues}>
        <ChoiceEditor dialogueNodeId="START" choiceIndex={0} />
      </TestWrapper>
    )

    await waitFor(() => {
      expect(screen.queryByTestId('choice-test-cf-0')).not.toBeInTheDocument()
      expect(screen.queryByTestId('choice-test-f-0')).not.toBeInTheDocument()
      expect(screen.queryByTestId('choice-test-s-0')).not.toBeInTheDocument()
      expect(screen.queryByTestId('choice-test-cs-0')).not.toBeInTheDocument()
    })
  })

  it('devrait afficher les libellés des cibles sélectionnées dans les combobox', async () => {
    const defaultValues: DialogueNodeData = {
      id: 'START',
      choices: [
        {
          text: 'Tenter de convaincre',
          test: 'Raison+Diplomatie:8',
          testCriticalFailureNode: 'NODE_CRITICAL_FAILURE',
          testFailureNode: 'NODE_FAILURE',
          testSuccessNode: 'NODE_SUCCESS',
          testCriticalSuccessNode: 'NODE_CRITICAL_SUCCESS',
        },
      ],
    }

    render(
      <TestWrapper defaultValues={defaultValues}>
        <ChoiceEditor dialogueNodeId="START" choiceIndex={0} />
      </TestWrapper>
    )

    await waitFor(() => {
      expect(within(screen.getByTestId('choice-test-cf-0')).getByText('NODE_CRITICAL_FAILURE')).toBeInTheDocument()
      expect(within(screen.getByTestId('choice-test-f-0')).getByText('NODE_FAILURE')).toBeInTheDocument()
      expect(within(screen.getByTestId('choice-test-s-0')).getByText('NODE_SUCCESS')).toBeInTheDocument()
      expect(within(screen.getByTestId('choice-test-cs-0')).getByText('NODE_CRITICAL_SUCCESS')).toBeInTheDocument()
    })
  })
})
