/**
 * Composant Header avec authentification et barre de recherche.
 */
import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useCommandPalette } from '../../hooks/useCommandPalette'
import { useGenerationActionsStore } from '../../store/generationActionsStore'
import { useGraphStore } from '../../store/graphStore'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { GenerationOptionsModal } from '../generation/GenerationOptionsModal'
import { theme } from '../../theme'

export function Header() {
  const { user, isAuthenticated, logout } = useAuthStore()
  const commandPalette = useCommandPalette()
  const { actions } = useGenerationActionsStore()
  const { isGenerating: isGraphGenerating } = useGraphStore()
  
  const [isOptionsModalOpen, setIsOptionsModalOpen] = useState(false)
  const [optionsModalInitialTab, setOptionsModalInitialTab] = useState<
    | 'context'
    | 'metadata'
    | 'general'
    | 'vocabulary'
    | 'gdd_notion'
    | 'prompts'
    | 'shortcuts'
    | 'usage'
    | 'logs'
  >('context')
  const [isActionsDropdownOpen, setIsActionsDropdownOpen] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const actionsDropdownRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)

  // Fermer les dropdowns quand on clique ailleurs
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionsDropdownRef.current && !actionsDropdownRef.current.contains(event.target as Node)) {
        setIsActionsDropdownOpen(false)
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const handleLogout = async () => {
    await logout()
  }

  const handleSearchClick = () => {
    commandPalette.open()
  }

  // Raccourci clavier pour ouvrir les options
  useKeyboardShortcuts(
    [
      {
        key: 'ctrl+,',
        handler: () => {
          if (isAuthenticated && user && actions.handleGenerate) {
            setOptionsModalInitialTab('context')
            setIsOptionsModalOpen(true)
          }
        },
        description: 'Ouvrir les options',
      },
    ],
    [isAuthenticated, user, actions.handleGenerate]
  )

  return (
    <header style={{ 
      padding: '0.4rem 1rem', 
      borderBottom: `1px solid ${theme.border.primary}`, 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center',
      backgroundColor: theme.background.secondary,
      gap: '1rem',
      position: 'relative',
    }}>
      {/* Section gauche : Titre */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
        <h1 style={{ margin: 0, color: theme.text.primary, fontSize: '1.25rem', fontWeight: 600, whiteSpace: 'nowrap' }}>DialogueGenerator</h1>
        <span style={{ 
          fontSize: '2rem', 
          fontWeight: 'bold', 
          color: 'red', 
          textShadow: '2px 2px 4px rgba(0,0,0,0.3)',
          marginLeft: '1rem'
        }}>
        </span>
        <span 
          title={`Date de compilation: ${new Date(__BUILD_DATE__).toLocaleString('fr-FR')}`}
          style={{ 
            color: theme.text.secondary, 
            fontSize: '0.75rem',
            whiteSpace: 'nowrap',
            fontFamily: 'monospace',
          }}
        >
          Build: {new Date(__BUILD_DATE__).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      
      {/* Section centrale : Barre de recherche */}
      {isAuthenticated && (
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', maxWidth: '600px', margin: '0 auto' }}>
          <div
            onClick={handleSearchClick}
            style={{
              width: '100%',
              maxWidth: '500px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 0.75rem',
              backgroundColor: theme.input.background,
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '4px',
              cursor: 'text',
              transition: 'border-color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = theme.border.focus
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = theme.border.primary
            }}
          >
            <span style={{ color: theme.text.secondary, fontSize: '0.875rem' }}>🔍</span>
            <span style={{ 
              flex: 1, 
              color: theme.text.secondary, 
              fontSize: '0.875rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              Rechercher des actions, personnages, lieux...
            </span>
            <kbd style={{
              padding: '0.125rem 0.375rem',
              fontSize: '0.75rem',
              backgroundColor: theme.background.tertiary,
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '3px',
              color: theme.text.secondary,
              fontFamily: 'monospace',
            }}>
              Ctrl+K
            </kbd>
          </div>
        </div>
      )}
      
      {/* Section droite : Options, Actions, Utilisateur */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
        {isAuthenticated && user && actions.handleGenerate && (
          <>
            {/* Bouton Options */}
            <button
              onClick={() => {
                setOptionsModalInitialTab('context')
                setIsOptionsModalOpen(true)
              }}
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.875rem',
                backgroundColor: theme.button.default.background,
                color: theme.button.default.color,
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '4px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Options
            </button>
            
            {/* Dropdown Actions */}
            <div
              ref={actionsDropdownRef}
              style={{
                position: 'relative',
                display: 'inline-block',
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setIsActionsDropdownOpen(!isActionsDropdownOpen)
                }}
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.875rem',
                  backgroundColor: theme.button.default.background,
                  color: theme.button.default.color,
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  whiteSpace: 'nowrap',
                }}
              >
                Actions
                <span style={{ fontSize: '0.7rem' }}>▼</span>
              </button>
              {isActionsDropdownOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 0.25rem)',
                    right: 0,
                    backgroundColor: theme.background.panel,
                    border: `1px solid ${theme.border.primary}`,
                    borderRadius: '4px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    zIndex: 1000,
                    minWidth: '150px',
                  }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (actions.handleExportUnity) {
                        actions.handleExportUnity()
                      }
                      setIsActionsDropdownOpen(false)
                    }}
                    disabled={actions.isLoading || isGraphGenerating}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      fontSize: '0.85rem',
                      backgroundColor: 'transparent',
                      color: (actions.isLoading || isGraphGenerating) ? theme.text.secondary : theme.text.primary,
                      border: 'none',
                      textAlign: 'left',
                      cursor: (actions.isLoading || isGraphGenerating) ? 'not-allowed' : 'pointer',
                      opacity: (actions.isLoading || isGraphGenerating) ? 0.6 : 1,
                      borderRadius: '4px 4px 0 0',
                    }}
                    onMouseEnter={(e) => {
                      if (!actions.isLoading && !isGraphGenerating) {
                        e.currentTarget.style.backgroundColor = theme.background.secondary
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    Exporter (Unity)
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (actions.handleReset) {
                        actions.handleReset()
                      }
                      setIsActionsDropdownOpen(false)
                    }}
                    disabled={actions.isLoading || isGraphGenerating}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      fontSize: '0.85rem',
                      backgroundColor: 'transparent',
                      color: (actions.isLoading || isGraphGenerating) ? theme.text.secondary : theme.text.primary,
                      border: 'none',
                      textAlign: 'left',
                      cursor: (actions.isLoading || isGraphGenerating) ? 'not-allowed' : 'pointer',
                      opacity: (actions.isLoading || isGraphGenerating) ? 0.6 : 1,
                      borderRadius: '0 0 4px 4px',
                    }}
                    onMouseEnter={(e) => {
                      if (!actions.isLoading && !isGraphGenerating) {
                        e.currentTarget.style.backgroundColor = theme.background.secondary
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>
          </>
        )}
        
        {isAuthenticated && user ? (
          <div
            ref={userMenuRef}
            style={{
              position: 'relative',
              display: 'inline-block',
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation()
                setIsUserMenuOpen(!isUserMenuOpen)
              }}
              aria-label={`Menu utilisateur ${user.username}`}
              aria-expanded={isUserMenuOpen}
              aria-haspopup="menu"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: theme.button.primary.background,
                color: theme.button.primary.color,
                border: `2px solid ${theme.border.primary}`,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.875rem',
                fontWeight: 'bold',
                transition: 'transform 0.2s, box-shadow 0.2s',
                boxShadow: isUserMenuOpen ? '0 2px 8px rgba(0, 0, 0, 0.3)' : 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)'
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)'
              }}
              onMouseLeave={(e) => {
                if (!isUserMenuOpen) {
                  e.currentTarget.style.transform = 'scale(1)'
                  e.currentTarget.style.boxShadow = 'none'
                }
              }}
              title={user.username}
            >
              {user.username ? user.username.charAt(0).toUpperCase() : '?'}
            </button>
            {isUserMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 0.5rem)',
                  right: 0,
                  backgroundColor: theme.background.panel,
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                  zIndex: 1000,
                  minWidth: '200px',
                  padding: '0.75rem',
                }}
              >
                <div
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderBottom: `1px solid ${theme.border.primary}`,
                    marginBottom: '0.5rem',
                  }}
                >
                  <div style={{ color: theme.text.secondary, fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                    Connecté en tant que
                  </div>
                  <div style={{ color: theme.text.primary, fontSize: '0.875rem', fontWeight: 'bold' }}>
                    {user.username}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsUserMenuOpen(false)
                    handleLogout()
                  }}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.875rem',
                    backgroundColor: theme.button.default.background,
                    color: theme.button.default.color,
                    border: `1px solid ${theme.border.primary}`,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme.background.secondary
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = theme.button.default.background
                  }}
                >
                  Déconnexion
                </button>
              </div>
            )}
          </div>
        ) : (
          <span style={{ color: theme.text.secondary, fontSize: '0.875rem' }}>Non connecté</span>
        )}
      </div>
      
      {/* Modal Options */}
      <GenerationOptionsModal
        isOpen={isOptionsModalOpen}
        onClose={() => setIsOptionsModalOpen(false)}
        initialTab={optionsModalInitialTab}
      />
    </header>
  )
}

