/**
 * Export du graphe en image : options passées à html-to-image.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { exportGraphToPNG, exportGraphToSVG } from './graphExport'

const htmlToImage = vi.hoisted(() => ({
  toPng: vi.fn(),
  toSvg: vi.fn(),
}))
vi.mock('html-to-image', () => htmlToImage)

type Options = { filter: (node: HTMLElement) => boolean; backgroundColor: string }

const EXPORTS = [
  ['PNG', exportGraphToPNG, htmlToImage.toPng],
  ['SVG', exportGraphToSVG, htmlToImage.toSvg],
] as const

describe.each(EXPORTS)('export %s', (_format, exportGraph, render) => {
  beforeEach(() => {
    document.body.innerHTML = '<div class="react-flow"></div>'
    render.mockReset().mockResolvedValue('data:,')
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  const options = async (): Promise<Options> => {
    await exportGraph(null, 'graphe')
    return render.mock.calls[0][1] as Options
  }

  // html-to-image applique le filtre à tous les enfants, texte compris : un nœud texte
  // n'a pas de `classList`, et l'export entier échouait.
  it('garde les nœuds texte et écarte contrôles et minimap', async () => {
    const { filter } = await options()
    const element = (className: string) => {
      const node = document.createElement('div')
      node.className = className
      return node
    }

    expect(filter(document.createTextNode('React Flow') as unknown as HTMLElement)).toBe(true)
    expect(filter(element('react-flow__node'))).toBe(true)
    expect(filter(element('react-flow__controls'))).toBe(false)
    expect(filter(element('react-flow__minimap'))).toBe(false)
  })
})
