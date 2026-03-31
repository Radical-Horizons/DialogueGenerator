/**
 * Composant Tabs réutilisable avec animations.
 *
 * keepAliveTabIds : liste d'IDs d'onglets à garder montés même quand inactifs (display:none).
 * Utile pour les onglets avec état DOM lourd (ex : ReactFlow) qui ne doivent pas être
 * démontés/remontés à chaque changement d'onglet pour préserver les positions visuelles.
 *
 * Lazy keepAlive : un onglet keepAlive n'est monté qu'après sa première activation,
 * évitant de rendre dans un conteneur de dimensions nulles (ex : warnings React Flow).
 */
import { ReactNode, useState, useEffect } from 'react'
import { theme } from '../../theme'

export interface Tab {
  id: string
  label: string
  content: ReactNode
  disabled?: boolean
}

export type TabsVariant = 'underline' | 'segmented'

export interface TabsProps {
  tabs: Tab[]
  activeTabId: string
  onTabChange: (tabId: string) => void
  /** underline = barre sous l’onglet actif ; segmented = pilules dans un rail (style app moderne). */
  variant?: TabsVariant
  style?: React.CSSProperties
  /**
   * Styles appliqués au conteneur de contenu (zone sous les onglets).
   * Utile pour désactiver le scroll interne quand le contenu gère déjà son propre overflow.
   */
  contentStyle?: React.CSSProperties
  /**
   * IDs des onglets à maintenir montés (via display:none) même quand ils ne sont pas actifs.
   * Évite les démontages/remontages coûteux pour les onglets avec état DOM lourd.
   */
  keepAliveTabIds?: string[]
}

export function Tabs({
  tabs,
  activeTabId,
  onTabChange,
  variant = 'underline',
  style,
  contentStyle,
  keepAliveTabIds,
}: TabsProps) {
  const activeTab = tabs.find((tab) => tab.id === activeTabId)
  const keepAliveSet = new Set(keepAliveTabIds ?? [])

  // Lazy keepAlive : ne monter un onglet keepAlive qu'après sa première activation.
  // Empêche React Flow (et d'autres composants) de se rendre dans un conteneur display:none
  // aux dimensions nulles (warning "parent container needs a width and a height").
  const [activatedTabIds, setActivatedTabIds] = useState<Set<string>>(() => new Set([activeTabId]))
  useEffect(() => {
    setActivatedTabIds((prev) => {
      if (prev.has(activeTabId)) return prev
      const next = new Set(prev)
      next.add(activeTabId)
      return next
    })
  }, [activeTabId])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
          ...(variant === 'segmented'
            ? {
                gap: '0.35rem',
                padding: '0.5rem 0.65rem',
                backgroundColor: theme.background.tertiary,
                borderBottom: `1px solid ${theme.border.primary}`,
              }
            : {
                borderBottom: `2px solid ${theme.border.primary}`,
                backgroundColor: theme.background.secondary,
              }),
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => !tab.disabled && onTabChange(tab.id)}
            disabled={tab.disabled}
            style={{
              ...(variant === 'segmented'
                ? {
                    padding: '0.45rem 0.95rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor:
                      tab.id === activeTabId ? theme.background.panel : 'transparent',
                    color:
                      tab.id === activeTabId
                        ? theme.text.primary
                        : theme.text.secondary,
                    boxShadow:
                      tab.id === activeTabId
                        ? `${theme.shadow.card}, 0 0 0 1px ${theme.border.primary}`
                        : 'none',
                    fontWeight: tab.id === activeTabId ? 600 : 500,
                  }
                : {
                    padding: '0.75rem 1.5rem',
                    border: 'none',
                    borderBottom:
                      tab.id === activeTabId
                        ? `3px solid ${theme.button.primary.background}`
                        : '3px solid transparent',
                    backgroundColor: 'transparent',
                    color:
                      tab.id === activeTabId
                        ? theme.text.primary
                        : theme.text.secondary,
                    fontWeight: tab.id === activeTabId ? 'bold' : 'normal',
                    position: 'relative',
                    bottom: '-2px',
                  }),
              cursor: tab.disabled ? 'not-allowed' : 'pointer',
              opacity: tab.disabled ? 0.5 : 1,
              transition: 'background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (tab.disabled) return
              if (variant === 'segmented' && tab.id !== activeTabId) {
                e.currentTarget.style.backgroundColor = theme.background.secondary
                e.currentTarget.style.color = theme.text.primary
              }
              if (variant === 'underline' && tab.id !== activeTabId) {
                e.currentTarget.style.color = theme.text.primary
              }
            }}
            onMouseLeave={(e) => {
              if (tab.disabled) return
              if (variant === 'segmented' && tab.id !== activeTabId) {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = theme.text.secondary
              }
              if (variant === 'underline' && tab.id !== activeTabId) {
                e.currentTarget.style.color = theme.text.secondary
              }
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {/* Onglets keep-alive : rendus mais masqués via display:none quand inactifs.
          Seulement après première activation (lazy) pour éviter les warnings React Flow. */}
      {tabs.filter((tab) => keepAliveSet.has(tab.id) && tab.id !== activeTabId && activatedTabIds.has(tab.id)).map((tab) => (
        <div key={tab.id} style={{ display: 'none', flex: 1, minHeight: 0 }}>
          {tab.content}
        </div>
      ))}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          height: contentStyle?.height !== undefined ? contentStyle.height : '100%',
          backgroundColor: theme.background.panel,
          boxShadow: theme.shadow.cardInset,
          display: contentStyle?.display !== undefined ? contentStyle.display : 'block',
          // Éviter les conflits entre overflow (shorthand) et overflowY/overflowX (non-shorthand)
          // Si contentStyle définit overflowY ou overflowX, utiliser ces propriétés au lieu de overflow
          ...(contentStyle?.overflowY !== undefined || contentStyle?.overflowX !== undefined
            ? {
                overflowY: contentStyle.overflowY ?? 'auto',
                overflowX: contentStyle.overflowX ?? 'hidden',
              }
            : {
                overflow: contentStyle?.overflow ?? 'auto',
              }),
          // Appliquer les autres propriétés de contentStyle (sauf celles déjà gérées ci-dessus)
          ...Object.fromEntries(
            Object.entries(contentStyle || {}).filter(
              ([key]) => !['overflow', 'overflowY', 'overflowX', 'height', 'display'].includes(key)
            )
          ),
        }}
      >
        {activeTab?.content}
      </div>
    </div>
  )
}

