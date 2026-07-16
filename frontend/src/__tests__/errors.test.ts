import { describe, it, expect } from 'vitest'
import { getErrorMessage } from '../types/errors'

describe('getErrorMessage', () => {
  it('explique clairement un timeout Axios (autosave)', () => {
    expect(
      getErrorMessage({
        code: 'ECONNABORTED',
        message: 'timeout of 30000ms exceeded',
      })
    ).toMatch(/Délai d’attente dépassé/)
    expect(getErrorMessage(new Error('timeout of 30000ms exceeded'))).toMatch(/Délai d’attente dépassé/)
  })

  it('reads FastAPI detail string when error envelope absent', () => {
    const err = {
      response: { data: { detail: 'Jeton invalide' } },
    }
    expect(getErrorMessage(err)).toBe('Jeton invalide')
  })

  it('formats documents validationReport with message', () => {
    const err = {
      response: {
        data: {
          message: 'Validation export échouée',
          validationReport: [{ message: 'bad node' }, { message: 'bad edge' }],
        },
      },
    }
    const msg = getErrorMessage(err)
    expect(msg).toContain('Validation export échouée')
    expect(msg).toContain('bad node')
    expect(msg).toContain('bad edge')
  })

  it('humanise FastAPI detail object canonical_revision_required', () => {
    const err = {
      response: {
        status: 409,
        data: {
          detail: {
            code: 'canonical_revision_required',
            message: 'Utilisez PUT /documents/{id} avec la révision courante.',
          },
        },
      },
    }
    const msg = getErrorMessage(err)
    expect(msg).toMatch(/existe déjà/i)
    expect(msg).not.toMatch(/PUT \/documents/)
  })
})
