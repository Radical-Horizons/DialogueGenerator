/**
 * Point d'entrée : les tokens sont sur `:root` avant le premier rendu.
 */
import { describe, it, expect, vi } from 'vitest'

const seen = vi.hoisted(() => ({ accentAtRender: '' }))

vi.mock('./App.tsx', () => ({ default: () => null }))
vi.mock('react-dom/client', () => ({
  default: {
    createRoot: () => ({
      render: () => {
        seen.accentAtRender = getComputedStyle(document.documentElement)
          .getPropertyValue('--dg-accent-base')
          .trim()
      },
    }),
  },
}))

describe('main', () => {
  it('publie les tokens avant le premier rendu', async () => {
    document.body.innerHTML = '<div id="root"></div>'

    await import('./main')

    expect(seen.accentAtRender).toBe('#4f7fff')
  })
})
