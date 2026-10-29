/**
 * Focus différé après ouverture depuis un rapport batch (Story 8.8).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  consumePendingValidationFocus,
  setPendingValidationFocus,
} from './pendingValidationFocus'

describe('pendingValidationFocus', () => {
  beforeEach(() => {
    consumePendingValidationFocus()
  })

  it('consomme une seule fois le node_id en attente', () => {
    setPendingValidationFocus('node-err')
    expect(consumePendingValidationFocus()).toBe('node-err')
    expect(consumePendingValidationFocus()).toBeUndefined()
  })

  it('ignore les valeurs vides', () => {
    setPendingValidationFocus('')
    expect(consumePendingValidationFocus()).toBeUndefined()
  })
})
