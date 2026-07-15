/**
 * Composant Header avec authentification et barre de recherche.
 */
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useCommandPalette } from '../../hooks/useCommandPalette'
import { useGenerationActionsStore } from '../../store/generationActionsStore'
import { useGraphStore } from '../../store/graphStore'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { GenerationOptionsModal } from '../generation/GenerationOptionsModal'
import { UnityBatchExportActionsMenuItems } from '../unityDialogues/UnityBatchExportActionsMenuItems'
import { useUnityBatchExportMenuStore } from '../../store/unityBatchExportMenuStore'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import { TOUCH_TARGET_MIN_PX } from '../../constants'

export function Header() {
  const { user, isAuthenticated, logout } = useAuthStore()
  const navigate = useNavigate()
  const commandPalette = useCommandPalette()
  const { actions } = useGenerationActionsStore()
  const { isGenerating: isGraphGenerating } = useGraphStore()
  const unityBatchExportMenu = useUnityBatchExportMenuStore((s) => s.menu)
  
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
  >('general')
  const [isActionsDropdownOpen, setIsActionsDropdownOpen] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const actionsDropdownRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)

  // Fermer les dropdowns quand on clique ailleurs
  useEffect(() => {
    const handleClickOutside = (event: Event) => {
      const t = event.target as Node
      if (actionsDropdownRef.current && !actionsDropdownRef.current.contains(t)) {
        setIsActionsDropdownOpen(false)
      }
      if (userMenuRef.current && !userMenuRef.current.contains(t)) {
        setIsUserMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('pointerdown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('pointerdown', handleClickOutside)
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
            setOptionsModalInitialTab('general')
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
      flexWrap: 'wrap',
      rowGap: '0.5rem',
      backgroundColor: theme.background.secondary,
      gap: '1rem',
      position: 'relative',
      minWidth: 0,
      width: '100%',
      boxSizing: 'border-box',
    }}>
      {/* Section gauche : Titre */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
        <h1 style={{ margin: 0, color: theme.text.primary, fontSize: remSize('title'), fontWeight: 600, whiteSpace: 'nowrap' }}>DialogueGenerator</h1>
        <span 
          title={`Date de compilation: ${new Date(__BUILD_DATE__).toLocaleString('fr-FR')}`}
          style={{ 
            color: theme.text.secondary, 
            fontSize: remSize('small'),
            whiteSpace: 'nowrap',
            fontFamily: 'monospace',
          }}
        >
          Build: {new Date(__BUILD_DATE__).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      
      {/* Section centrale : Barre de recherche */}
      {isAuthenticated && (
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', maxWidth: '600px', margin: '0 auto', minWidth: 0 }}>
          <div
            onClick={handleSearchClick}
            style={{
              width: '100%',
              maxWidth: '500px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              minHeight: TOUCH_TARGET_MIN_PX,
              boxSizing: 'border-box',
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
            <span style={{ color: theme.text.secondary, fontSize: remSize('body') }}>🔍</span>
            <span style={{ 
              flex: 1, 
              color: theme.text.secondary, 
              fontSize: remSize('body'),
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              Rechercher des actions, personnages, lieux...
            </span>
            <kbd style={{
              padding: '0.125rem 0.375rem',
              fontSize: remSize('caption'),
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
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.75rem', flexShrink: 1, minWidth: 0, flexWrap: 'wrap' }}>
        {isAuthenticated && user && actions.handleGenerate && (
          <>
            {/* Bouton Options */}
            <button
              onClick={() => {
                setOptionsModalInitialTab('general')
                setIsOptionsModalOpen(true)
              }}
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: remSize('body'),
                backgroundColor: theme.button.default.background,
                color: theme.button.default.color,
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '4px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                minWidth: TOUCH_TARGET_MIN_PX,
                minHeight: TOUCH_TARGET_MIN_PX,
                boxSizing: 'border-box',
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
                data-testid="header-actions-dropdown"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsActionsDropdownOpen(!isActionsDropdownOpen)
                }}
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: remSize('body'),
                  backgroundColor: theme.button.default.background,
                  color: theme.button.default.color,
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  whiteSpace: 'nowrap',
                  minWidth: TOUCH_TARGET_MIN_PX,
                  minHeight: TOUCH_TARGET_MIN_PX,
                  boxSizing: 'border-box',
                }}
              >
                Actions
                <span style={{ fontSize: remSize('caption') }}>▼</span>
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
                    minWidth: '220px',
                  }}
                >
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
                      fontSize: remSize('accent'),
                      backgroundColor: 'transparent',
                      color: (actions.isLoading || isGraphGenerating) ? theme.text.secondary : theme.text.primary,
                      border: 'none',
                      textAlign: 'left',
                      cursor: (actions.isLoading || isGraphGenerating) ? 'not-allowed' : 'pointer',
                      opacity: (actions.isLoading || isGraphGenerating) ? 0.6 : 1,
                      borderRadius: unityBatchExportMenu ? '4px 4px 0 0' : '4px',
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
                  {unityBatchExportMenu && (
                    <UnityBatchExportActionsMenuItems
                      batch={unityBatchExportMenu}
                      onClose={() => setIsActionsDropdownOpen(false)}
                    />
                  )}
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
                width: TOUCH_TARGET_MIN_PX,
                height: TOUCH_TARGET_MIN_PX,
                borderRadius: '50%',
                backgroundColor: theme.button.primary.background,
                color: theme.button.primary.color,
                border: `2px solid ${theme.border.primary}`,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: remSize('body'),
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
                  <div style={{ color: theme.text.secondary, fontSize: remSize('small'), marginBottom: '0.25rem' }}>
                    Connecté en tant que
                  </div>
                  <div style={{ color: theme.text.primary, fontSize: remSize('body'), fontWeight: 'bold' }}>
                    {user.username}
                  </div>
                </div>
                {user.role === 'admin' && user.is_active && (
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      setIsUserMenuOpen(false)
                      navigate('/admin/users')
                    }}
                    style={{
                      width: '100%',
                      minHeight: TOUCH_TARGET_MIN_PX,
                      marginBottom: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      fontSize: remSize('body'),
                      backgroundColor: theme.button.default.background,
                      color: theme.button.default.color,
                      border: `1px solid ${theme.border.primary}`,
                      borderRadius: '4px',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    Gérer les utilisateurs
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsUserMenuOpen(false)
                    handleLogout()
                  }}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    fontSize: remSize('body'),
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
          <span style={{ color: theme.text.secondary, fontSize: remSize('body') }}>Non connecté</span>
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

