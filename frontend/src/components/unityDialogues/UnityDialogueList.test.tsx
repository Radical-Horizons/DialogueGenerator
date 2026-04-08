/**
 * Liste Unity — layout compact + typo titre explicite (plan liste responsive).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import * as unityDialoguesAPI from '../../api/unityDialogues'
import { UnityDialogueList } from './UnityDialogueList'

vi.mock('../../api/unityDialogues', () => ({
  listUnityDialogues: vi.fn(),
}))

const mockList = vi.mocked(unityDialoguesAPI.listUnityDialogues)

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
    expect(titleEl).toHaveStyle({ fontSize: '0.82rem' })
  })
})
