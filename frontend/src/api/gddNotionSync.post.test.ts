import { beforeEach, describe, expect, it, vi } from 'vitest'

const postMock = vi.fn()

vi.mock('./client', () => ({
  default: {
    post: (...args: unknown[]) => postMock(...args),
  },
}))

describe('postGddNotionSync', () => {
  beforeEach(() => {
    postMock.mockClear()
    postMock.mockResolvedValue({
      data: {
        success: true,
        message: 'ok',
        updated_entities: 0,
        partial_errors: [],
      },
    })
  })

  it('ajoute apply_staging_despite_errors à la query', async () => {
    const { postGddNotionSync } = await import('./gddNotionSync')
    await postGddNotionSync(true, { applyStagingDespiteErrors: true })
    expect(postMock).toHaveBeenCalledTimes(1)
    const url = postMock.mock.calls[0][0] as string
    expect(url).toContain('apply_staging_despite_errors=true')
  })

  it('répète category_file= pour FastAPI (pas de tableau Axios)', async () => {
    const { postGddNotionSync } = await import('./gddNotionSync')
    await postGddNotionSync(true, { categoryFiles: ['Espèces.json', 'Lieux.json'] })
    expect(postMock).toHaveBeenCalledTimes(1)
    const url = postMock.mock.calls[0][0] as string
    expect(url).toMatch(/[?&]full=true/)
    expect(url).toContain('category_file=')
    const decoded = decodeURIComponent(url)
    expect(decoded.split('category_file=').length - 1).toBe(2)
    expect(decoded).toContain('Espèces.json')
    expect(decoded).toContain('Lieux.json')
  })
})
