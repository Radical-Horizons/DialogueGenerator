import { beforeEach, describe, expect, it, vi } from 'vitest'

import apiClient from './client'
import {
  getAllUserSettings,
  getUserSettingsNamespace,
  putUserSettingsNamespace,
} from './userSettings'

vi.mock('./client', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}))

describe('userSettings API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lit toutes les préférences', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { context: { config: { organization: 'minimal' } } },
    })

    await expect(getAllUserSettings()).resolves.toEqual({
      context: { config: { organization: 'minimal' } },
    })
    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/users/me/settings')
  })

  it('lit et fusionne un namespace', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { author_profile: 'concis' },
    })
    vi.mocked(apiClient.put).mockResolvedValue({
      data: { author_profile: 'lyrique' },
    })

    await expect(getUserSettingsNamespace('generation')).resolves.toEqual({
      author_profile: 'concis',
    })
    await expect(
      putUserSettingsNamespace('generation', { author_profile: 'lyrique' }),
    ).resolves.toEqual({ author_profile: 'lyrique' })
    expect(apiClient.put).toHaveBeenCalledWith(
      '/api/v1/users/me/settings/generation',
      { author_profile: 'lyrique' },
    )
  })
})
