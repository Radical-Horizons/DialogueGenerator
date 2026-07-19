import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getAllUserSettings,
  putUserSettingsNamespace,
} from '../api/userSettings'
import {
  registerContextSettingsAdapter,
  resetUserSettingsSync,
  SETTINGS_OWNER_STORAGE_KEY,
  subscribeUserSettingsHydration,
  synchronizeUserSettings,
  USER_SETTING_STORAGE_KEYS,
} from './useUserSettingsSync'
import type { UserResponse } from '../types/api'

vi.mock('../api/userSettings', () => ({
  getAllUserSettings: vi.fn(),
  putUserSettingsNamespace: vi.fn(),
}))

const writer: UserResponse = {
  id: 'writer-id',
  username: 'writer',
  role: 'writer',
  is_active: true,
}

describe('user settings synchronization', () => {
  let hydratedContext: unknown
  let localContext: unknown

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    resetUserSettingsSync()
    hydratedContext = undefined
    localContext = undefined
    registerContextSettingsAdapter({
      readLocal: () => localContext,
      hydrate: (value) => {
        hydratedContext = value
      },
    })
  })

  it('hydrate le cache et les adapters avec le serveur prioritaire', async () => {
    const listener = vi.fn()
    const unsubscribe = subscribeUserSettingsHydration(listener)
    vi.mocked(getAllUserSettings).mockResolvedValue({
      context: { config: { organization: 'minimal' } },
      generation: {
        author_profile: 'Profil serveur',
        draft: { prompt: 'serveur' },
        slop_detection: { include_repetitions: false },
      },
    })

    await synchronizeUserSettings(writer)

    expect(hydratedContext).toEqual({ organization: 'minimal' })
    expect(localStorage.getItem(USER_SETTING_STORAGE_KEYS.authorProfile)).toBe(
      'Profil serveur',
    )
    expect(JSON.parse(localStorage.getItem(USER_SETTING_STORAGE_KEYS.draft) ?? '')).toEqual({
      prompt: 'serveur',
    })
    expect(listener).toHaveBeenCalledOnce()
    expect(putUserSettingsNamespace).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('migre seulement les clés absentes du serveur', async () => {
    localContext = { organization: 'narrative' }
    localStorage.setItem(USER_SETTING_STORAGE_KEYS.authorProfile, 'Profil local')
    localStorage.setItem(
      USER_SETTING_STORAGE_KEYS.draft,
      JSON.stringify({ prompt: 'local' }),
    )
    localStorage.setItem(
      USER_SETTING_STORAGE_KEYS.slopDetection,
      JSON.stringify({ include_repetitions: true }),
    )
    vi.mocked(getAllUserSettings).mockResolvedValue({
      generation: { author_profile: 'Profil serveur' },
    })
    vi.mocked(putUserSettingsNamespace).mockResolvedValue({})

    await synchronizeUserSettings(writer)

    expect(putUserSettingsNamespace).toHaveBeenCalledWith('context', {
      config: { organization: 'narrative' },
    })
    expect(putUserSettingsNamespace).toHaveBeenCalledWith('generation', {
      draft: { prompt: 'local' },
      slop_detection: { include_repetitions: true },
    })
    expect(localStorage.getItem(USER_SETTING_STORAGE_KEYS.authorProfile)).toBe(
      'Profil serveur',
    )
  })

  it('ne pousse rien pour un compte neuf sans cache local', async () => {
    vi.mocked(getAllUserSettings).mockResolvedValue({})

    await synchronizeUserSettings(writer)

    expect(putUserSettingsNamespace).not.toHaveBeenCalled()
  })

  it('ignore les guests et le faux admin Vite', async () => {
    await synchronizeUserSettings({ ...writer, id: 'guest', role: 'guest' })
    await synchronizeUserSettings({
      ...writer,
      id: '1',
      username: 'admin',
      role: 'admin',
    })

    expect(getAllUserSettings).not.toHaveBeenCalled()
  })

  it('ne migre pas le localStorage d’un autre compte', async () => {
    localStorage.setItem(SETTINGS_OWNER_STORAGE_KEY, 'other-user')
    localContext = { organization: 'narrative' }
    localStorage.setItem(USER_SETTING_STORAGE_KEYS.authorProfile, 'Profil local')
    vi.mocked(getAllUserSettings).mockResolvedValue({})

    await synchronizeUserSettings(writer)

    expect(putUserSettingsNamespace).not.toHaveBeenCalled()
    expect(localStorage.getItem(USER_SETTING_STORAGE_KEYS.authorProfile)).toBeNull()
    expect(localStorage.getItem(SETTINGS_OWNER_STORAGE_KEY)).toBe('writer-id')
  })

  it('désactive les PUT après un échec GET', async () => {
    vi.mocked(getAllUserSettings).mockRejectedValue(new Error('network'))

    await synchronizeUserSettings(writer)

    const { queueUserSettingUpdate } = await import('./useUserSettingsSync')
    queueUserSettingUpdate('generation', 'author_profile', 'x')
    expect(putUserSettingsNamespace).not.toHaveBeenCalled()
  })
})
