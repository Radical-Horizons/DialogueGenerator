/**
 * uiLayoutStore — onglet inspecteur (2e), mode écriture (2c), minimap du graphe.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useUiLayoutStore } from './uiLayoutStore'

describe('uiLayoutStore — section au démarrage', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  async function bootOn(url: string) {
    window.history.replaceState(null, '', url)
    vi.resetModules()
    const { useUiLayoutStore: freshStore } = await import('./uiLayoutStore')
    return freshStore.getState().centerPanelTab
  }

  it.each([
    ['/', 'generation'],
    ['/?section=edition', 'edition'],
    ['/?section=graph&dialogue=a.json', 'graph'],
    ['/?section=inconnue', 'generation'],
    ['/admin?section=graph', 'generation'],
  ])('%s démarre sur %s', async (url, expected) => {
    expect(await bootOn(url)).toBe(expected)
  })
})

describe('uiLayoutStore', () => {
  beforeEach(() => {
    useUiLayoutStore.setState({ inspectorTab: 'node', writingMode: false, showGraphMinimap: false })
  })

  it('minimap du graphe masquée par défaut (écran 2e sans minimap)', () => {
    expect(useUiLayoutStore.getInitialState().showGraphMinimap).toBe(false)
  })

  it('toggleGraphMinimap affiche puis masque la minimap', () => {
    useUiLayoutStore.getState().toggleGraphMinimap()
    expect(useUiLayoutStore.getState().showGraphMinimap).toBe(true)
    useUiLayoutStore.getState().toggleGraphMinimap()
    expect(useUiLayoutStore.getState().showGraphMinimap).toBe(false)
  })

  it('la minimap est indépendante du mode écriture et de l’inspecteur', () => {
    useUiLayoutStore.getState().toggleGraphMinimap()
    useUiLayoutStore.getState().setWritingMode(true)
    useUiLayoutStore.getState().toggleInspectorTab('cost')
    expect(useUiLayoutStore.getState().showGraphMinimap).toBe(true)
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
