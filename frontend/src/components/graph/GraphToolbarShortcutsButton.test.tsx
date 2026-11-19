/**
 * L'aide « ? » du graphe ne doit annoncer que des touches que `useGraphToolbar` enregistre :
 * elle affichait Ctrl+F (laissé au navigateur) pour la recherche, enregistrée sur
 * Ctrl+Shift+F, et Ctrl+Shift+F pour les filtres, enregistrés sur Ctrl+Alt+F.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, renderHook, screen } from '@testing-library/react'
import { GraphToolbarShortcutsButton } from './GraphToolbarShortcutsButton'
import { GRAPH_SHORTCUT_KEYS } from './graphToolbarConstants'
import { useGraphToolbar } from '../../hooks/useGraphToolbar'
import { formatShortcut, getAllShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useGraphStore } from '../../store/graphStore'
import { graphToolbarChrome } from '../../theme/responsiveChrome'

vi.mock('../../api/graph', () => ({
  loadGraph: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  generateNode: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

function renderOpenTooltip(): HTMLElement {
  render(
    <GraphToolbarShortcutsButton
      isNarrowToolbar={false}
      chrome={graphToolbarChrome.comfortable}
      chromeStyles={{
        graphChromeTouch: {},
        graphChromeTouchNarrow: {},
        effectiveButtonPadding: '0',
        effectiveButtonFontSizeRem: 1,
      }}
      showShortcutsTooltip
      setShowShortcutsTooltip={() => {}}
    />
  )
  return screen.getByRole('tooltip')
}

function shownKeyCombos(tooltip: HTMLElement): string[] {
  return Array.from(tooltip.querySelectorAll('kbd'))
    .map((kbd) => kbd.textContent?.trim() ?? '')
    .filter((label) => label.startsWith('Ctrl'))
}

describe('GraphToolbarShortcutsButton — aide alignée sur les raccourcis enregistrés', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
  })

  it('chaque combinaison affichée est enregistrée par useGraphToolbar', () => {
    const { unmount } = renderHook(() => useGraphToolbar(vi.fn(), 'dialogue.json', false))
    const registeredLabels = new Set(getAllShortcuts().map((s) => formatShortcut(s.key)))

    const shown = shownKeyCombos(renderOpenTooltip())

    expect(shown.length).toBeGreaterThan(0)
    for (const label of shown) {
      expect(registeredLabels, `« ${label} » affiché sans être enregistré`).toContain(label)
    }
    unmount()
  })

  it('affiche exactement les touches partagées avec l’enregistrement', () => {
    const { unmount } = renderHook(() => useGraphToolbar(vi.fn(), 'dialogue.json', false))
    const registeredKeys = getAllShortcuts().map((s) => s.key)
    for (const key of Object.values(GRAPH_SHORTCUT_KEYS)) {
      expect(registeredKeys).toContain(key)
    }

    const shown = shownKeyCombos(renderOpenTooltip())

    expect([...shown].sort()).toEqual(Object.values(GRAPH_SHORTCUT_KEYS).map(formatShortcut).sort())
    unmount()
  })

  it('recherche sur Ctrl+Shift+F et filtres sur Ctrl+Alt+F, Ctrl+F seul laissé au navigateur', () => {
    const shown = shownKeyCombos(renderOpenTooltip())

    expect(shown).toContain('Ctrl + Shift + F')
    expect(shown).toContain('Ctrl + Alt + F')
    expect(shown).not.toContain('Ctrl + F')
  })
})
