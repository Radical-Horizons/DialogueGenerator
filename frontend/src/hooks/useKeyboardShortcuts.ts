/**
 * Hook centralisé pour gérer les raccourcis clavier de l'application.
 * Évite les conflits de raccourcis en utilisant un registre centralisé.
 */
import { useEffect, useRef } from 'react'
import { isApplePlatform } from '../utils/platformShortcut'

export interface KeyboardShortcut {
  /** Combinaison de touches (ex: "ctrl+k", "alt+s", "/") */
  key: string
  /** Callback à exécuter quand le raccourci est pressé */
  handler: (event: KeyboardEvent) => void
  /** Description du raccourci pour l'aide */
  description: string
  /** Priorité (plus élevé = exécuté en premier) */
  priority?: number
  /** Si true, le handler peut empêcher la propagation */
  preventDefault?: boolean
  /** Si true, le handler peut empêcher la propagation à d'autres listeners */
  stopPropagation?: boolean
  /** Condition pour activer le raccourci (ex: si un modal est ouvert). Peut être une fonction pour évaluation dynamique */
  enabled?: boolean | (() => boolean)
  /** ID interne (généré automatiquement) */
  id?: string
}

type ShortcutRegistry = Map<string, KeyboardShortcut[]>

// Registre global des raccourcis (partagé entre toutes les instances)
const globalRegistry: ShortcutRegistry = new Map()

/**
 * Parse une combinaison de touches en format normalisé.
 * Exemples: "ctrl+k" -> { ctrl: true, key: "k" }
 */
function parseShortcut(shortcut: string): { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean; key: string } {
  const parts = shortcut.toLowerCase().split(/[+_-]/).map(s => s.trim())
  const result: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean; key: string } = { key: '' }
  
  for (const part of parts) {
    if (part === 'ctrl' || part === 'control') result.ctrl = true
    else if (part === 'alt') result.alt = true
    else if (part === 'shift') result.shift = true
    else if (part === 'meta' || part === 'cmd') result.meta = true
    else result.key = part
  }
  
  return result
}

/**
 * Vérifie si un événement correspond à un raccourci parsé.
 */
function matchesShortcut(event: KeyboardEvent, parsed: ReturnType<typeof parseShortcut>): boolean {
  // Défensif: certains événements peuvent ne pas fournir event.key
  if (!event.key) return false
  // Défensif: raccourci mal parsé (clé manquante)
  if (!parsed.key) return false

  // Sur Apple, le modificateur d'usage est Cmd : un raccourci declare `ctrl+k`
  // doit y repondre a Cmd+K, sinon le libelle « ⌘K » du chrome annonce un
  // raccourci qui n'existe pas. Voir `utils/platformShortcut.ts`.
  if (parsed.ctrl && !(event.ctrlKey || (isApplePlatform() && event.metaKey))) return false
  if (parsed.alt && !event.altKey) return false
  if (parsed.shift && !event.shiftKey) return false
  if (parsed.meta && !event.metaKey) return false
  
  // Gérer les touches spéciales
  const eventKey = event.key.toLowerCase()
  if (parsed.key === 'enter' && eventKey !== 'enter') return false
  if (parsed.key === 'escape' && eventKey !== 'escape') return false
  if (parsed.key === 'space' && eventKey !== ' ') return false
  if (parsed.key === 'tab' && eventKey !== 'tab') return false
  if (parsed.key === 'delete' && eventKey !== 'delete') return false
  if (parsed.key === 'backspace' && eventKey !== 'backspace') return false
  
  // Pour les touches normales, comparer directement
  if (parsed.key.length === 1 && eventKey === parsed.key) return true
  if (parsed.key.length > 1 && eventKey === parsed.key) return true
  
  // Gérer le cas spécial "/" qui peut être pressé directement
  if (parsed.key === '/' && eventKey === '/' && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) return true
  
  return false
}

/**
 * Hook pour enregistrer des raccourcis clavier.
 * 
 * @param shortcuts Liste des raccourcis à enregistrer
 * @param deps Dépendances pour recréer les handlers (comme useCallback)
 * 
 * @example
 * ```tsx
 * useKeyboardShortcuts([
 *   {
 *     key: 'ctrl+k',
 *     handler: () => openCommandPalette(),
 *     description: 'Ouvrir la palette de commandes',
 *   },
 * ], [openCommandPalette])
 * ```
 */
export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  deps: React.DependencyList = []
): void {
  const shortcutsRef = useRef(shortcuts)
  const depsRef = useRef(deps)
  
  // Mettre à jour la ref quand les shortcuts ou deps changent
  useEffect(() => {
    shortcutsRef.current = shortcuts
    depsRef.current = deps
  }, [shortcuts, deps])
  
  useEffect(() => {
    // Enregistrer les raccourcis avec un identifiant unique
    const registeredIds: Array<{ key: string; id: string }> = []
    
    // Utiliser les shortcuts depuis la ref pour avoir les dernières valeurs (mises à jour via le useEffect précédent)
    const currentShortcuts = shortcutsRef.current
    
    currentShortcuts.forEach(shortcut => {
      const id = `${shortcut.key}:${shortcut.description}:${Math.random().toString(36).substring(7)}`
      registeredIds.push({ key: shortcut.key, id })
      
      if (!globalRegistry.has(shortcut.key)) {
        globalRegistry.set(shortcut.key, [])
      }
      const registered = globalRegistry.get(shortcut.key)!
      registered.push({ ...shortcut, id })
      // Trier par priorité (décroissante)
      registered.sort((a, b) => (b.priority || 0) - (a.priority || 0))
    })
    
    // Handler global
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignorer si l'utilisateur tape dans un input, textarea, ou contenteditable
      const target = event.target as HTMLElement
      const isInputElement = 
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      
      // Certains raccourcis doivent fonctionner même dans les inputs (ex: Ctrl+S, Ctrl+E)
      // Note: "/" n'est PAS autorisé dans les inputs car c'est un caractère normal de saisie
      const allowedInInputs = ['ctrl+s', 'ctrl+e', 'ctrl+k', 'ctrl+shift+f', 'ctrl+alt+f', 'escape', 'ctrl+/']
      
      const isAllowedInInput = allowedInInputs.some(allowed => {
        const parsed = parseShortcut(allowed)
        return matchesShortcut(event, parsed)
      })
      
      if (isInputElement && !isAllowedInInput) {
        return // Ne pas intercepter les raccourcis dans les champs de saisie
      }
      
      // Parcourir tous les raccourcis enregistrés
      for (const [key, registeredShortcuts] of globalRegistry.entries()) {
        const parsed = parseShortcut(key)
        
        if (matchesShortcut(event, parsed)) {
          // Trouver le premier raccourci activé et prioritaire
          for (const shortcut of registeredShortcuts) {
            // Évaluer enabled dynamiquement si c'est une fonction, sinon utiliser la valeur statique
            const isEnabled = typeof shortcut.enabled === 'function' 
              ? shortcut.enabled() 
              : shortcut.enabled !== false
            
            if (isEnabled) {
              if (shortcut.preventDefault !== false) {
                event.preventDefault()
              }
              if (shortcut.stopPropagation) {
                event.stopPropagation()
              }
              
              try {
                shortcut.handler(event)
              } catch (error) {
                console.error('Erreur dans le handler de raccourci clavier:', error)
              }
              
              return // Arrêter après le premier handler exécuté
            }
          }
        }
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    
    // Nettoyer lors du démontage
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      
      // Retirer les raccourcis de cette instance par leur ID
      registeredIds.forEach(({ key, id }) => {
        const registered = globalRegistry.get(key)
        if (registered) {
          const index = registered.findIndex(s => s.id === id)
          if (index !== -1) {
            registered.splice(index, 1)
          }
          if (registered.length === 0) {
            globalRegistry.delete(key)
          }
        }
      })
    }
  }, []) // Exécuter seulement au montage/démontage
}

/**
 * Hook utilitaire pour créer un raccourci simple.
 */
export function useKeyboardShortcut(
  key: string,
  handler: (event: KeyboardEvent) => void,
  description: string,
  deps: React.DependencyList = []
): void {
  useKeyboardShortcuts([{ key, handler, description }], deps)
}

/**
 * Formate une combinaison de touches pour affichage.
 */
export function formatShortcut(key: string): string {
  const parts = key.split(/[+_-]/).map(s => s.trim())
  const formatted: string[] = []
  
  for (const part of parts) {
    if (part === 'ctrl' || part === 'control') formatted.push('Ctrl')
    else if (part === 'alt') formatted.push('Alt')
    else if (part === 'shift') formatted.push('Shift')
    else if (part === 'meta' || part === 'cmd') formatted.push('Cmd')
    else if (part === 'enter') formatted.push('Enter')
    else if (part === 'escape') formatted.push('Esc')
    else if (part === 'space') formatted.push('Space')
    else if (part === 'tab') formatted.push('Tab')
    else formatted.push(part.toUpperCase())
  }
  
  return formatted.join(' + ')
}

/**
 * Récupère tous les raccourcis enregistrés (pour l'aide).
 */
export function getAllShortcuts(): Array<{ key: string; description: string }> {
  const result: Array<{ key: string; description: string }> = []
  const seen = new Set<string>()
  
  for (const [key, shortcuts] of globalRegistry.entries()) {
    for (const shortcut of shortcuts) {
      const id = `${key}:${shortcut.description}`
      if (!seen.has(id)) {
        seen.add(id)
        result.push({ key, description: shortcut.description })
      }
    }
  }
  
  return result.sort((a, b) => a.key.localeCompare(b.key))
}

