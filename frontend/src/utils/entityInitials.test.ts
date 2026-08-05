/**
 * Initiales des puces de rail (écran 2c).
 */
import { describe, it, expect } from 'vitest'
import { entityInitials } from './entityInitials'

describe('entityInitials', () => {
  it('prend les initiales des mots pour un nom composé', () => {
    expect(entityInitials('Le Cloître Perforé')).toBe('LCP')
    // L'apostrophe ne coupe pas le mot : « T'vok » compte pour un.
    expect(entityInitials('Grish T’vok')).toBe('GT')
  })

  it('prend les deux premières lettres pour un nom d’un seul mot', () => {
    expect(entityInitials('Uresaïr')).toBe('UR')
  })

  it('se limite à trois initiales', () => {
    expect(entityInitials('Anelis Halimar des Hauts Lampistes')).toBe('AHD')
  })

  it('ignore la ponctuation et les chaînes vides', () => {
    expect(entityInitials('   ')).toBe('?')
    expect(entityInitials('---')).toBe('?')
  })
})
