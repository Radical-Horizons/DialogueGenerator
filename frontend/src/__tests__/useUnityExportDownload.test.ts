/**
 * Story 5.4 — hook dernier export téléchargeable.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUnityExportDownload } from '../hooks/useUnityExportDownload'

vi.mock('../components/graph/graphEditorStandalone', () => ({
  downloadUnityExport: vi.fn(),
  buildUnityExportFilename: (name: string) => (name.endsWith('.json') ? name : `${name}.json`),
}))

import { downloadUnityExport } from '../components/graph/graphEditorStandalone'

describe('useUnityExportDownload', () => {
  beforeEach(() => {
    vi.mocked(downloadUnityExport).mockReset()
  })

  it('registerSuccessfulExport expose lastExportDownload', () => {
    const { result } = renderHook(() => useUnityExportDownload())

    act(() => {
      result.current.registerSuccessfulExport('{"nodes":[]}', 'quest_arc.json')
    })

    expect(result.current.lastExportDownload).toEqual({
      jsonContent: '{"nodes":[]}',
      filename: 'quest_arc.json',
    })
  })

  it('handleDownloadLastExport appelle downloadUnityExport', () => {
    const { result } = renderHook(() => useUnityExportDownload())

    act(() => {
      result.current.registerSuccessfulExport('{"nodes":[{"id":"START"}]}', 'quest_arc')
    })

    act(() => {
      result.current.handleDownloadLastExport()
    })

    expect(downloadUnityExport).toHaveBeenCalledWith(
      '{"nodes":[{"id":"START"}]}',
      'quest_arc',
      expect.objectContaining({
        onDownloadStart: expect.any(Function),
        onDownloadEnd: expect.any(Function),
      }),
      'preserve',
    )
  })

  it('dismissDownload efface lastExportDownload', () => {
    const { result } = renderHook(() => useUnityExportDownload())

    act(() => {
      result.current.registerSuccessfulExport('{}', 'a.json')
      result.current.dismissDownload()
    })

    expect(result.current.lastExportDownload).toBeNull()
  })
})
