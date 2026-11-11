import { describe, expect, it } from 'vitest'
import {
  dialogueDocumentId,
  normalizeDialogueFilenameKey,
  titleToDocumentId,
} from './formatDialogueTitle'

describe('titleToDocumentId', () => {
  it('normalise un titre FR en documentId stable', () => {
    expect(titleToDocumentId('Rencontre à Uresaïr')).toBe('rencontre_a_uresair')
  })

  it('retourne vide si aucun caractère utilisable', () => {
    expect(titleToDocumentId('!!!')).toBe('')
  })
})

describe('dialogueDocumentId', () => {
  it('garde la casse et les accents du nom de fichier', () => {
    expect(dialogueDocumentId('La_carte_refusée.json')).toBe('La_carte_refusée')
  })

  it('accepte un stem déjà sans extension', () => {
    expect(dialogueDocumentId('Élan_brisé')).toBe('Élan_brisé')
  })
})

describe('normalizeDialogueFilenameKey', () => {
  it('rapproche NFC et NFD, majuscule et minuscule', () => {
    const nfd = 'La_carte_refusée.json'.normalize('NFD')
    expect(normalizeDialogueFilenameKey(nfd)).toBe(
      normalizeDialogueFilenameKey('la_carte_refusée')
    )
  })
})
