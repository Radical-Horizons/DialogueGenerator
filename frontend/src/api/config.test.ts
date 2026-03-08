import { beforeEach, describe, expect, it, vi } from 'vitest'
import apiClient from './client'
import { getDefaultSystemPrompt } from './config'

vi.mock('./client', () => ({
  default: {
    get: vi.fn(),
  },
}))

describe('config API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches the default system prompt from the backend endpoint', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        prompt: 'Prompt backend',
      },
    } as Awaited<ReturnType<typeof apiClient.get>>)

    const result = await getDefaultSystemPrompt()

    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/config/default-system-prompt')
    expect(result).toEqual({ prompt: 'Prompt backend' })
  })
})
