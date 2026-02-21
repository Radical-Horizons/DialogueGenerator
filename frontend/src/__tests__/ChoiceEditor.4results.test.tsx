/**
 * Tests pour ChoiceEditor avec 4 résultats de test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { FormProvider, useForm } from 'react-hook-form'
import { ChoiceEditor } from '../components/graph/ChoiceEditor'
import { dialogueNodeDataSchema, type DialogueNodeData } from '../schemas/nodeEditorSchema'
import { zodResolver } from '@hookform/resolvers/zod'
import { useGraphStore } from '../store/graphStore'

// Mock useGraphStore
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
    vi.mocked(useGraphStore).mockReturnValue({
      nodes: mockNodes,
      isGenerating: false,
    } as ReturnType<typeof useGraphStore>)
  })

  const TestWrapper = ({ children, defaultValues }: { children: React.ReactNode; defaultValues?: DialogueNodeData }) => {
    const form = useForm<DialogueNodeData>({
      resolver: zodResolver(dialogueNodeDataSchema),
      defaultValues: defaultValues || {
        id: 'START',
        type: 'dialogueNode',
        choices: [
          {
            text: 'Choix test',
          },
        ],
      },
    })

    return <FormProvider {...form}>{children}</FormProvider>
  }

  it('devrait afficher les 4 champs de résultat de test quand test est défini', async () => {
    // GIVEN: Un choix avec un attribut test
    const defaultValues: DialogueNodeData = {
      id: 'START',
      type: 'dialogueNode',
      choices: [
        {
          text: 'Tenter de convaincre',
          test: 'Raison+Diplomatie:8',
        },
      ],
    }

    // WHEN: Rendu du ChoiceEditor
    render(
      <TestWrapper defaultValues={defaultValues}>
        <ChoiceEditor choiceIndex={0} />
      </TestWrapper>
    )

    // THEN: Les 4 champs de résultat doivent être visibles (labels "Échec critique →", "Échec →", etc.)
    await waitFor(() => {
      expect(screen.getByLabelText(/Échec critique/)).toBeInTheDocument()
      expect(screen.getByLabelText(/Échec →/)).toBeInTheDocument()
      expect(screen.getByLabelText(/Réussite →/)).toBeInTheDocument()
      expect(screen.getByLabelText(/Réussite critique/)).toBeInTheDocument()
    })
  })

  it('ne devrait pas afficher les 4 champs de résultat quand test n\'est pas défini', async () => {
    // GIVEN: Un choix sans attribut test
    const defaultValues: DialogueNodeData = {
      id: 'START',
      type: 'dialogueNode',
      choices: [
        {
          text: 'Choix normal',
        },
      ],
    }

    // WHEN: Rendu du ChoiceEditor
    render(
      <TestWrapper defaultValues={defaultValues}>
        <ChoiceEditor choiceIndex={0} />
      </TestWrapper>
    )

    // THEN: Les 4 champs de résultat ne doivent pas être visibles
    await waitFor(() => {
      expect(screen.queryByLabelText(/Échec critique/)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/Échec →/)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/Réussite →/)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/Réussite critique/)).not.toBeInTheDocument()
    })
  })

  it('devrait afficher les valeurs existantes des 4 champs de résultat', async () => {
    // GIVEN: Un choix avec test et les 4 nœuds de résultat déjà définis
    const defaultValues: DialogueNodeData = {
      id: 'START',
      type: 'dialogueNode',
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

    // WHEN: Rendu du ChoiceEditor
    render(
      <TestWrapper defaultValues={defaultValues}>
        <ChoiceEditor choiceIndex={0} />
      </TestWrapper>
    )

    // THEN: Les valeurs doivent être affichées dans les champs
    await waitFor(() => {
      const criticalFailureField = screen.getByLabelText(/Échec critique/) as HTMLInputElement
      const failureField = screen.getByLabelText(/Échec →/) as HTMLInputElement
      const successField = screen.getByLabelText(/Réussite →/) as HTMLInputElement
      const criticalSuccessField = screen.getByLabelText(/Réussite critique/) as HTMLInputElement

      expect(criticalFailureField.value).toBe('NODE_CRITICAL_FAILURE')
      expect(failureField.value).toBe('NODE_FAILURE')
      expect(successField.value).toBe('NODE_SUCCESS')
      expect(criticalSuccessField.value).toBe('NODE_CRITICAL_SUCCESS')
    })
  })
})
