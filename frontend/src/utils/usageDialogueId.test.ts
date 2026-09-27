import { describe, it, expect } from 'vitest'
import { usageDialogueId } from './usageDialogueId'

describe('usageDialogueId', () => {
  it("retire l'extension .json du nom de fichier", () => {
    expect(usageDialogueId('le_juge_mendiant.json')).toBe('le_juge_mendiant')
  })

  it('laisse intact un identifiant déjà sans extension', () => {
    expect(usageDialogueId('le_juge_mendiant')).toBe('le_juge_mendiant')
  })

  it("ne retire l'extension qu'en fin de nom", () => {
    expect(usageDialogueId('scene.json.backup')).toBe('scene.json.backup')
  })
})
