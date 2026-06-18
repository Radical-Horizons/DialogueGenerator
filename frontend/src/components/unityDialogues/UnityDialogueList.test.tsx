/**
 * Liste Unity — layout compact + typo titre explicite (plan liste responsive).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as unityDialoguesAPI from '../../api/unityDialogues'
import * as dialoguesAPI from '../../api/dialogues'
import { UnityDialogueList } from './UnityDialogueList'

vi.mock('../../api/unityDialogues', () => ({
  listUnityDialogues: vi.fn(),
}))

vi.mock('../../api/dialogues', () => ({
  validateDocumentSchema: vi.fn(),
  batchExportUnityDialogues: vi.fn(),
}))

const mockList = vi.mocked(unityDialoguesAPI.listUnityDialogues)
const mockValidateDocumentSchema = vi.mocked(dialoguesAPI.validateDocumentSchema)

describe('UnityDialogueList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList.mockResolvedValue({
      dialogues: [
        {
          filename: 'test_dialogue.json',
          file_path: '/data/test_dialogue.json',
          modified_time: '2026-04-08T12:00:00.000Z',
          size_bytes: 1024,
          title: 'Titre API',
        },
      ],
      total: 1,
    })
  })

  it('applique une fontSize explicite au titre dans un conteneur étroit (régression héritage 16px)', async () => {
    render(
      <div style={{ width: 360 }}>
        <UnityDialogueList onSelectDialogue={() => {}} selectedFilename={null} />
      </div>
    )

    await waitFor(() => {
      expect(screen.getByTestId('unity-dialogue-list')).toBeInTheDocument()
    })

    const titleEl = screen.getByTestId('unity-dialogue-item-title')
    expect(titleEl).toHaveStyle({ fontSize: '0.8rem' })
    expect(titleEl).toHaveTextContent('Titre API')
  })

  it('ouvre un menu contextuel au clic droit avec supprimer le dialogue', async () => {
    const user = userEvent.setup()
    render(<UnityDialogueList onSelectDialogue={() => {}} selectedFilename={null} />)

    const item = await screen.findByTestId('unity-dialogue-item')
    await user.pointer({ keys: '[MouseRight>]', target: item })
    await user.pointer({ keys: '[/MouseRight]' })

    expect(screen.getByTestId('dialogue-list-context-menu')).toBeInTheDocument()
    expect(screen.getByTestId('dialogue-list-context-delete')).toHaveTextContent(
      'Supprimer le dialogue',
    )
    expect(screen.getByTestId('dialogue-list-context-validate-schema')).toHaveTextContent(
      'Valider le schéma Unity',
    )
  })

  it('lance validateDocumentSchema depuis le menu contextuel', async () => {
    const user = userEvent.setup()
    mockValidateDocumentSchema.mockResolvedValue({
      is_valid: true,
      errors: [],
      error_count: 0,
      warnings: [],
      structured_errors: [],
    })
    render(<UnityDialogueList onSelectDialogue={() => {}} selectedFilename={null} />)

    const item = await screen.findByTestId('unity-dialogue-item')
    await user.pointer({ keys: '[MouseRight>]', target: item })
    await user.pointer({ keys: '[/MouseRight]' })
    await user.click(screen.getByTestId('dialogue-list-context-validate-schema'))

    await waitFor(() => {
      expect(mockValidateDocumentSchema).toHaveBeenCalledWith('test_dialogue')
    })
    expect(screen.getByTestId('schema-validation-panel')).toBeInTheDocument()
  })

  it('compare la sélection avec ou sans extension .json', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<UnityDialogueList onSelectDialogue={onSelect} selectedFilename="test_dialogue" />)

    const item = await screen.findByTestId('unity-dialogue-item')
    expect(item).toHaveAttribute('aria-pressed', 'true')

    await user.click(item.querySelector('button') ?? item)
    expect(onSelect).toHaveBeenCalledWith(null)
  })
})
