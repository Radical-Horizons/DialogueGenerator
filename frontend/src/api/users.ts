/**
 * Client typé des opérations administratives sur les comptes.
 */
import apiClient from './client'
import type {
  UserCreateRequest,
  UserResponse,
  UserUpdateRequest,
} from '../types/api'

export async function listUsers(): Promise<UserResponse[]> {
  const response = await apiClient.get<UserResponse[]>('/api/v1/users')
  return response.data
}

export async function createUser(
  payload: UserCreateRequest,
): Promise<UserResponse> {
  const response = await apiClient.post<UserResponse>('/api/v1/users', payload)
  return response.data
}

export async function updateUser(
  userId: string,
  payload: UserUpdateRequest,
): Promise<UserResponse> {
  const response = await apiClient.patch<UserResponse>(
    `/api/v1/users/${encodeURIComponent(userId)}`,
    payload,
  )
  return response.data
}
