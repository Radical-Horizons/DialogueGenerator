import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PLAYER_CHARACTER,
  filterNpcCharacterOptions,
  filterPlayableCharacterOptions,
  isForbiddenNpc,
  isPlayableCharacter,
  isValidNpc,
  resolveSceneDramatis,
} from './sceneDramatis'

describe('sceneDramatis', () => {
  it('recognizes playable characters including L’Éthérée', () => {
    expect(isPlayableCharacter("L'Éthérée")).toBe(true)
    expect(isPlayableCharacter('Uresaïr')).toBe(true)
  })

  it('forbids L’Éthérée as NPC', () => {
    expect(isForbiddenNpc("L'Éthérée")).toBe(true)
    expect(isValidNpc("L'Éthérée", 'Uresaïr')).toBe(false)
  })

  it('allows other playable as NPC', () => {
    expect(isValidNpc('Uresaïr', "L'Éthérée")).toBe(true)
    expect(isValidNpc('Vethraak', 'Uresaïr')).toBe(true)
  })

  it('filters combobox options', () => {
    const all = ["L'Éthérée", 'Uresaïr', 'Akthar-Neth']
    expect(filterPlayableCharacterOptions(all)).toEqual(["L'Éthérée", 'Uresaïr'])
    expect(filterNpcCharacterOptions(all, "L'Éthérée")).toEqual(['Uresaïr', 'Akthar-Neth'])
  })

  it('defaults player to L’Éthérée', () => {
    const dramatis = resolveSceneDramatis({})
    expect(dramatis.playerCharacterId).toBe(DEFAULT_PLAYER_CHARACTER)
  })
})
