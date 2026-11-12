/**
 * Quota keepalive partagé (spec Fetch) : document + layout en vol ensemble ne doivent
 * jamais dépasser 64 Kio, sinon `fetch` lève un TypeError et la sauvegarde est perdue.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as documentsAPI from './documents'

vi.mock('./client', () => ({
  default: { defaults: { baseURL: '' }, get: vi.fn(), put: vi.fn() },
}))

function bodyOfSize(bytes: number) {
  return { document: { schemaVersion: '1.2.0', nodes: [], pad: 'x'.repeat(bytes) }, revision: 1 }
}

describe('putKeepalive — quota partagé', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('replie sur axios (null) quand le cumul des requêtes keepalive en vol dépasserait le quota', async () => {
    const pending: Array<(r: Response) => void> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            pending.push(resolve)
          }),
      ),
    )

    const documentPut = documentsAPI.putDocumentKeepalive('doc', bodyOfSize(40_000))
    const layoutPut = documentsAPI.putLayoutKeepalive('doc', {
      layout: { pad: 'y'.repeat(30_000) },
      revision: 1,
    })

    await expect(layoutPut).resolves.toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)

    pending[0](new Response(JSON.stringify({ revision: 2 }), { status: 200 }))
    await expect(documentPut).resolves.toEqual({ revision: 2 })
  })

  it('libère le quota une fois la requête terminée', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ revision: 2 }), { status: 200 })),
    )

    await documentsAPI.putDocumentKeepalive('doc', bodyOfSize(40_000))
    await expect(documentsAPI.putDocumentKeepalive('doc', bodyOfSize(40_000))).resolves.toEqual({
      revision: 2,
    })
  })
})
