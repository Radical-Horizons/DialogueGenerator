import { describe, it, expect } from 'vitest'
import { getErrorMessage } from '../types/errors'

describe('getErrorMessage', () => {
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
})
