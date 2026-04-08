import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('./Header', () => ({
  Header: () => <div data-testid="header" />,
}))

vi.mock('../shared/CommandPalette', () => ({
  CommandPalette: () => null,
}))

vi.mock('../../hooks/useCommandPalette', () => ({
  useCommandPalette: () => ({
    isOpen: false,
    close: vi.fn(),
    open: vi.fn(),
  }),
}))

describe('MainLayout responsive shell', () => {
  it('force l’absence d’overflow horizontal global (html/body)', async () => {
    const prevHtmlOverflowX = document.documentElement.style.overflowX
    const prevBodyOverflowX = document.body.style.overflowX

    const { MainLayout } = await import('./MainLayout')
    const { unmount } = render(<MainLayout><div>content</div></MainLayout>)

    expect(document.documentElement.style.overflowX).toBe('hidden')
    expect(document.body.style.overflowX).toBe('hidden')

    unmount()

    expect(document.documentElement.style.overflowX).toBe(prevHtmlOverflowX)
    expect(document.body.style.overflowX).toBe(prevBodyOverflowX)
  })
})

