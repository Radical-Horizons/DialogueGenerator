/**
 * Client API des profils d'auteur — objet serveur, comme les templates.
 */
import apiClient from './client'

export interface AuthorProfile {
  id: string
  name: string
  description: string
  content: string
  metadata: { created: string; modified: string }
  ownerId?: string | null
  visibility: 'shared' | 'private'
  relation?: 'owned' | 'team' | 'legacy' | null
}

export interface PrebuiltAuthorProfile {
  id: string
  name: string
  description: string
  content: string
}

export interface AuthorProfileCreate {
  name: string
  description?: string
  content?: string
  visibility?: 'shared' | 'private'
}

export interface AuthorProfileUpdate {
  name?: string
  description?: string
  content?: string
  visibility?: 'shared' | 'private'
}

const BASE = '/api/v1/author-profiles'

/** Profils visibles : les miens, plus ceux partagés par l'équipe. */
export async function listAuthorProfilesApi(): Promise<AuthorProfile[]> {
  const { data } = await apiClient.get<AuthorProfile[]>(BASE)
  return data
}

/** Voix fournies avec le projet, en lecture seule. */
export async function listPrebuiltAuthorProfilesApi(): Promise<PrebuiltAuthorProfile[]> {
  const { data } = await apiClient.get<PrebuiltAuthorProfile[]>(`${BASE}/prebuilt`)
  return data
}

export async function createAuthorProfileApi(body: AuthorProfileCreate): Promise<AuthorProfile> {
  const { data } = await apiClient.post<AuthorProfile>(BASE, body)
  return data
}

export async function updateAuthorProfileApi(
  id: string,
  body: AuthorProfileUpdate,
): Promise<AuthorProfile> {
  const { data } = await apiClient.put<AuthorProfile>(`${BASE}/${id}`, body)
  return data
}

export async function deleteAuthorProfileApi(id: string): Promise<void> {
  await apiClient.delete(`${BASE}/${id}`)
}
