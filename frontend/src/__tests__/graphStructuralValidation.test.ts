import { describe, it, expect } from 'vitest'
import {
  getGraphTopologyWarningKind,
  getValidationHighlightKind,
  isStructuralValidationErrorType,
  STRUCTURAL_VALIDATION_ERROR_TYPES,
} from '../utils/graphStructuralValidation'

describe('graphStructuralValidation', () => {
  it('FR36 : types structurels (rouge canvas)', () => {
    expect(isStructuralValidationErrorType('missing_display_name')).toBe(true)
    expect(isStructuralValidationErrorType('missing_stable_id')).toBe(true)
    expect(isStructuralValidationErrorType('missing_dialogue_text')).toBe(false)
    expect(isStructuralValidationErrorType('missing_test')).toBe(false)
    expect(isStructuralValidationErrorType('orphan_node')).toBe(false)
    expect(STRUCTURAL_VALIDATION_ERROR_TYPES.size).toBe(2)
  })

  it('getValidationHighlightKind : structure prioritaire sur complétude', () => {
    expect(getValidationHighlightKind(['missing_dialogue_text'])).toBe('content')
    expect(getValidationHighlightKind(['missing_test'])).toBe('content')
    expect(getValidationHighlightKind(['missing_display_name', 'missing_dialogue_text'])).toBe(
      'structural'
    )
    expect(getValidationHighlightKind(['broken_reference'])).toBe('structural')
    expect(getValidationHighlightKind(['dialogue_flag_undeclared'])).toBe('structural')
  })

  it('FR40 : orphelin prioritaire sur inatteignable pour le style topologie', () => {
    expect(getGraphTopologyWarningKind(['unreachable_node'])).toBe('unreachable')
    expect(getGraphTopologyWarningKind(['orphan_node', 'unreachable_node'])).toBe('orphan')
    expect(getGraphTopologyWarningKind(['cycle_detected'])).toBe(null)
  })

  it('getValidationHighlightKind : lore (FR38) après complétude, sous structure', () => {
    expect(getValidationHighlightKind(['lore_contradiction_explicit'])).toBe('lore')
    expect(getValidationHighlightKind(['lore_contradiction_potential'])).toBe('lore')
    expect(getValidationHighlightKind(['lore_potential_ambiguity'])).toBe('lore')
    expect(
      getValidationHighlightKind(['missing_display_name', 'lore_contradiction_explicit'])
    ).toBe('structural')
    expect(
      getValidationHighlightKind(['missing_dialogue_text', 'lore_contradiction_explicit'])
    ).toBe('content')
  })
})
