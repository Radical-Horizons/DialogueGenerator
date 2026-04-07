/**
 * Persistance locale des options « détection AI slop » (FR43, MVP client).
 */
import type { AiSlopDetectionOptionsState } from '../types/graph'

export type { AiSlopDetectionOptionsState }

export const SLOP_DETECTION_STORAGE_KEY = 'dialogueGenerator.aiSlopDetection.v1'

export const defaultSlopDetectionOptions = (): AiSlopDetectionOptionsState => ({
  include_gpt_isms: true,
  include_repetitions: true,
  include_generic_phrases: true,
  custom_keywords: [],
  custom_regex_patterns: [],
})

export function loadSlopDetectionOptions(): AiSlopDetectionOptionsState {
  if (typeof localStorage === 'undefined') return defaultSlopDetectionOptions()
  try {
    const raw = localStorage.getItem(SLOP_DETECTION_STORAGE_KEY)
    if (!raw) return defaultSlopDetectionOptions()
    const parsed = JSON.parse(raw) as Partial<AiSlopDetectionOptionsState>
    const base = defaultSlopDetectionOptions()
    return {
      include_gpt_isms: typeof parsed.include_gpt_isms === 'boolean' ? parsed.include_gpt_isms : base.include_gpt_isms,
      include_repetitions:
        typeof parsed.include_repetitions === 'boolean' ? parsed.include_repetitions : base.include_repetitions,
      include_generic_phrases:
        typeof parsed.include_generic_phrases === 'boolean'
          ? parsed.include_generic_phrases
          : base.include_generic_phrases,
      custom_keywords: Array.isArray(parsed.custom_keywords)
        ? parsed.custom_keywords.filter((x) => typeof x === 'string')
        : [],
      custom_regex_patterns: Array.isArray(parsed.custom_regex_patterns)
        ? parsed.custom_regex_patterns.filter((x) => typeof x === 'string')
        : [],
    }
  } catch {
    return defaultSlopDetectionOptions()
  }
}

export function saveSlopDetectionOptions(opts: AiSlopDetectionOptionsState): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(SLOP_DETECTION_STORAGE_KEY, JSON.stringify(opts))
  } catch {
    /* ignore quota */
  }
}

export function parseKeywordLine(input: string): string[] {
  return input
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}
