/**
 * Aide générale des raccourcis (`Ctrl+/`) et onglet « Raccourcis » des options : même liste
 * (`GENERAL_SHORTCUTS`). Ctrl+E y était annoncé sans écouteur monté ; Ctrl+4 et le mode
 * écriture (`Ctrl+\`, écouteur posé à la main dans `Dashboard`) n'y figuraient pas.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp'
import { GENERAL_SHORTCUTS, collectHelpShortcuts } from './generalShortcuts'
import { formatShortcut } from '../../hooks/useKeyboardShortcuts'

function shownKeyLabels(): string[] {
  const { container } = render(<KeyboardShortcutsHelp isOpen onClose={vi.fn()} />)
  return Array.from(container.querySelectorAll('kbd')).map((kbd) => kbd.textContent ?? '')
}

describe('KeyboardShortcutsHelp — raccourcis annoncés', () => {
  it("n'annonce plus Ctrl+E, qu'aucun composant monté n'enregistre", () => {
    expect(GENERAL_SHORTCUTS.map((s) => s.key)).not.toContain('ctrl+e')
    expect(shownKeyLabels()).not.toContain(formatShortcut('ctrl+e'))
  })

  it("annonce Ctrl+4 (éditeur de graphe) et Ctrl+\\ (mode écriture)", () => {
    const labels = shownKeyLabels()

    expect(labels).toContain('Ctrl + 4')
    expect(labels).toContain('Ctrl + \\')
    expect(screen.getByText("Naviguer vers l'éditeur de graphe")).toBeInTheDocument()
    expect(screen.getByText('Entrer / sortir du mode écriture')).toBeInTheDocument()
  })

  it('la liste globale prime sur un raccourci dynamique de même touche', () => {
    const merged = collectHelpShortcuts([
      { key: 'ctrl+4', description: 'Naviguer vers Éditeur de Graphe' },
      { key: 'ctrl+j', description: 'Aller à un nœud' },
    ])

    expect(merged.filter((s) => s.key === 'ctrl+4')).toEqual([
      { key: 'ctrl+4', description: "Naviguer vers l'éditeur de graphe" },
    ])
    expect(merged.map((s) => s.key)).toContain('ctrl+j')
  })
})
