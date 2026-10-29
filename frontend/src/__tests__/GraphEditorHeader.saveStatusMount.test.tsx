/**
 * Story 17.11 — anti double-mount SaveStatusIndicator (confort + narrow).
 */
import { createElement } from 'react'
import { cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as shared from '../components/shared'
import { SaveStatusIndicator as RealSaveStatusIndicator } from '../components/shared/SaveStatusIndicator'
import {
  renderGraphEditorHeader,
  mockNarrowToolbar,
} from './graphEditorHeaderTestUtils'

describe('GraphEditorHeader - SaveStatusIndicator mount count (17.11)', () => {
  let saveStatusMountCount: number

  beforeEach(() => {
    saveStatusMountCount = 0
    vi.restoreAllMocks()
    vi.spyOn(shared, 'SaveStatusIndicator').mockImplementation((props) => {
      saveStatusMountCount += 1
      return createElement(RealSaveStatusIndicator, props)
    })
  })

  it('comfort-single-save-indicator: monte l’indicateur mono (2e) une seule fois avec dialogue actif', () => {
    mockNarrowToolbar(false)
    renderGraphEditorHeader({ activeDialogueFilename: 'test.json' })
    // Écran 2e : le confort rend le libellé mono `ENREGISTRÉ · HH:MM`, pas le composant partagé.
    expect(document.querySelectorAll('[data-testid="graph-save-status-mono"]').length).toBe(1)
    expect(saveStatusMountCount).toBe(0)
  })

  it('narrow-single-save-indicator: monte SaveStatusIndicator une seule fois avec dialogue actif', () => {
    mockNarrowToolbar(true)
    renderGraphEditorHeader({ activeDialogueFilename: 'test.json' })
    expect(saveStatusMountCount).toBe(1)
    expect(document.querySelector('[data-testid="graph-toolbar-row-status"]')).toBeTruthy()
  })

  it('sans dialogue actif: aucun SaveStatusIndicator monté (confort et narrow)', () => {
    mockNarrowToolbar(false)
    renderGraphEditorHeader({ activeDialogueFilename: null, hasActiveDialogue: false })
    expect(saveStatusMountCount).toBe(0)
    expect(document.querySelector('[data-testid="graph-save-status-mono"]')).toBeNull()

    cleanup()
    vi.restoreAllMocks()
    saveStatusMountCount = 0
    vi.spyOn(shared, 'SaveStatusIndicator').mockImplementation((props) => {
      saveStatusMountCount += 1
      return createElement(RealSaveStatusIndicator, props)
    })

    mockNarrowToolbar(true)
    renderGraphEditorHeader({ activeDialogueFilename: null, hasActiveDialogue: false })
    expect(saveStatusMountCount).toBe(0)
  })
})
