/**
 * Tokens publiés en variables CSS (story 20.3).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildTokenSheet, publishTokens, resolveToken, tokenVarName } from './publishTokens'
import * as tokens from './redesignTokens'
import { nightTokens } from './tokenValues'
import { exportGraphToPNG, exportGraphToSVG } from '../utils/graphExport'

const htmlToImage = vi.hoisted(() => ({ toPng: vi.fn(), toSvg: vi.fn() }))
vi.mock('html-to-image', () => htmlToImage)

/** Toutes les valeurs de `tokenValues`, avec le nom de variable attendu. */
const published: [string, string][] = Object.entries(nightTokens).flatMap(([family, entry]) => {
  const css = (value: string | number) => (typeof value === 'number' ? `${value}px` : value)
  return typeof entry === 'object'
    ? Object.entries(entry).map(([key, value]): [string, string] => [tokenVarName(family, key), css(value)])
    : [[tokenVarName(family), css(entry)] as [string, string]]
})

const rootValue = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

const sheets = () => document.querySelectorAll('style#dg-tokens')

afterEach(() => {
  sheets().forEach((sheet) => sheet.remove())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('publishTokens', () => {
  it('nomme les variables --dg-<famille>-<clé> en kebab', () => {
    expect(tokenVarName('accent', 'selectedBg')).toBe('--dg-accent-selected-bg')
    expect(tokenVarName('nodeBorder', 'default')).toBe('--dg-node-border-default')
    expect(tokenVarName('nodeShadow')).toBe('--dg-node-shadow')
  })

  it('publie sur :root chaque token à sa valeur, les nombres en px', () => {
    publishTokens()

    expect(published.length).toBeGreaterThan(40)
    for (const [name, value] of published) {
      expect(rootValue(name), name).toBe(value)
    }
    expect(rootValue('--dg-spacing-xs')).toBe('5px')
    expect(rootValue('--dg-rail-width')).toBe('56px')
  })

  it('ne pose qu’une feuille quand on publie deux fois', () => {
    publishTokens()
    publishTokens()

    expect(sheets()).toHaveLength(1)
    expect(sheets()[0].textContent).toBe(buildTokenSheet())
  })

  it('passe par une feuille adoptée, hors de document.styleSheets, une seule fois', () => {
    // jsdom n'a pas `adoptedStyleSheets` : on le fournit pour suivre le chemin du navigateur.
    const doc = document as Document & { dgTokenSheet?: CSSStyleSheet }
    Object.defineProperty(doc, 'adoptedStyleSheets', { value: [], writable: true, configurable: true })
    const replaceSync = vi.spyOn(CSSStyleSheet.prototype, 'replaceSync').mockImplementation(() => {})
    try {
      publishTokens()
      publishTokens()

      expect(doc.adoptedStyleSheets).toEqual([doc.dgTokenSheet])
      expect(replaceSync).toHaveBeenLastCalledWith(buildTokenSheet())
      expect(sheets()).toHaveLength(0)
    } finally {
      delete (doc as { adoptedStyleSheets?: unknown }).adoptedStyleSheets
      delete doc.dgTokenSheet
    }
  })

  it('publie une clé nouvelle et un second thème sans autre geste', () => {
    const sheet = buildTokenSheet({
      ':root': { surface: { ...nightTokens.surface, veil: '#000000' } },
      ':root[data-theme="autre"]': { surface: { veil: '#ffffff' } },
    })

    expect(sheet).toMatch(/:root \{[^}]*--dg-surface-veil: #000000;/)
    expect(sheet).toMatch(/:root\[data-theme="autre"\] \{[^}]*--dg-surface-veil: #ffffff;/)
  })

  it('garde la bordure de nœud neutre de la maquette 2e', () => {
    expect(nightTokens.nodeBorder.default).toBe('#3d3d46')
  })

  it('porte le voile de minimap en token propre, `canvas` à 50 %', () => {
    expect(nightTokens.surface.canvasMask).toBe(`${nightTokens.surface.canvas}80`)
    expect(tokens.redesignSurface.canvasMask).toBe('var(--dg-surface-canvas-mask)')
  })
})

describe('références de redesignTokens', () => {
  const strings = (value: unknown): string[] => {
    if (typeof value === 'string') return [value]
    if (value && typeof value === 'object') return Object.values(value).flatMap(strings)
    return []
  }

  it('ne lit aucune variable qui ne soit publiée', () => {
    publishTokens()
    const composed = [
      tokens.redesignListRowStyle(true),
      tokens.redesignListRowStyle(false),
      tokens.redesignTab.buttonStyle(true),
      tokens.redesignTab.buttonStyle(false),
      tokens.redesignTab.labelStyle(true),
    ]
    const names = strings([Object.values(tokens), composed]).flatMap((text) =>
      [...text.matchAll(/var\((--[\w-]+)\)/g)].map((match) => match[1]),
    )

    expect(names.length).toBeGreaterThan(30)
    for (const name of names) {
      expect(rootValue(name), name).not.toBe('')
    }
  })

  it('lit couleurs et ombre par var(), le reste en littéraux', () => {
    expect(tokens.redesignAccent.base).toBe('var(--dg-accent-base)')
    expect(tokens.redesignNodeShadow).toBe('var(--dg-node-shadow)')
    expect(Object.keys(tokens.redesignText)).toEqual(Object.keys(nightTokens.text))
    expect(tokens.redesignSpacing.xs).toBe(5)
    expect(tokens.redesignRadius.chip).toBe(99)
    expect(tokens.redesignRailWidth).toBe(56)
    expect(tokens.redesignFont.mono).toBe(nightTokens.font.mono)
  })
})

describe('rendu hors du document', () => {
  it('résout une référence en sa valeur et laisse une couleur telle quelle', () => {
    publishTokens()

    expect(resolveToken(tokens.redesignSurface.canvas)).toBe(nightTokens.surface.canvas)
    expect(resolveToken('#123456')).toBe('#123456')
  })

  it.each([
    ['PNG', exportGraphToPNG, htmlToImage.toPng],
    ['SVG', exportGraphToSVG, htmlToImage.toSvg],
  ] as const)('donne à l’export %s un fond de repli résolu', async (_format, exportGraph, render) => {
    publishTokens()
    document.body.innerHTML = '<div class="react-flow"></div>'
    render.mockReset().mockResolvedValue('data:,')
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const real = window.getComputedStyle.bind(window)
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) =>
      element.classList.contains('react-flow')
        ? ({ backgroundColor: '' } as CSSStyleDeclaration)
        : real(element),
    )

    await exportGraph(null, 'graphe')

    expect(render.mock.calls[0][1].backgroundColor).toBe(nightTokens.surface.canvas)
  })
})
