/**
 * Orchestration de la source de vérité serveur pour les préférences utilisateur.
 */
import type { UserResponse } from '../types/api'
import {
  getAllUserSettings,
  putUserSettingsNamespace,
  type AllUserSettings,
  type UserSettingsMap,
  type UserSettingsNamespace,
} from '../api/userSettings'
import { normalizeModelId } from '../constants'

export const USER_SETTING_STORAGE_KEYS = {
  context: 'context_config_store',
  authorProfile: 'dialogue_generator_saved_author_profile',
  draft: 'generation_draft',
  slopDetection: 'dialogueGenerator.aiSlopDetection.v1',
} as const

/** Trace le dernier compte synchronisé pour éviter une migrate cross-account. */
export const SETTINGS_OWNER_STORAGE_KEY = 'dialogue_generator_settings_owner'

type GenerationSettingKey = 'author_profile' | 'draft' | 'slop_detection'
type SettingKey = 'config' | GenerationSettingKey
type HydrationListener = (settings: AllUserSettings) => void

interface ContextSettingsAdapter {
  readLocal: () => unknown | undefined
  hydrate: (value: unknown) => void
  waitForLocalRehydrate?: () => Promise<void>
}

const DEBOUNCE_MS = 500
const listeners = new Set<HydrationListener>()
const pendingUpdates: Partial<Record<UserSettingsNamespace, UserSettingsMap>> = {}
const debounceTimers: Partial<
  Record<UserSettingsNamespace, ReturnType<typeof setTimeout>>
> = {}
let activeAccountId: string | null = null
let hydrationInProgress = false
let contextAdapter: ContextSettingsAdapter | null = null
let pendingContextHydration: unknown | undefined
let syncGeneration = 0

export function isUserSettingsSyncEligible(user: UserResponse | null): user is UserResponse {
  return Boolean(user && user.role !== 'guest')
}

export function registerContextSettingsAdapter(adapter: ContextSettingsAdapter): void {
  contextAdapter = adapter
  if (pendingContextHydration !== undefined) {
    hydrationInProgress = true
    adapter.hydrate(pendingContextHydration)
    hydrationInProgress = false
    pendingContextHydration = undefined
  }
}

export function subscribeUserSettingsHydration(
  listener: HydrationListener,
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function readJsonStorage(key: string): unknown | undefined {
  const raw = localStorage.getItem(key)
  if (raw === null) return undefined
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readLocalSetting(
  namespace: UserSettingsNamespace,
  key: SettingKey,
): unknown | undefined {
  if (namespace === 'context' && key === 'config') {
    return contextAdapter?.readLocal()
  }
  if (key === 'author_profile') {
    const value = localStorage.getItem(USER_SETTING_STORAGE_KEYS.authorProfile)
    return value === null ? undefined : value
  }
  if (key === 'draft') {
    return readJsonStorage(USER_SETTING_STORAGE_KEYS.draft)
  }
  if (key === 'slop_detection') {
    return readJsonStorage(USER_SETTING_STORAGE_KEYS.slopDetection)
  }
  return undefined
}

function cacheServerSettings(settings: AllUserSettings): Record<string, unknown> | null {
  const contextConfig = settings.context?.config
  if (contextConfig !== undefined) {
    if (contextAdapter) {
      contextAdapter.hydrate(contextConfig)
    } else {
      pendingContextHydration = contextConfig
    }
  }
  const authorProfile = settings.generation?.author_profile
  if (typeof authorProfile === 'string') {
    localStorage.setItem(USER_SETTING_STORAGE_KEYS.authorProfile, authorProfile)
  }
  const draft = settings.generation?.draft
  let migratedDraft: Record<string, unknown> | null = null
  if (isPlainObject(draft)) {
    const rawModel = draft.llmModel
    if (typeof rawModel === 'string' && rawModel !== 'unknown') {
      const normalizedModel = normalizeModelId(rawModel)
      if (normalizedModel !== rawModel) {
        migratedDraft = { ...draft, llmModel: normalizedModel, timestamp: Date.now() }
        localStorage.setItem(USER_SETTING_STORAGE_KEYS.draft, JSON.stringify(migratedDraft))
      } else {
        localStorage.setItem(USER_SETTING_STORAGE_KEYS.draft, JSON.stringify(draft))
      }
    } else {
      localStorage.setItem(USER_SETTING_STORAGE_KEYS.draft, JSON.stringify(draft))
    }
  }
  const slopDetection = settings.generation?.slop_detection
  if (isPlainObject(slopDetection)) {
    localStorage.setItem(
      USER_SETTING_STORAGE_KEYS.slopDetection,
      JSON.stringify(slopDetection),
    )
  }
  return migratedDraft
}

function canMigrateLocalSettings(userId: string): boolean {
  const owner = localStorage.getItem(SETTINGS_OWNER_STORAGE_KEY)
  return owner === null || owner === userId
}

function clearForeignAccountLocalCaches(userId: string): void {
  const owner = localStorage.getItem(SETTINGS_OWNER_STORAGE_KEY)
  if (owner === null || owner === userId) return
  localStorage.removeItem(USER_SETTING_STORAGE_KEYS.authorProfile)
  localStorage.removeItem(USER_SETTING_STORAGE_KEYS.draft)
  localStorage.removeItem(USER_SETTING_STORAGE_KEYS.slopDetection)
  localStorage.removeItem(USER_SETTING_STORAGE_KEYS.context)
}

async function migrateMissingSettings(
  userId: string,
  server: AllUserSettings,
): Promise<void> {
  if (!canMigrateLocalSettings(userId)) return
  const missingByNamespace: AllUserSettings = {}
  const candidateKeys: Record<UserSettingsNamespace, SettingKey[]> = {
    context: ['config'],
    generation: ['author_profile', 'draft', 'slop_detection'],
  }
  for (const namespace of ['context', 'generation'] as const) {
    for (const key of candidateKeys[namespace]) {
      if (server[namespace]?.[key] !== undefined) continue
      const localValue = readLocalSetting(namespace, key)
      if (localValue === undefined) continue
      missingByNamespace[namespace] ??= {}
      missingByNamespace[namespace]![key] = localValue
    }
  }
  for (const namespace of ['context', 'generation'] as const) {
    const payload = missingByNamespace[namespace]
    if (!payload) continue
    try {
      await putUserSettingsNamespace(namespace, payload)
    } catch (error) {
      console.warn(`Migration des préférences ${namespace} impossible:`, error)
    }
  }
}

function flushPendingUpdatesBestEffort(accountId: string | null): void {
  for (const namespace of ['context', 'generation'] as const) {
    const timer = debounceTimers[namespace]
    if (timer) clearTimeout(timer)
    delete debounceTimers[namespace]
    const update = pendingUpdates[namespace]
    delete pendingUpdates[namespace]
    if (!update || !accountId) continue
    void putUserSettingsNamespace(namespace, update).catch((error: unknown) => {
      console.warn(`Flush des préférences ${namespace} impossible:`, error)
    })
  }
}

export async function synchronizeUserSettings(user: UserResponse): Promise<void> {
  if (!isUserSettingsSyncEligible(user)) {
    resetUserSettingsSync()
    return
  }
  const generation = ++syncGeneration
  activeAccountId = user.id
  hydrationInProgress = true
  let migratedDraft: Record<string, unknown> | null = null
  try {
    if (contextAdapter?.waitForLocalRehydrate) {
      await contextAdapter.waitForLocalRehydrate()
    }
    if (generation !== syncGeneration || activeAccountId !== user.id) return
    clearForeignAccountLocalCaches(user.id)
    const server = await getAllUserSettings()
    if (generation !== syncGeneration || activeAccountId !== user.id) return
    migratedDraft = cacheServerSettings(server)
    for (const listener of listeners) listener(server)
    await migrateMissingSettings(user.id, server)
    if (generation !== syncGeneration || activeAccountId !== user.id) return
    localStorage.setItem(SETTINGS_OWNER_STORAGE_KEY, user.id)
  } catch (error) {
    console.warn('Synchronisation des préférences utilisateur impossible:', error)
    if (generation === syncGeneration) {
      activeAccountId = null
    }
  } finally {
    if (generation === syncGeneration) {
      hydrationInProgress = false
    }
  }
  if (
    migratedDraft
    && generation === syncGeneration
    && activeAccountId === user.id
  ) {
    queueUserSettingUpdate('generation', 'draft', migratedDraft)
  }
}

export function queueUserSettingUpdate(
  namespace: UserSettingsNamespace,
  key: SettingKey,
  value: unknown,
): void {
  if (!activeAccountId || hydrationInProgress) return
  pendingUpdates[namespace] = {
    ...(pendingUpdates[namespace] ?? {}),
    [key]: value,
  }
  const existingTimer = debounceTimers[namespace]
  if (existingTimer) clearTimeout(existingTimer)
  debounceTimers[namespace] = setTimeout(() => {
    const update = pendingUpdates[namespace]
    delete pendingUpdates[namespace]
    delete debounceTimers[namespace]
    if (!update || !activeAccountId) return
    void putUserSettingsNamespace(namespace, update).catch((error: unknown) => {
      console.warn(`Sauvegarde des préférences ${namespace} impossible:`, error)
      pendingUpdates[namespace] = {
        ...(pendingUpdates[namespace] ?? {}),
        ...update,
      }
    })
  }, DEBOUNCE_MS)
}

export function resetUserSettingsSync(): void {
  syncGeneration += 1
  const accountId = activeAccountId
  flushPendingUpdatesBestEffort(accountId)
  activeAccountId = null
  hydrationInProgress = false
  pendingContextHydration = undefined
}
