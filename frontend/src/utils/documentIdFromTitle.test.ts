import { describe, expect, it } from 'vitest'
import {
  documentIdFromTitle,
  documentIdWithNumericSuffix,
  isCanonicalRevisionConflict,
} from '../utils/documentIdFromTitle'

describe('documentIdFromTitle', () => {
  it('aligne le slug titre sur le backend (espaces → _)', () => {
    expect(documentIdFromTitle('Nouveau dialogue')).toBe('Nouveau_dialogue')
  })

  it('conserve les accents (aligné Python \\w Unicode)', () => {
    expect(documentIdFromTitle('Café du port')).toBe('Café_du_port')
  })

  it('retire la ponctuation hors lettres/chiffres', () => {
    expect(documentIdFromTitle("L'aube — Acte 1!")).toBe('Laube_Acte_1')
  })
})

describe('documentIdWithNumericSuffix', () => {
  it('ajoute _2, _3… pour les conflits', () => {
    expect(documentIdWithNumericSuffix('Existant', 1)).toBe('Existant')
    expect(documentIdWithNumericSuffix('Existant', 2)).toBe('Existant_2')
    expect(documentIdWithNumericSuffix('Existant', 3)).toBe('Existant_3')
  })
})

describe('isCanonicalRevisionConflict', () => {
  it('détecte le 409 FastAPI detail.code', () => {
    expect(
      isCanonicalRevisionConflict({
        response: {
          status: 409,
          data: {
            detail: { code: 'canonical_revision_required', message: '…' },
          },
        },
      }),
    ).toBe(true)
  })

  it('ignore les autres 409', () => {
    expect(
      isCanonicalRevisionConflict({
        response: { status: 409, data: { document: {}, revision: 2 } },
      }),
    ).toBe(false)
  })
})
