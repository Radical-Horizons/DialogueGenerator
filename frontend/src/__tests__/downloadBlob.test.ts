/**
 * Story 5.4 — indicateur téléchargement fichiers volumineux.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  LARGE_DOWNLOAD_THRESHOLD_BYTES,
  triggerBlobDownload,
  triggerBlobDownloadAsync,
} from '../utils/downloadBlob'

describe('downloadBlob', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'URL',
      Object.assign(globalThis.URL, {
        createObjectURL: vi.fn(() => 'blob:mock'),
        revokeObjectURL: vi.fn(),
      }),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('n’affiche pas la progression pour petit fichier', async () => {
    const onStart = vi.fn()
    const onEnd = vi.fn()
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await triggerBlobDownloadAsync({
      blob: new Blob(['small'], { type: 'application/json' }),
      filename: 'small.json',
      onProgressStart: onStart,
      onProgressEnd: onEnd,
    })

    expect(onStart).not.toHaveBeenCalled()
    expect(onEnd).toHaveBeenCalledOnce()
    clickSpy.mockRestore()
  })

  it('déclenche progression différée pour blob >= 10 Mo', async () => {
    const onStart = vi.fn()
    const onEnd = vi.fn()
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const largeContent = 'x'.repeat(LARGE_DOWNLOAD_THRESHOLD_BYTES)

    const pending = triggerBlobDownloadAsync({
      blob: new Blob([largeContent], { type: 'application/json' }),
      filename: 'large.json',
      onProgressStart: onStart,
      onProgressEnd: onEnd,
    })

    expect(onStart).toHaveBeenCalledOnce()
    expect(onEnd).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(100)
    await pending

    expect(onEnd).toHaveBeenCalledOnce()
    clickSpy.mockRestore()
  })

  it('triggerBlobDownload délègue sans bloquer', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    triggerBlobDownload({
      blob: new Blob(['x'], { type: 'application/json' }),
      filename: 'x.json',
    })
    clickSpy.mockRestore()
  })
})
