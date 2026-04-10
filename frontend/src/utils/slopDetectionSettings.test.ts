/**
 * Persistance et parsing des options détection AI slop (FR43).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  SLOP_DETECTION_STORAGE_KEY,
  loadSlopDetectionOptions,
  saveSlopDetectionOptions,
  parseKeywordLine,
  defaultSlopDetectionOptions,
} from './slopDetectionSettings'

describe('slopDetectionSettings', () => {
  beforeEach(() => {
    localStorage.removeItem(SLOP_DETECTION_STORAGE_KEY)
  })

  it('defaultSlopDetectionOptions a les trois familles actives', () => {
    const d = defaultSlopDetectionOptions()
    expect(d.include_gpt_isms).toBe(true)
    expect(d.include_repetitions).toBe(true)
    expect(d.include_generic_phrases).toBe(true)
  })

  it('save puis load restaure les toggles', () => {
    saveSlopDetectionOptions({
      ...defaultSlopDetectionOptions(),
      include_repetitions: false,
      custom_keywords: ['foo'],
    })
    const loaded = loadSlopDetectionOptions()
    expect(loaded.include_repetitions).toBe(false)
    expect(loaded.custom_keywords).toEqual(['foo'])
  })

  it('parseKeywordLine découpe virgules et retours ligne', () => {
    expect(parseKeywordLine('a, b\nc')).toEqual(['a', 'b', 'c'])
  })
})
