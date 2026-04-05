import { describe, it, expect } from 'vitest'
import {
  isStructuralValidationErrorType,
  STRUCTURAL_VALIDATION_ERROR_TYPES,
} from '../utils/graphStructuralValidation'

describe('graphStructuralValidation', () => {
  it('marque les types FR36 pour surlignage canvas', () => {
    expect(isStructuralValidationErrorType('missing_display_name')).toBe(true)
    expect(isStructuralValidationErrorType('missing_stable_id')).toBe(true)
    expect(isStructuralValidationErrorType('missing_dialogue_text')).toBe(true)
    expect(isStructuralValidationErrorType('orphan_node')).toBe(false)
    expect(STRUCTURAL_VALIDATION_ERROR_TYPES.size).toBe(3)
  })
})
