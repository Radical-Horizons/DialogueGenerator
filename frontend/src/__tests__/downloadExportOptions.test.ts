/**
 * Story 5.4 — options téléchargement persistées localStorage.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_DOWNLOAD_EXPORT_OPTIONS,
  DOWNLOAD_EXPORT_OPTIONS_STORAGE_KEY,
  loadDownloadExportOptions,
  resolveDownloadExportFilename,
  saveDownloadExportOptions,
  slugFromTitle,
} from '../utils/downloadExportOptions'

describe('downloadExportOptions', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns defaults when localStorage empty', () => {
    expect(loadDownloadExportOptions()).toEqual(DEFAULT_DOWNLOAD_EXPORT_OPTIONS)
  })

  it('persists zip compression store across reload', () => {
    saveDownloadExportOptions({
      ...DEFAULT_DOWNLOAD_EXPORT_OPTIONS,
      zipCompression: 'store',
    })
    expect(localStorage.getItem(DOWNLOAD_EXPORT_OPTIONS_STORAGE_KEY)).toBeTruthy()
    expect(loadDownloadExportOptions().zipCompression).toBe('store')
  })

  it('persists batch individual format', () => {
    saveDownloadExportOptions({
      ...DEFAULT_DOWNLOAD_EXPORT_OPTIONS,
      batchFormat: 'individual',
    })
    expect(loadDownloadExportOptions().batchFormat).toBe('individual')
  })

  it('slugFromTitle aligne le backend batch export', () => {
    expect(slugFromTitle('Quest Arc!')).toBe('quest_arc')
  })

  it('resolveDownloadExportFilename slug depuis title JSON', () => {
    expect(
      resolveDownloadExportFilename({
        strategy: 'slug',
        sourceFilename: 'doc_a.json',
        jsonContent: JSON.stringify({ title: 'Ma Quête' }),
      }),
    ).toBe('ma_quête.json')
  })

  it('resolveDownloadExportFilename preserve conserve le filename', () => {
    expect(
      resolveDownloadExportFilename({
        strategy: 'preserve',
        sourceFilename: 'quest_arc',
      }),
    ).toBe('quest_arc.json')
  })
})
