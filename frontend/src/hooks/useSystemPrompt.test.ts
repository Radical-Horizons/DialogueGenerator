import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

vi.mock('../api/config', () => ({
  getDefaultSystemPrompt: vi.fn(),
}))

import * as configAPI from '../api/config'
import { useSystemPrompt } from './useSystemPrompt'

describe('useSystemPrompt', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('loads the backend default prompt on mount', async () => {
    vi.mocked(configAPI.getDefaultSystemPrompt).mockResolvedValue({
      prompt: 'Prompt backend',
    })

    const { result } = renderHook(() => useSystemPrompt())

    await waitFor(() => {
      expect(result.current.systemPrompt).toBe('Prompt backend')
    })

    expect(result.current.defaultPrompt).toBe('Prompt backend')
    expect(result.current.savedPrompt).toBeNull()
    expect(result.current.error).toBeNull()
    expect(configAPI.getDefaultSystemPrompt).toHaveBeenCalledTimes(1)
  })

  it('keeps the saved prompt when one exists locally', async () => {
    localStorage.setItem('dialogue_generator_saved_system_prompt', 'Prompt sauvegarde')
    vi.mocked(configAPI.getDefaultSystemPrompt).mockResolvedValue({
      prompt: 'Prompt backend',
    })

    const { result } = renderHook(() => useSystemPrompt())

    await waitFor(() => {
      expect(result.current.systemPrompt).toBe('Prompt sauvegarde')
    })

    expect(result.current.defaultPrompt).toBe('Prompt backend')
    expect(result.current.savedPrompt).toBe('Prompt sauvegarde')
  })

  it('restores the cached default prompt without a second API call', async () => {
    vi.mocked(configAPI.getDefaultSystemPrompt).mockResolvedValue({
      prompt: 'Prompt backend',
    })

    const { result } = renderHook(() => useSystemPrompt())

    await waitFor(() => {
      expect(result.current.defaultPrompt).toBe('Prompt backend')
    })

    act(() => {
      result.current.updatePrompt('Prompt personnalise')
    })

    vi.mocked(configAPI.getDefaultSystemPrompt).mockClear()

    let restoredPrompt = ''
    await act(async () => {
      restoredPrompt = await result.current.restore()
    })

    expect(restoredPrompt).toBe('Prompt backend')
    expect(result.current.systemPrompt).toBe('Prompt backend')
    expect(configAPI.getDefaultSystemPrompt).not.toHaveBeenCalled()
  })

  it('surfaces an explicit error when the backend request fails', async () => {
    vi.mocked(configAPI.getDefaultSystemPrompt).mockRejectedValue(new Error('boom'))

    const { result } = renderHook(() => useSystemPrompt())

    await waitFor(() => {
      expect(result.current.error).toBe('Erreur lors du chargement du prompt par défaut')
    })

    expect(result.current.systemPrompt).toBe('')
    expect(result.current.isLoading).toBe(false)
  })
})
