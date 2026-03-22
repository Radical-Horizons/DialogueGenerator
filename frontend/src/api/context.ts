/**
 * API client pour le contexte GDD (personnages, lieux, objets).
 */
import apiClient from './client'
import type {
  CharacterResponse,
  CharacterListResponse,
  LocationResponse,
  LocationListResponse,
  ItemResponse,
  ItemListResponse,
  SpeciesResponse,
  SpeciesListResponse,
  CommunityResponse,
  CommunityListResponse,
  RegionListResponse,
  SubLocationListResponse,
  LinkedElementsRequest,
  LinkedElementsResponse,
  SuggestionsRequest,
  SuggestionsResponse,
} from '../types/api'

export interface ListContextParams {
  page?: number
  page_size?: number
}

/**
 * Liste les personnages disponibles (avec pagination optionnelle).
 */
export async function listCharacters(params?: ListContextParams): Promise<CharacterListResponse> {
  const searchParams = new URLSearchParams()
  if (params?.page != null) searchParams.set('page', String(params.page))
  if (params?.page_size != null) searchParams.set('page_size', String(params.page_size))
  const query = searchParams.toString()
  const url = query ? `/api/v1/context/characters?${query}` : '/api/v1/context/characters'
  const response = await apiClient.get<CharacterListResponse>(url)
  return response.data
}

/**
 * Récupère un personnage par son nom.
 */
export async function getCharacter(name: string): Promise<CharacterResponse> {
  const response = await apiClient.get<CharacterResponse>(`/api/v1/context/characters/${encodeURIComponent(name)}`)
  return response.data
}

/**
 * Liste les lieux disponibles (avec pagination optionnelle).
 */
export async function listLocations(params?: ListContextParams): Promise<LocationListResponse> {
  const searchParams = new URLSearchParams()
  if (params?.page != null) searchParams.set('page', String(params.page))
  if (params?.page_size != null) searchParams.set('page_size', String(params.page_size))
  const query = searchParams.toString()
  const url = query ? `/api/v1/context/locations?${query}` : '/api/v1/context/locations'
  const response = await apiClient.get<LocationListResponse>(url)
  return response.data
}

/**
 * Récupère un lieu par son nom.
 */
export async function getLocation(name: string): Promise<LocationResponse> {
  const response = await apiClient.get<LocationResponse>(`/api/v1/context/locations/${encodeURIComponent(name)}`)
  return response.data
}

/**
 * Liste les objets disponibles (avec pagination optionnelle).
 */
export async function listItems(params?: ListContextParams): Promise<ItemListResponse> {
  const searchParams = new URLSearchParams()
  if (params?.page != null) searchParams.set('page', String(params.page))
  if (params?.page_size != null) searchParams.set('page_size', String(params.page_size))
  const query = searchParams.toString()
  const url = query ? `/api/v1/context/items?${query}` : '/api/v1/context/items'
  const response = await apiClient.get<ItemListResponse>(url)
  return response.data
}

/**
 * Récupère un objet par son nom.
 */
export async function getItem(name: string): Promise<ItemResponse> {
  const response = await apiClient.get<ItemResponse>(
    `/api/v1/context/items/${encodeURIComponent(name)}`
  )
  return response.data
}

/**
 * Liste toutes les espèces disponibles.
 */
export async function listSpecies(): Promise<SpeciesListResponse> {
  const response = await apiClient.get<SpeciesListResponse>('/api/v1/context/species')
  return response.data
}

/**
 * Récupère une espèce par son nom.
 */
export async function getSpecies(name: string): Promise<SpeciesResponse> {
  const response = await apiClient.get<SpeciesResponse>(`/api/v1/context/species/${encodeURIComponent(name)}`)
  return response.data
}

/**
 * Liste les communautés disponibles (avec pagination optionnelle).
 */
export async function listCommunities(params?: ListContextParams): Promise<CommunityListResponse> {
  const searchParams = new URLSearchParams()
  if (params?.page != null) searchParams.set('page', String(params.page))
  if (params?.page_size != null) searchParams.set('page_size', String(params.page_size))
  const query = searchParams.toString()
  const url = query ? `/api/v1/context/communities?${query}` : '/api/v1/context/communities'
  const response = await apiClient.get<CommunityListResponse>(url)
  return response.data
}

/**
 * Récupère une communauté par son nom.
 */
export async function getCommunity(name: string): Promise<CommunityResponse> {
  const response = await apiClient.get<CommunityResponse>(`/api/v1/context/communities/${encodeURIComponent(name)}`)
  return response.data
}

/**
 * Liste toutes les régions disponibles.
 */
export async function listRegions(): Promise<RegionListResponse> {
  const response = await apiClient.get<RegionListResponse>('/api/v1/context/locations/regions')
  return response.data
}

/**
 * Récupère les sous-lieux d'une région.
 */
export async function getSubLocations(regionName: string): Promise<SubLocationListResponse> {
  const response = await apiClient.get<SubLocationListResponse>(
    `/api/v1/context/locations/regions/${encodeURIComponent(regionName)}/sub-locations`
  )
  return response.data
}

/**
 * Suggère des éléments liés à partir de personnages et lieux.
 */
export async function getLinkedElements(request: LinkedElementsRequest): Promise<LinkedElementsResponse> {
  const response = await apiClient.post<LinkedElementsResponse>('/api/v1/context/linked-elements', request)
  return response.data
}

/**
 * Retourne des suggestions d'entités GDD liées à l'entité trigger (sélection automatique basée sur règles).
 */
export async function getSuggestions(request: SuggestionsRequest): Promise<SuggestionsResponse> {
  const response = await apiClient.post<SuggestionsResponse>('/api/v1/context/suggestions', request)
  return response.data
}

