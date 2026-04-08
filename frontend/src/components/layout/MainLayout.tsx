/**
 * Layout principal de l'application.
 */
import { Header } from './Header'
import { CommandPalette } from '../shared/CommandPalette'
import { useCommandPalette } from '../../hooks/useCommandPalette'
import { useViewportMode } from '../../hooks/useViewportMode'
import { useVisualViewportBottomInsetPx } from '../../hooks/useVisualViewportBottomInsetPx'
import { useShellKeyboardFocusScroller } from '../../hooks/useShellKeyboardFocusScroller'
import { shellSafeAreaCssVars } from '../../theme/responsiveChrome'
import { ReactNode, useEffect } from 'react'

interface MainLayoutProps {
  children: ReactNode
  fullWidth?: boolean
}

export function MainLayout({ children, fullWidth = false }: MainLayoutProps) {
  const commandPalette = useCommandPalette()
  const viewportMode = useViewportMode()
  const shellKeyboardNarrow = viewportMode !== 'desktop'
  const commandPaletteKeyboardInsetPx = useVisualViewportBottomInsetPx(shellKeyboardNarrow)
  useShellKeyboardFocusScroller(shellKeyboardNarrow)

  useEffect(() => {
    const prevHtmlOverflowX = document.documentElement.style.overflowX
    const prevBodyOverflowX = document.body.style.overflowX

    const next = 'hidden'
    if (document.documentElement.style.overflowX !== next) {
      document.documentElement.style.overflowX = next
    }
    if (document.body.style.overflowX !== next) {
      document.body.style.overflowX = next
    }

    return () => {
      document.documentElement.style.overflowX = prevHtmlOverflowX
      document.body.style.overflowX = prevBodyOverflowX
    }
  }, [])

  return (
    <div
      data-testid="main-layout-root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        // 100vh : ancrage flex historique ; minHeight 100dvh : barre d’adresse mobile sans casser desktop.
        height: '100vh',
        minHeight: '100dvh',
        overflow: 'hidden',
        boxSizing: 'border-box',
        paddingTop: `var(${shellSafeAreaCssVars.top})`,
        paddingRight: `var(${shellSafeAreaCssVars.right})`,
        paddingBottom: `var(${shellSafeAreaCssVars.bottom})`,
        paddingLeft: `var(${shellSafeAreaCssVars.left})`,
      }}
    >
      <Header />
      <main style={{ flex: 1, overflow: 'hidden', ...(fullWidth ? { padding: '2rem' } : {}) }}>
        {children}
      </main>
      <CommandPalette
        isOpen={commandPalette.isOpen}
        onClose={commandPalette.close}
        keyboardBottomInsetPx={commandPaletteKeyboardInsetPx}
      />
    </div>
  )
}

