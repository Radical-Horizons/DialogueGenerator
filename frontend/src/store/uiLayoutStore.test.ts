/**
 * uiLayoutStore — onglet inspecteur (2e) et mode écriture (2c).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useUiLayoutStore } from './uiLayoutStore'

describe('uiLayoutStore', () => {
  beforeEach(() => {
    useUiLayoutStore.setState({ inspectorTab: 'node', writingMode: false })
  })

  it('toggleInspectorTab replie l’inspecteur quand on re-clique l’onglet actif', () => {
    useUiLayoutStore.getState().toggleInspectorTab('health')
    expect(useUiLayoutStore.getState().inspectorTab).toBe('health')
    useUiLayoutStore.getState().toggleInspectorTab('health')
    expect(useUiLayoutStore.getState().inspectorTab).toBeNull()
  })

  it('un seul onglet actif à la fois (pas d’empilement de panneaux)', () => {
    useUiLayoutStore.getState().toggleInspectorTab('quality')
    useUiLayoutStore.getState().toggleInspectorTab('cost')
    expect(useUiLayoutStore.getState().inspectorTab).toBe('cost')
  })

  it('toggleWritingMode bascule le mode écriture (2c)', () => {
    expect(useUiLayoutStore.getState().writingMode).toBe(false)
    useUiLayoutStore.getState().toggleWritingMode()
    expect(useUiLayoutStore.getState().writingMode).toBe(true)
    useUiLayoutStore.getState().toggleWritingMode()
    expect(useUiLayoutStore.getState().writingMode).toBe(false)
  })

  it('setWritingMode(false) sort du mode écriture (badge cliquable)', () => {
    useUiLayoutStore.getState().setWritingMode(true)
    useUiLayoutStore.getState().setWritingMode(false)
    expect(useUiLayoutStore.getState().writingMode).toBe(false)
  })
})
