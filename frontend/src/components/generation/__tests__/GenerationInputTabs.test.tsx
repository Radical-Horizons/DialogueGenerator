/**
 * Barre d'onglets d'entrée (matrice I/O — « Sélection d'onglet », « Compteur de flags »).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GenerationInputTabs } from '../GenerationInputTabs'
import { redesignAccent } from '../../../theme/redesignTokens'

describe('GenerationInputTabs', () => {
  it('expose exactement Brief, Flags et Templates', () => {
    render(<GenerationInputTabs activeTab="brief" onSelect={vi.fn()} flagCount={0} />)

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Brief', 'Flags', 'Templates'])
  })

  it('marque le seul onglet actif', () => {
    render(<GenerationInputTabs activeTab="templates" onSelect={vi.fn()} flagCount={0} />)

    expect(screen.getByTestId('input-tab-templates')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('input-tab-brief')).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByTestId('input-tab-flags')).toHaveAttribute('aria-selected', 'false')
  })

  it('remonte la sélection au parent', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<GenerationInputTabs activeTab="brief" onSelect={onSelect} flagCount={0} />)

    await user.click(screen.getByTestId('input-tab-flags'))

    expect(onSelect).toHaveBeenCalledExactlyOnceWith('flags')
  })

  it('affiche le compte de variables sur l’onglet Flags', () => {
    render(<GenerationInputTabs activeTab="brief" onSelect={vi.fn()} flagCount={4} />)
    expect(screen.getByTestId('input-tab-flags')).toHaveTextContent('Flags · 4')
  })

  it('omet le compte quand le dialogue n’a aucune variable', () => {
    render(<GenerationInputTabs activeTab="brief" onSelect={vi.fn()} flagCount={0} />)
    expect(screen.getByTestId('input-tab-flags')).toHaveTextContent(/^Flags$/)
  })

  /**
   * Garde de charte. Le filet actif doit venir de `redesignTab` : un `borderBottom`
   * posé sur le `<button>` se fait arrondir par le rayon des contrôles et rend un arc
   * au lieu d'un filet — défaut constaté en revue (août 2026).
   */
  describe('charte graphique', () => {
    it('porte le filet sur le libellé, jamais sur la boîte du bouton', () => {
      render(<GenerationInputTabs activeTab="brief" onSelect={vi.fn()} flagCount={0} />)

      const actif = screen.getByTestId('input-tab-brief')
      // `border: none` se sérialise en `borderBottom: medium` dans le CSSOM jsdom :
      // on assertie le style de bord et l'absence d'accent sur la boîte, pas la chaîne.
      expect(actif.style.borderBottomStyle).toBe('none')
      expect(actif.getAttribute('style')).not.toContain(redesignAccent.base)

      const libelle = actif.querySelector('span')
      expect(libelle).not.toBeNull()
      expect(libelle!.style.boxShadow).toBe(`inset 0 -1px 0 ${redesignAccent.base}`)
    })

    it('n’applique aucun filet à un onglet inactif', () => {
      render(<GenerationInputTabs activeTab="brief" onSelect={vi.fn()} flagCount={0} />)

      const inactif = screen.getByTestId('input-tab-flags').querySelector('span')
      expect(inactif!.style.boxShadow).toBe('none')
    })

    it('utilise la police mono en capitales, comme la barre du panneau droit', () => {
      render(<GenerationInputTabs activeTab="brief" onSelect={vi.fn()} flagCount={0} />)

      const onglet = screen.getByTestId('input-tab-brief')
      expect(onglet.style.textTransform).toBe('uppercase')
      expect(onglet.style.fontFamily).toMatch(/mono/i)
      expect(onglet.style.letterSpacing).toBe('0.08em')
    })
  })
})
