/**
 * Layout principal de l'application.
 */
import { Header } from './Header'
import { CommandPalette } from '../shared/CommandPalette'
import { useCommandPalette } from '../../hooks/useCommandPalette'
import { ReactNode, useEffect } from 'react'

interface MainLayoutProps {
  children: ReactNode
  fullWidth?: boolean
}

export function MainLayout({ children, fullWidth = false }: MainLayoutProps) {
  const commandPalette = useCommandPalette()

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Header />
      <main style={{ flex: 1, overflow: 'hidden', ...(fullWidth ? { padding: '2rem' } : {}) }}>
        {children}
      </main>
      <CommandPalette
        isOpen={commandPalette.isOpen}
        onClose={commandPalette.close}
      />
    </div>
  )
}

