/**
 * Composant pour afficher le prompt structuré avec sections dépliables.
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { parsePromptSections, parsePromptFromJson, type PromptSection } from '../../hooks/usePromptPreview'
import { renderMarkdown } from '../../utils/markdownRenderer'
import { prettifyJsonInText } from '../../utils/jsonPrettifier'
import { theme } from '../../theme'
import type { PromptStructure } from '../../types/prompt'

/**
 * Nettoie le titre pour l'affichage en retirant les préfixes "SECTION X".
 * Ne modifie pas le titre original, uniquement utilisé pour l'affichage.
 */
function cleanSectionTitle(title: string): string {
  // Retirer les préfixes "SECTION X." ou "SECTION XA." etc.
  return title.replace(/^SECTION \d+[A-Z]?\.\s*/i, '').trim()
}

export interface StructuredPromptViewProps {
  /** Le prompt complet à afficher (texte brut, fallback si structuredPrompt absent) */
  prompt: string
  /** Structure JSON du prompt (prioritaire si disponible) */
  structuredPrompt?: PromptStructure | null
  /** Sections déjà parsées par le parent (évite le double parsing) */
  sections?: PromptSection[]
  /** Callback pour exposer l'état allExpanded et la fonction toggleAll (pour le bouton externe) */
  onToggleStateChange?: (allExpanded: boolean, toggleAll: () => void) => void
}

/**
 * Composant accordéon pour une section du prompt (récursif pour supporter l'imbrication).
 */
function AccordionSection({ 
  section, 
  defaultExpanded = false,
  isControlled = false,
  controlledExpanded = false,
  onToggle,
  level = 0,
  sectionKey = '',
  expandedKeys = new Set<string>(),
  onToggleKey,
}: { 
  section: PromptSection
  defaultExpanded?: boolean
  isControlled?: boolean
  controlledExpanded?: boolean
  onToggle?: () => void
  level?: number
  sectionKey?: string
  expandedKeys?: Set<string>
  onToggleKey?: (key: string) => void
}) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded)
  const isExpanded = isControlled ? (sectionKey ? expandedKeys.has(sectionKey) : controlledExpanded) : internalExpanded
  
  // Détecter si le contenu est principalement du JSON
  const isMainlyJson = useMemo(() => {
    try {
      JSON.parse(section.content.trim())
      return true
    } catch {
      return false
    }
  }, [section.content])
  
  // Prettifier le JSON si présent
  const processedContent = useMemo(() => {
    // Si le contenu est entièrement du JSON, formater directement
    if (isMainlyJson) {
      try {
        const parsed = JSON.parse(section.content.trim())
        return JSON.stringify(parsed, null, 2)
      } catch {
        // En cas d'erreur, retourner le contenu original
        return section.content
      }
    }
    // Sinon, utiliser prettifyJsonInText pour les blocs JSON dans le texte
    if (section.hasJson) {
      return prettifyJsonInText(section.content)
    }
    return section.content
  }, [section.content, section.hasJson, isMainlyJson])
  
  const handleToggle = () => {
    if (isControlled) {
      if (sectionKey && onToggleKey) {
        onToggleKey(sectionKey)
      } else if (onToggle) {
        onToggle()
      }
    } else {
      setInternalExpanded(!internalExpanded)
    }
  }
  
  const hasChildren = section.children && section.children.length > 0
  const hasContent = section.content.trim().length > 0
  
  return (
    <div
      style={{
        border: `1px solid ${theme.border.primary}`,
        borderRadius: '4px',
        marginBottom: level > 0 ? '0.75rem' : '0.5rem',
        marginLeft: level > 0 ? `${level * 0.75}rem` : '0',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={handleToggle}
        style={{
          width: '100%',
          padding: '0.75rem 1rem',
          backgroundColor: isExpanded ? theme.background.secondary : theme.background.panel,
          border: 'none',
          borderBottom: isExpanded ? `1px solid ${theme.border.primary}` : 'none',
          color: theme.text.primary,
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.9rem',
          fontWeight: '500',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => {
          if (!isExpanded) {
            e.currentTarget.style.backgroundColor = theme.background.secondary
          }
        }}
        onMouseLeave={(e) => {
          if (!isExpanded) {
            e.currentTarget.style.backgroundColor = theme.background.panel
          }
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>{cleanSectionTitle(section.title)}</span>
          {section.tokenCount !== undefined && (
            <span
              style={{
                fontSize: '0.75rem',
                color: theme.text.secondary,
                fontWeight: 'normal',
              }}
            >
              ({section.tokenCount.toLocaleString()} tokens)
            </span>
          )}
        </span>
        <span
          style={{
            fontSize: '0.75rem',
            color: theme.text.secondary,
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
            display: 'inline-block',
          }}
        >
          ▼
        </span>
      </button>
      
      {isExpanded && (
        <div
          style={{
            padding: '1rem',
            backgroundColor: theme.background.secondary,
            color: theme.text.primary,
            fontSize: '0.85rem',
            lineHeight: '1.7',
          }}
        >
          {/* Afficher le contenu (remainingContent) AVANT les enfants pour respecter l'ordre du prompt */}
          {hasContent && (
            <div 
              style={{ 
                marginBottom: hasChildren ? '1.25rem' : '0',
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
              }}
            >
              {isMainlyJson ? (
                <pre
                  style={{
                    margin: 0,
                    padding: '0.75rem',
                    backgroundColor: '#1e1e1e',
                    borderRadius: '4px',
                    overflow: 'auto',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                    color: theme.text.primary,
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                    lineHeight: '1.6',
                  }}
                >
                  {processedContent}
                </pre>
              ) : (
                <div 
                  style={{ 
                    whiteSpace: 'pre-wrap', 
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                    lineHeight: '1.7',
                  }}
                >
                  {renderMarkdown(processedContent)}
                </div>
              )}
            </div>
          )}
          
          {/* Afficher les enfants comme accordéons imbriqués après le contenu */}
          {hasChildren && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {section.children!.map((child, index) => (
                <AccordionSection
                  key={`${child.title}-${index}`}
                  section={child}
                  defaultExpanded={false}
                  isControlled={true}
                  level={level + 1}
                  sectionKey={`${sectionKey}-${index}`}
                  expandedKeys={expandedKeys}
                  onToggleKey={onToggleKey}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Collecte récursivement toutes les clés hiérarchiques d'une section et de ses enfants.
 */
function collectAllKeys(sections: PromptSection[], prefix: string = ''): string[] {
  const keys: string[] = []
  sections.forEach((section, index) => {
    const key = prefix ? `${prefix}-${index}` : `${index}`
    keys.push(key)
    if (section.children && section.children.length > 0) {
      keys.push(...collectAllKeys(section.children, key))
    }
  })
  return keys
}

export function StructuredPromptView({ prompt, structuredPrompt, sections: sectionsProp, onToggleStateChange }: StructuredPromptViewProps) {
  const sections = useMemo(() => {
    // Réutiliser les sections fournies par le parent (évite le double parsing)
    if (sectionsProp && sectionsProp.length > 0) {
      return sectionsProp
    }
    // Priorité au JSON structuré si disponible
    if (structuredPrompt) {
      return parsePromptFromJson(structuredPrompt)
    }
    // Fallback sur parsing texte
    return parsePromptSections(prompt)
  }, [sectionsProp, prompt, structuredPrompt])
  
  const [allExpanded, setAllExpanded] = useState(false)
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  
  // Collecter toutes les clés disponibles
  const allKeys = useMemo(() => {
    return collectAllKeys(sections)
  }, [sections])
  
  const toggleAll = useCallback(() => {
    setAllExpanded((prev) => {
      const newExpanded = !prev
      // Mettre à jour expandedKeys en fonction du nouvel état
      if (newExpanded) {
        setExpandedKeys(new Set(allKeys))
      } else {
        setExpandedKeys(new Set())
      }
      return newExpanded
    })
  }, [allKeys])
  
  // Exposer l'état et la fonction toggleAll au parent via callback
  useEffect(() => {
    if (onToggleStateChange) {
      onToggleStateChange(allExpanded, toggleAll)
    }
  }, [allExpanded, toggleAll, onToggleStateChange])
  
  const toggleKey = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
        // Si on ferme une section, fermer aussi toutes ses sous-sections
        const keysToRemove = allKeys.filter(k => k.startsWith(key + '-'))
        keysToRemove.forEach(k => next.delete(k))
        if (next.size === 0) {
          setAllExpanded(false)
        }
      } else {
        next.add(key)
        // Vérifier si toutes les sections sont maintenant ouvertes
        if (next.size === allKeys.length) {
          setAllExpanded(true)
        }
      }
      return next
    })
  }
  
  if (sections.length === 0) {
    return (
      <div
        style={{
          padding: '2rem',
          textAlign: 'center',
          color: theme.text.secondary,
        }}
      >
        Aucune section trouvée dans le prompt.
      </div>
    )
  }
  
  return (
    <div style={{ padding: '0.5rem 0' }}>
      {sections.map((section, index) => (
        <AccordionSection
          key={`${section.title}-${index}`}
          section={section}
          defaultExpanded={false}
          isControlled={true}
          level={0}
          sectionKey={`${index}`}
          expandedKeys={expandedKeys}
          onToggleKey={toggleKey}
        />
      ))}
    </div>
  )
}


