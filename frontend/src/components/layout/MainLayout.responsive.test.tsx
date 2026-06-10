import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { shellSafeAreaCssVars } from '../../theme/responsiveChrome'

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

  it('17.4 : shell root applique env(safe-area-inset-*) via tokens responsiveChrome', async () => {
    const { MainLayout } = await import('./MainLayout')
    const { getByTestId } = render(<MainLayout><div>content</div></MainLayout>)
    const root = getByTestId('main-layout-root')
    const inline = root.getAttribute('style') ?? ''
    expect(inline).toContain(`var(${shellSafeAreaCssVars.top})`)
    expect(inline).toContain(`var(${shellSafeAreaCssVars.bottom})`)
    expect(inline).toContain(`var(${shellSafeAreaCssVars.left})`)
    expect(inline).toContain(`var(${shellSafeAreaCssVars.right})`)
  })
})

