import { describe, expect, it } from 'vitest'
import { titleToDocumentId } from './formatDialogueTitle'

describe('titleToDocumentId', () => {
  it('normalise un titre FR en documentId stable', () => {
    expect(titleToDocumentId('Rencontre à Uresaïr')).toBe('rencontre_a_uresair')
  })

  it('retourne vide si aucun caractère utilisable', () => {
    expect(titleToDocumentId('!!!')).toBe('')
  })
})
