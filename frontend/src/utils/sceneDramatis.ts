/**
 * Rôles PJ/PNJ Alteir — miroir de services/scene_dramatis.py
 */
export const PLAYABLE_CHARACTERS = [
  'Uresaïr',
  "L'Éthérée",
  'Vethraak',
  'Eonundé Alinen-Egan',
] as const

export type PlayableCharacter = (typeof PLAYABLE_CHARACTERS)[number]

export const DEFAULT_PLAYER_CHARACTER: PlayableCharacter = "L'Éthérée"

const FORBIDDEN_NPC_NAMES = ["L'Éthérée"]

function normalizeCharacterName(name: string): string {
  return name
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function isPlayableCharacter(name: string | null | undefined): boolean {
  if (!name?.trim()) return false
  const key = normalizeCharacterName(name)
  return PLAYABLE_CHARACTERS.some((p) => normalizeCharacterName(p) === key)
}

export function isForbiddenNpc(name: string | null | undefined): boolean {
  if (!name?.trim()) return false
  const key = normalizeCharacterName(name)
  return FORBIDDEN_NPC_NAMES.some((f) => normalizeCharacterName(f) === key)
}

export function isValidNpc(name: string | null | undefined, playerId: string): boolean {
  if (!name?.trim()) return false
  if (isForbiddenNpc(name)) return false
  if (normalizeCharacterName(name) === normalizeCharacterName(playerId)) return false
  return true
}

export function filterPlayableCharacterOptions(allCharacters: string[]): string[] {
  return allCharacters.filter((name) => isPlayableCharacter(name))
}

export function filterNpcCharacterOptions(allCharacters: string[], playerId: string | null): string[] {
  if (!playerId) {
    return allCharacters.filter((name) => !isForbiddenNpc(name))
  }
  return allCharacters.filter((name) => isValidNpc(name, playerId))
}

export function randomPlayableCharacter(exclude?: string | null): PlayableCharacter {
  const pool = PLAYABLE_CHARACTERS.filter(
    (name) => !exclude || normalizeCharacterName(name) !== normalizeCharacterName(exclude),
  )
  if (pool.length === 0) return DEFAULT_PLAYER_CHARACTER
  return pool[Math.floor(Math.random() * pool.length)]
}

export function randomNpcCharacter(allCharacters: string[], playerId: string): string | null {
  const pool = filterNpcCharacterOptions(allCharacters, playerId)
  if (pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

export interface SceneDramatis {
  playerCharacterId: string
  npcSpeakerId: string
}

export function resolveSceneDramatis(options: {
  playerCharacterId?: string | null
  npcSpeakerId?: string | null
  sceneProtagonists?: { personnage_a?: string; personnage_b?: string } | null
  contextCharacters?: string[]
}): SceneDramatis {
  const player =
    options.playerCharacterId ||
    options.sceneProtagonists?.personnage_a ||
    null
  const npc =
    options.npcSpeakerId ||
    options.sceneProtagonists?.personnage_b ||
    null

  const resolvedPlayer = player && isPlayableCharacter(player) ? player : DEFAULT_PLAYER_CHARACTER

  if (npc && isValidNpc(npc, resolvedPlayer)) {
    return { playerCharacterId: resolvedPlayer, npcSpeakerId: npc }
  }

  const playableNpc = PLAYABLE_CHARACTERS.find(
    (name) =>
      normalizeCharacterName(name) !== normalizeCharacterName(resolvedPlayer) &&
      isValidNpc(name, resolvedPlayer),
  )
  if (playableNpc) {
    return { playerCharacterId: resolvedPlayer, npcSpeakerId: playableNpc }
  }

  const fromContext = (options.contextCharacters ?? []).find((name) =>
    isValidNpc(name, resolvedPlayer),
  )
  if (fromContext) {
    return { playerCharacterId: resolvedPlayer, npcSpeakerId: fromContext }
  }

  return { playerCharacterId: resolvedPlayer, npcSpeakerId: 'PNJ' }
}

export function sceneHasLocation(selection: {
  sceneRegion?: string | null
  subLocation?: string | null
  locationsFull?: string[]
  locationsExcerpt?: string[]
}): boolean {
  if (selection.sceneRegion || selection.subLocation) return true
  if ((selection.locationsFull?.length ?? 0) > 0) return true
  if ((selection.locationsExcerpt?.length ?? 0) > 0) return true
  return false
}

export function resolveDramatisFromSelections(options: {
  sceneSelection?: { characterA: string | null; characterB: string | null } | null
  sceneProtagonists?: { personnage_a?: string; personnage_b?: string } | null
  contextCharacters?: string[]
}): SceneDramatis {
  return resolveSceneDramatis({
    playerCharacterId:
      options.sceneSelection?.characterA ?? options.sceneProtagonists?.personnage_a,
    npcSpeakerId:
      options.sceneSelection?.characterB ?? options.sceneProtagonists?.personnage_b,
    sceneProtagonists: options.sceneProtagonists,
    contextCharacters: options.contextCharacters,
  })
}
