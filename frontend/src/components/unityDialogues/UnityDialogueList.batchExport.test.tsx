/**
 * Story 5.2 — UnityDialogueList batch export UI.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as unityDialoguesAPI from '../../api/unityDialogues'
import * as dialoguesAPI from '../../api/dialogues'
import { UnityDialogueList } from './UnityDialogueList'

vi.mock('../../api/unityDialogues', () => ({
  listUnityDialogues: vi.fn(),
}))

vi.mock('../../api/dialogues', () => ({
  batchExportUnityDialogues: vi.fn(),
}))

vi.mock('../../store/graphStore', () => ({
  useGraphStore: vi.fn(),
}))

import { useGraphStore } from '../../store/graphStore'

const useGraphStoreMock = vi.mocked(useGraphStore)

vi.mock('../shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shared')>()
  return {
    ...actual,
    useToast: () => vi.fn(),
  }
})

const mockList = vi.mocked(unityDialoguesAPI.listUnityDialogues)
const batchExportMock = vi.mocked(dialoguesAPI.batchExportUnityDialogues)

const THREE_DIALOGUES = {
  dialogues: [
    {
      filename: 'doc_a.json',
      file_path: '/data/doc_a.json',
      modified_time: '2026-04-08T12:00:00.000Z',
      size_bytes: 1024,
      title: 'Dialogue A',
    },
    {
      filename: 'doc_b.json',
      file_path: '/data/doc_b.json',
      modified_time: '2026-04-08T12:00:00.000Z',
      size_bytes: 1024,
      title: 'Dialogue B',
    },
    {
      filename: 'doc_c.json',
      file_path: '/data/doc_c.json',
      modified_time: '2026-04-08T12:00:00.000Z',
      size_bytes: 1024,
      title: 'Dialogue C',
    },
  ],
  total: 3,
}

describe('UnityDialogueList batch export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    useGraphStoreMock.mockImplementation((selector) =>
      selector({
        hasUnsavedChanges: false,
        documentId: null,
        dialogueMetadata: { filename: undefined, title: '', node_count: 0, edge_count: 0 },
      } as Parameters<typeof selector>[0]),
    )
    mockList.mockResolvedValue(THREE_DIALOGUES)
    batchExportMock.mockImplementation(async (req) => ({
      exported: [`${req.document_ids[0]}.json`],
      failed: [],
      success: true,
    }))
  })

  it('coche 3 dialogues et affiche la progression Export batch : 1/3 … 3/3', async () => {
    const user = userEvent.setup()
    render(<UnityDialogueList onSelectDialogue={() => {}} selectedFilename={null} />)

    await screen.findByTestId('unity-dialogue-list')
    await user.click(screen.getByTestId('batch-select-all'))

    const checkboxes = screen.getAllByTestId('unity-dialogue-item-checkbox')
    expect(checkboxes).toHaveLength(3)
    checkboxes.forEach((cb) => expect(cb).toBeChecked())

    await user.click(screen.getByTestId('batch-export-start'))

    await waitFor(() => {
      expect(batchExportMock).toHaveBeenCalledTimes(3)
    })

    expect(screen.getByTestId('batch-export-summary')).toBeInTheDocument()
    expect(screen.getByTestId('batch-export-summary')).toHaveTextContent(
      'Export batch terminé : 3 dialogues exportés',
    )
  })

  it('persiste l’option Valider avant export dans localStorage', async () => {
    const user = userEvent.setup()
    render(<UnityDialogueList onSelectDialogue={() => {}} selectedFilename={null} />)

    await screen.findByTestId('batch-export-toolbar')
    await user.click(screen.getByTestId('batch-export-options'))

    const validateCheckbox = screen.getByTestId('batch-option-validate')
    expect(validateCheckbox).toBeChecked()
    await user.click(validateCheckbox)
    expect(validateCheckbox).not.toBeChecked()

    const stored = JSON.parse(
      localStorage.getItem('dialogueGenerator.batchExportOptions') ?? '{}',
    )
    expect(stored.validateBeforeExport).toBe(false)
  })

  it('arrête le batch en cours — résumé partiel annulé', async () => {
    const user = userEvent.setup()
    const pendingResolvers: Array<() => void> = []

    batchExportMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          pendingResolvers.push(() =>
            resolve({ exported: ['x.json'], failed: [], success: true }),
          )
        }),
    )

    render(<UnityDialogueList onSelectDialogue={() => {}} selectedFilename={null} />)
    await screen.findByTestId('unity-dialogue-list')
    await user.click(screen.getByTestId('batch-select-all'))
    await user.click(screen.getByTestId('batch-export-start'))

    await waitFor(() => {
      expect(pendingResolvers.length).toBeGreaterThanOrEqual(1)
    })

    pendingResolvers[0]()
    await waitFor(() => {
      expect(screen.getByTestId('batch-export-progress')).toHaveTextContent('2/3')
    })

    await user.click(screen.getByTestId('batch-export-stop'))
    pendingResolvers[1]()

    await waitFor(() => {
      expect(screen.getByTestId('batch-export-summary')).toHaveTextContent(/annulé/i)
    })

    expect(batchExportMock.mock.calls.length).toBe(2)
  })

  it('affiche la liste d’échecs et le bouton Réexporter les échecs', async () => {
    const user = userEvent.setup()
    batchExportMock
      .mockResolvedValueOnce({ exported: ['ok.json'], failed: [], success: true })
      .mockResolvedValueOnce({
        exported: [],
        failed: [{ id: 'bad_doc', errors: ['validation'] }],
        success: false,
      })

    render(<UnityDialogueList onSelectDialogue={() => {}} selectedFilename={null} />)
    await screen.findByTestId('unity-dialogue-list')

    const items = screen.getAllByTestId('unity-dialogue-item-checkbox')
    await user.click(items[0])
    await user.click(items[1])
    await user.click(screen.getByTestId('batch-export-start'))

    await waitFor(() => {
      expect(screen.getByTestId('batch-export-failures-list')).toBeInTheDocument()
    })

    const summary = screen.getByTestId('batch-export-summary')
    expect(within(summary).getByTestId('batch-export-retry-failures')).toBeInTheDocument()
  })

  it('bloque l’export batch si le dialogue ouvert a des modifications non sauvegardées', async () => {
    const user = userEvent.setup()
    useGraphStoreMock.mockImplementation((selector) =>
      selector({
        hasUnsavedChanges: true,
        documentId: 'doc_a',
        dialogueMetadata: {
          filename: 'doc_a.json',
          title: 'Dialogue A',
          node_count: 1,
          edge_count: 0,
        },
      } as Parameters<typeof selector>[0]),
    )

    render(<UnityDialogueList onSelectDialogue={() => {}} selectedFilename={null} />)
    await screen.findByTestId('unity-dialogue-list')
    await user.click(screen.getByTestId('batch-select-all'))
    await user.click(screen.getByTestId('batch-export-start'))

    await waitFor(() => {
      expect(batchExportMock).not.toHaveBeenCalled()
    })
  })
})
