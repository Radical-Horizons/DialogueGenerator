import { beforeEach, describe, expect, it, vi } from 'vitest'

const postMock = vi.fn().mockResolvedValue({ data: { status: 'ok' } })

vi.mock('../api/client', () => ({
  default: {
    post: (...args: unknown[]) => postMock(...args),
  },
}))

describe('frontend logging', () => {
  beforeEach(() => {
    localStorage.clear()
    postMock.mockClear()
    vi.resetModules()
  })

  it('n’envoie pas de log sans access_token', async () => {
    const { logger } = await import('./logging')
    logger.info('boot sans token')
    expect(postMock).not.toHaveBeenCalled()
  })

  it('envoie un log quand un access_token est présent', async () => {
    localStorage.setItem('access_token', 'tok')
    const { logger } = await import('./logging')
    logger.info('après auth')
    expect(postMock).toHaveBeenCalledWith(
      '/api/v1/logs/frontend',
      expect.objectContaining({ level: 'INFO', message: 'après auth' }),
    )
  })
})
