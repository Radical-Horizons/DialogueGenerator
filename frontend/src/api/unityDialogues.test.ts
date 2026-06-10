import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./client', () => ({
  default: {
    get: vi.fn(),
    delete: vi.fn(),
  },
}))

import apiClient from './client'
import { deleteUnityDialogue, getUnityDialogue } from './unityDialogues'

describe('unityDialogues API client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('URL-encodes filenames used as path segments', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { filename: 'A #1.json', json_content: '[]' },
    } as Awaited<ReturnType<typeof apiClient.get>>)

    await getUnityDialogue('A #1.json')
    await deleteUnityDialogue('A #1.json')

    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/unity-dialogues/A%20%231.json')
    expect(apiClient.delete).toHaveBeenCalledWith('/api/v1/unity-dialogues/A%20%231.json')
  })
})
