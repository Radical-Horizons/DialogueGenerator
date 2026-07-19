/**
 * Client des préférences synchronisées du compte courant.
 */
import apiClient from './client'

export type UserSettingsNamespace = 'context' | 'generation'
export type UserSettingsMap = Record<string, unknown>
export type AllUserSettings = Partial<Record<UserSettingsNamespace, UserSettingsMap>>

export async function getAllUserSettings(): Promise<AllUserSettings> {
  const response = await apiClient.get<AllUserSettings>('/api/v1/users/me/settings')
  return response.data
}

export async function getUserSettingsNamespace(
  namespace: UserSettingsNamespace,
): Promise<UserSettingsMap> {
  const response = await apiClient.get<UserSettingsMap>(
    `/api/v1/users/me/settings/${namespace}`,
  )
  return response.data
}

export async function putUserSettingsNamespace(
  namespace: UserSettingsNamespace,
  settings: UserSettingsMap,
): Promise<UserSettingsMap> {
  const response = await apiClient.put<UserSettingsMap>(
    `/api/v1/users/me/settings/${namespace}`,
    settings,
  )
  return response.data
}
