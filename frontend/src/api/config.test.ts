import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./client', () => ({
  default: {
    get: vi.fn(),
  },
}))

import apiClient from './client'
import { getDefaultSystemPrompt } from './config'

describe('config API client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls the backend endpoint for the default system prompt', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { prompt: 'Prompt backend' },
    } as Awaited<ReturnType<typeof apiClient.get>>)

    await expect(getDefaultSystemPrompt()).resolves.toEqual({
      prompt: 'Prompt backend',
    })
    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/config/default-system-prompt')
  })

  it('normalizes legacy payloads that still use system_prompt', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { system_prompt: 'Prompt legacy' },
    } as Awaited<ReturnType<typeof apiClient.get>>)

    await expect(getDefaultSystemPrompt()).resolves.toEqual({
      prompt: 'Prompt legacy',
    })
  })

  it('throws when the payload does not contain a prompt', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {},
    } as Awaited<ReturnType<typeof apiClient.get>>)

    await expect(getDefaultSystemPrompt()).rejects.toThrow(
      'La réponse API ne contient pas de prompt par défaut'
    )
  })
})
