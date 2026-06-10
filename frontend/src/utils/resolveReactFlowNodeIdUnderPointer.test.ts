/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resolveReactFlowNodeIdUnderPointer } from './resolveReactFlowNodeIdUnderPointer'

describe('resolveReactFlowNodeIdUnderPointer', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    Reflect.deleteProperty(document, 'elementFromPoint')
    container.remove()
  })

  it('retourne le data-id du nœud sous le pointeur', () => {
    const node = document.createElement('div')
    node.className = 'react-flow__node'
    node.setAttribute('data-id', 'node-b')
    node.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 } as DOMRect)
    container.appendChild(node)

    Object.defineProperty(document, 'elementFromPoint', {
      value: () => node,
      configurable: true,
    })

    const ev = new MouseEvent('mouseup', { clientX: 50, clientY: 50 })
    expect(resolveReactFlowNodeIdUnderPointer(ev, container)).toBe('node-b')
  })

  it('retourne null si le pointeur est hors du conteneur', () => {
    Object.defineProperty(document, 'elementFromPoint', {
      value: () => document.body,
      configurable: true,
    })
    const ev = new MouseEvent('mouseup', { clientX: 1, clientY: 1 })
    expect(resolveReactFlowNodeIdUnderPointer(ev, container)).toBeNull()
  })

  it('retourne null pour la minimap / controls', () => {
    const mini = document.createElement('div')
    mini.className = 'react-flow__minimap'
    container.appendChild(mini)
    Object.defineProperty(document, 'elementFromPoint', {
      value: () => mini,
      configurable: true,
    })
    const ev = new MouseEvent('mouseup', { clientX: 5, clientY: 5 })
    expect(resolveReactFlowNodeIdUnderPointer(ev, container)).toBeNull()
  })
})
