/**
 * Modal d'aide affichant tous les raccourcis clavier disponibles.
 */
import { useState, useEffect } from 'react'
import { theme } from '../../theme'
import { getAllShortcuts, formatShortcut } from '../../hooks/useKeyboardShortcuts'
import {
  redesignFont,
  redesignHairline,
  redesignRadius,
  redesignSpacing,
  redesignText,
} from '../../theme/redesignTokens'
import { listRowHairlineBorder } from '../../theme/selectionTokens'

const KBD_STYLE: React.CSSProperties = {
  fontFamily: redesignFont.mono,
  fontSize: '10.5px',
  color: redesignText.muted,
  padding: '2px 6px',
  border: `1px solid ${redesignHairline.strong}`,
  borderRadius: '4px',
  backgroundColor: 'transparent',
  whiteSpace: 'nowrap',
}

export interface KeyboardShortcutsHelpProps {
  isOpen: boolean
  onClose: () => void
}

const DEFAULT_SHORTCUTS = [
  { key: 'ctrl+enter', description: 'Générer un dialogue' },
  { key: 'alt+s', description: 'Échanger les personnages (swap)' },
  { key: 'ctrl+k', description: 'Ouvrir la palette de commandes' },
  { key: '/', description: 'Filtrer dans le panneau de gauche' },
  { key: 'ctrl+e', description: 'Exporter le dialogue Unity' },
  { key: 'ctrl+s', description: 'Sauvegarder le dialogue' },
  { key: 'ctrl+n', description: 'Nouveau dialogue (réinitialiser)' },
  { key: 'ctrl+,', description: 'Ouvrir les options' },
  { key: 'escape', description: 'Fermer les modals/panels' },
  { key: 'ctrl+/', description: 'Afficher cette aide' },
  { key: 'ctrl+1', description: 'Naviguer vers Dashboard' },
  { key: 'ctrl+2', description: 'Naviguer vers Dialogues Unity' },
  { key: 'ctrl+3', description: 'Naviguer vers Usage/Statistiques' },
]

export function KeyboardShortcutsHelp({ isOpen, onClose }: KeyboardShortcutsHelpProps) {
  const [shortcuts, setShortcuts] = useState(DEFAULT_SHORTCUTS)

  useEffect(() => {
    if (isOpen) {
      // Récupérer les raccourcis dynamiques enregistrés
      const dynamicShortcuts = getAllShortcuts()
      const combined = [...DEFAULT_SHORTCUTS, ...dynamicShortcuts]
      
      // Dédupliquer par key (garder la première occurrence)
      const unique = new Map<string, { key: string; description: string }>()
      combined.forEach(s => {
        if (!unique.has(s.key)) {
          unique.set(s.key, s)
        }
      })
      
      setShortcuts(Array.from(unique.values()))
    }
  }, [isOpen])

  // Fermer avec Escape
  useEffect(() => {
    if (!isOpen) return
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: theme.background.elevated,
          border: `1px solid ${redesignHairline.strong}`,
          borderRadius: `${redesignRadius.frame}px`,
          padding: `${redesignSpacing.lg}px`,
          maxWidth: '600px',
          width: '90%',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxSizing: 'border-box',
          boxShadow: theme.shadow.card,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: `${redesignSpacing.md}px` }}>
          <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: redesignText.strong }}>Raccourcis clavier</h2>
          <button
            onClick={onClose}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = redesignHairline.rowHover
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
            style={{
              background: 'transparent',
              border: 'none',
              borderRadius: `${redesignRadius.control}px`,
              fontSize: '18px',
              lineHeight: 1,
              cursor: 'pointer',
              color: redesignText.muted,
              padding: `2px ${redesignSpacing.xs}px`,
            }}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {shortcuts.map((shortcut, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: `${redesignSpacing.md}px`,
                padding: `${redesignSpacing.sm}px 0`,
                borderBottom: listRowHairlineBorder,
              }}
            >
              <span style={{ fontSize: '13px', color: redesignText.body }}>{shortcut.description}</span>
              <kbd style={KBD_STYLE}>{formatShortcut(shortcut.key)}</kbd>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: `${redesignSpacing.md}px`,
            fontSize: '12px',
            color: redesignText.secondary,
            textAlign: 'center',
          }}
        >
          Appuyez sur <kbd style={KBD_STYLE}>Esc</kbd> pour fermer
        </div>
      </div>
    </div>
  )
}

