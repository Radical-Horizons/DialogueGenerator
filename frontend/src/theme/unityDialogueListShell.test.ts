/**
 * Bornes de colonne liste Unity (volet unique, Collections en toolbar).
 */
import { describe, expect, it } from 'vitest'
import {
  UNITY_DIALOGUE_LIST_MAX_FRACTION,
  UNITY_DIALOGUE_LIST_MAX_WIDTH_CAP_PX,
  UNITY_DIALOGUE_LIST_MIN_WIDTH_PX,
  unityDialogueListColumnStyle,
} from './unityDialogueListShell'

describe('unityDialogueListShell', () => {
  it('borne une liste lisible sans rail Collections latéral', () => {
    expect(UNITY_DIALOGUE_LIST_MIN_WIDTH_PX).toBeGreaterThanOrEqual(220)
    expect(UNITY_DIALOGUE_LIST_MAX_WIDTH_CAP_PX).toBeGreaterThanOrEqual(
      UNITY_DIALOGUE_LIST_MIN_WIDTH_PX,
    )
    expect(UNITY_DIALOGUE_LIST_MAX_FRACTION).toBeGreaterThan(0.2)
    expect(UNITY_DIALOGUE_LIST_MAX_FRACTION).toBeLessThanOrEqual(0.35)
  })

  it('expose un style colonne cohérent avec les bornes', () => {
    expect(unityDialogueListColumnStyle.minWidth).toBe(UNITY_DIALOGUE_LIST_MIN_WIDTH_PX)
    expect(String(unityDialogueListColumnStyle.maxWidth)).toContain(
      `${UNITY_DIALOGUE_LIST_MAX_WIDTH_CAP_PX}px`,
    )
  })
})
