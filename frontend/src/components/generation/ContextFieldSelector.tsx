/**
 * Composant pour sélectionner les champs de contexte à inclure.
 */
import { useState, useMemo, useCallback, useEffect } from 'react'
import { useContextConfigStore, type FieldInfo } from '../../store/contextConfigStore'
import { theme } from '../../theme'
import { InfoIcon } from '../shared/Tooltip'
import { fieldPathTreeHierarchy } from './fieldPathTreeHierarchy'

export interface ContextFieldSelectorProps {
  elementType: string
  onFieldsChange?: (fields: string[]) => void
  showOnlyEssential?: boolean  // Si true, n'affiche que les champs essentiels
}

interface FieldNode {
  path: string
  label: string
  fieldInfo: FieldInfo
  children: FieldNode[]
  parent?: FieldNode
}

function isEnabledFlag(value: boolean | string | undefined): boolean {
  return value === true || value === 'true'
}

export function ContextFieldSelector({
  elementType,
  onFieldsChange,
  showOnlyEssential = false,
}: ContextFieldSelectorProps) {
  const {
    availableFields,
    uniqueFieldsByItem,
    fieldConfigs,
    suggestions,
    toggleField,
    detectFields,
    isLoading,
    error,
  } = useContextConfigStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())

  // Charger les champs au montage
  useEffect(() => {
    if (!availableFields[elementType] || Object.keys(availableFields[elementType]).length === 0) {
      detectFields(elementType).catch(console.error)
    }
  }, [elementType, availableFields, detectFields])

  // Construire l'arbre hiérarchique
  const fieldTree = useMemo(() => {
    const fields = availableFields[elementType] || {}
    const root: FieldNode[] = []
    const nodeMap = new Map<string, FieldNode>()

    // Filtrer les champs selon showOnlyEssential
    // showOnlyEssential=true affiche les métadonnées (is_metadata=true)
    // showOnlyEssential=false affiche le contexte narratif (is_metadata=false)
    // Exclure les champs uniques (is_unique=true) de la liste normale
    const filteredFields = showOnlyEssential
      ? Object.fromEntries(
          Object.entries(fields).filter(([, fieldInfo]: [string, FieldInfo]) => 
            isEnabledFlag(fieldInfo.is_metadata) && !fieldInfo.is_unique
          )
        )
      : Object.fromEntries(
          Object.entries(fields).filter(([, fieldInfo]: [string, FieldInfo]) => 
            !isEnabledFlag(fieldInfo.is_metadata) && !fieldInfo.is_unique
          )
        )

    // Créer tous les nœuds
    for (const [path, fieldInfo] of Object.entries(filteredFields)) {
      const { displayParts, mapKeys } = fieldPathTreeHierarchy(path)

      for (let i = 0; i < displayParts.length; i++) {
        const part = displayParts[i]
        const currentPath = mapKeys[i]

        if (!nodeMap.has(currentPath)) {
          const isLeaf = i === displayParts.length - 1
          // Pour les nœuds feuilles, extraire uniquement le dernier segment du label
          // (le backend génère "Parent > Child" mais on veut juste "Child" ici)
          // Pour les nœuds intermédiaires, générer le label à partir de la partie du path
          let nodeLabel: string
          if (isLeaf) {
            // Extraire uniquement le dernier segment du label (après le dernier " > ")
            const labelParts = fieldInfo.label.split(' > ')
            nodeLabel = labelParts[labelParts.length - 1] || fieldInfo.label
          } else {
            // Générer le label à partir de la partie du path
            nodeLabel = part.replace(/_/g, ' ').replace(/-/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
          }
          
          const node: FieldNode = {
            path: currentPath,
            label: nodeLabel,
            fieldInfo: isLeaf ? fieldInfo : {
              path: currentPath,
              label: part,
              type: 'dict',
              depth: i,
              frequency: 1.0,
              suggested: false,
            },
            children: [],
            parent: i > 0 ? nodeMap.get(mapKeys[i - 1]) : undefined,
          }
          nodeMap.set(currentPath, node)
          
          if (i === 0) {
            root.push(node)
          } else {
            const parentPath = mapKeys[i - 1]
            const parent = nodeMap.get(parentPath)
            if (parent) {
              parent.children.push(node)
            }
          }
        }
      }
    }

    // Aplatir les nœuds qui n'ont qu'un seul enfant
    const flattenSingleChildNodes = (nodes: FieldNode[]): FieldNode[] => {
      return nodes.map(node => {
        // Si le nœud a exactement un enfant et n'est pas une feuille
        if (node.children.length === 1 && node.fieldInfo.type === 'dict') {
          const child = node.children[0]
          // Si l'enfant est aussi un nœud intermédiaire, continuer récursivement
          if (child.children.length > 0) {
            const flattenedChild = flattenSingleChildNodes([child])[0]
            // Fusionner le nœud avec son enfant unique
            // Préserver le path et fieldInfo de l'enfant final (la feuille)
            // Éviter la duplication si les labels sont identiques
            const childLabel = flattenedChild.label.includes(' > ') 
              ? flattenedChild.label.split(' > ').slice(-1)[0] // Prendre uniquement le dernier segment
              : flattenedChild.label
            const mergedLabel = node.label === childLabel 
              ? node.label 
              : `${node.label} > ${childLabel}`
            return {
              ...flattenedChild,
              path: flattenedChild.path, // Garder le path original de la feuille
              label: mergedLabel,
              parent: node.parent,
            }
          } else {
            // L'enfant est une feuille, fusionner directement
            // Préserver le path et fieldInfo de l'enfant (la feuille)
            // Éviter la duplication si les labels sont identiques
            // Le label du backend peut contenir "Parent > Child", on prend juste "Child"
            const childLabel = child.label.includes(' > ') 
              ? child.label.split(' > ').slice(-1)[0] // Prendre uniquement le dernier segment
              : child.label
            const mergedLabel = node.label === childLabel 
              ? node.label 
              : `${node.label} > ${childLabel}`
            return {
              ...child,
              path: child.path, // Garder le path original de la feuille
              label: mergedLabel,
              parent: node.parent,
            }
          }
        } else if (node.children.length > 0) {
          // Le nœud a plusieurs enfants, aplatir récursivement ses enfants
          return {
            ...node,
            children: flattenSingleChildNodes(node.children),
          }
        }
        return node
      })
    }

    return flattenSingleChildNodes(root)
  }, [availableFields, elementType, showOnlyEssential])

  // Filtrer l'arbre selon la recherche
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) {
      return fieldTree
    }

    const query = searchQuery.toLowerCase()
    const filterNode = (node: FieldNode): FieldNode | null => {
      const matches = node.label.toLowerCase().includes(query) || 
                     node.path.toLowerCase().includes(query)
      
      const filteredChildren = node.children
        .map(filterNode)
        .filter((n): n is FieldNode => n !== null)
      
      if (matches || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren,
        }
      }
      
      return null
    }

    return fieldTree.map(filterNode).filter((n): n is FieldNode => n !== null)
  }, [fieldTree, searchQuery])

  const selectedFields = useMemo(() => fieldConfigs[elementType] ?? [], [elementType, fieldConfigs])
  const suggestedFields = useMemo(() => suggestions[elementType] ?? [], [elementType, suggestions])

  const handleToggleField = useCallback((fieldPath: string) => {
    // La logique de désélection des champs essentiels est gérée dans toggleField du store
    toggleField(elementType, fieldPath)
    const newSelection = selectedFields.includes(fieldPath)
      ? selectedFields.filter(f => f !== fieldPath)
      : [...selectedFields, fieldPath]
    onFieldsChange?.(newSelection)
  }, [elementType, selectedFields, toggleField, onFieldsChange])

  const toggleExpanded = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  const getFieldIndicator = (fieldInfo: FieldInfo) => {
    const isSuggested = fieldInfo.suggested || suggestedFields.includes(fieldInfo.path)
    const importance = fieldInfo.importance || 
      (fieldInfo.frequency >= 0.8 ? 'essential' : 
       fieldInfo.frequency >= 0.2 ? 'common' : 'rare')
    const isEssential = isEnabledFlag(fieldInfo.is_essential)
    const isInvalid = fieldInfo.is_valid === false
    const isInConfig = fieldInfo.is_in_config === true
    
    // Afficher un avertissement si le champ est invalide
    if (isInvalid) {
      return { icon: '⚠️', color: theme.state.error.color, title: 'Champ invalide (n\'existe pas dans les données GDD)' }
    }
    
    if (isSuggested) {
      return { icon: '✓', color: theme.state.success.color, title: 'Champ suggéré' }
    }

    // ⭐ doit représenter les champs essentiels (is_essential), pas la fréquence.
    if (isEssential) {
      return { icon: '⭐', color: theme.state.info.color, title: 'Champ essentiel' }
    }
    
    // Indicateur pour les champs dans la config mais non essentiels
    if (isInConfig) {
      return { icon: '📋', color: theme.text.secondary, title: 'Champ dans la configuration' }
    }
    
    switch (importance) {
      case 'essential':
      case 'common':
        return { icon: 'ⓘ', color: theme.text.secondary, title: 'Champ commun' }
      case 'rare':
        return { icon: '○', color: theme.text.tertiary, title: 'Champ rare' }
      default:
        return null
    }
  }

  const renderFieldNode = (node: FieldNode, depth: number = 0): JSX.Element => {
    const isExpanded = expandedPaths.has(node.path)
    const hasChildren = node.children.length > 0
    // Pour l'onglet Contexte uniquement, on garde le comportement "essentiels toujours cochés"
    // (dans l'onglet Métadonnées, un champ essentiel doit rester désélectionnable).
    const isContextTab = showOnlyEssential === false
    const isEssential = isEnabledFlag(node.fieldInfo.is_essential)
    const isLocked = isContextTab && isEssential
    const isSelected = (isLocked) || selectedFields.includes(node.path)
    // Un champ est une feuille s'il n'a pas d'enfants dans l'arbre affiché
    // (même si son type est 'dict', il peut être une feuille après aplatissement)
    const isLeaf = !hasChildren
    const indicator = getFieldIndicator(node.fieldInfo)

    return (
      <div key={node.path}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0.5rem',
            paddingLeft: `${depth * 1.5 + 0.5}rem`,
            cursor: isLeaf ? 'pointer' : 'default',
            backgroundColor: isSelected ? theme.state.selected.background : 'transparent',
            borderRadius: '4px',
            marginBottom: '0.25rem',
          }}
          onClick={() => {
            if (hasChildren) {
              toggleExpanded(node.path)
            } else if (isLeaf) {
              handleToggleField(node.path)
            }
          }}
          onMouseEnter={(e) => {
            if (!isSelected) {
              e.currentTarget.style.backgroundColor = theme.state.hover.background
            }
          }}
          onMouseLeave={(e) => {
            if (!isSelected) {
              e.currentTarget.style.backgroundColor = 'transparent'
            }
          }}
          title={node.fieldInfo.category ? `Catégorie: ${node.fieldInfo.category}` : undefined}
        >
          {hasChildren && (
            <span
              style={{
                marginRight: '0.5rem',
                color: theme.text.secondary,
                userSelect: 'none',
              }}
            >
              {isExpanded ? '▼' : '▶'}
            </span>
          )}
          
          {isLeaf && (
            <input
              type="checkbox"
              checked={isSelected}
              disabled={isLocked}
              onChange={(e) => {
                e.stopPropagation()
                if (!isLocked) {
                  handleToggleField(node.path)
                }
              }}
              onClick={(e) => e.stopPropagation()}
              style={{
                marginRight: '0.5rem',
                cursor: isLocked ? 'not-allowed' : 'pointer',
                opacity: isLocked ? 0.6 : 1,
              }}
              title={isLocked ? 'Champ essentiel (toujours sélectionné)' : undefined}
            />
          )}
          
          {indicator && (
            <span
              style={{
                marginRight: '0.5rem',
                color: indicator.color,
                fontSize: '0.9rem',
              }}
              title={indicator.title}
            >
              {indicator.icon}
            </span>
          )}
          
          <span
            style={{
              flex: 1,
              color: theme.text.primary,
              fontWeight: isSelected ? 'bold' : 'normal',
            }}
          >
            {node.label}
          </span>
          
          {isLeaf && (
            <span
              style={{
                fontSize: '0.75rem',
                color: theme.text.tertiary,
                marginLeft: '0.5rem',
              }}
            >
              ({node.fieldInfo.type})
            </span>
          )}
        </div>
        
        {hasChildren && isExpanded && (
          <div>
            {node.children.map(child => renderFieldNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          padding: '1rem',
          color: theme.state.error.color,
          backgroundColor: theme.state.error.background,
          borderRadius: '4px',
        }}
      >
        Erreur: {error}
        <button
          onClick={() => detectFields(elementType)}
          style={{
            marginTop: '0.5rem',
            padding: '0.5rem 1rem',
            border: `1px solid ${theme.border.primary}`,
            borderRadius: '4px',
            backgroundColor: theme.button.default.background,
            color: theme.button.default.color,
            cursor: 'pointer',
          }}
        >
          Réessayer
        </button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', color: theme.text.secondary }}>
        Détection des champs en cours...
      </div>
    )
  }

  // Compter les champs visibles (filtrés) et sélectionnés
  // showOnlyEssential=true : afficher les métadonnées (is_metadata=true)
  // showOnlyEssential=false : afficher le contexte narratif (is_metadata=false)
  // Exclure les champs uniques du comptage normal
  const fields = availableFields[elementType] || {}
  const visibleFields = showOnlyEssential
    ? Object.keys(fields).filter(path => 
        isEnabledFlag(fields[path]?.is_metadata) && !fields[path]?.is_unique
      )
    : Object.keys(fields).filter(path => 
        !isEnabledFlag(fields[path]?.is_metadata) && !fields[path]?.is_unique
      )
  
  const totalFields = visibleFields.length
  
  // Récupérer les champs uniques regroupés par fiche
  const uniqueFields = (uniqueFieldsByItem && uniqueFieldsByItem[elementType]) || {}
  
  // Compter uniquement les champs sélectionnés parmi ceux visibles dans l'onglet actuel
  // Note: dans l'onglet Contexte, les champs essentiels restent toujours cochés.
  const visibleSelectedFields = visibleFields.filter(path => {
    const isEssential = isEnabledFlag(fields[path]?.is_essential)
    const isContextTab = showOnlyEssential === false
    if (isContextTab && isEssential) {
      return true  // Essentiels du contexte toujours cochés
    }
    return selectedFields.includes(path)
  })
  const visibleSelectedCount = visibleSelectedFields.length
  
  // Afficher le comptage pour l'onglet actuel uniquement
  const selectedCount = visibleSelectedCount
  const totalFieldsToDisplay = totalFields

  const visualIndicatorsTooltip = (
    <div>
      <div style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>Indicateurs Visuels</div>
      <ul style={{ margin: 0, paddingLeft: '1.25rem', listStyle: 'none' }}>
        <li style={{ marginBottom: '0.25rem' }}>
          <span style={{ color: theme.state.error.color }}>⚠️</span> Rouge : Champ invalide (n'existe pas dans les données GDD)
        </li>
        <li style={{ marginBottom: '0.25rem' }}>
          <span style={{ color: theme.state.success.color }}>✓</span> Vert : Champ suggéré/recommandé
        </li>
        <li style={{ marginBottom: '0.25rem' }}>
          <span style={{ color: theme.state.info.color }}>⭐</span> Bleu : Champ essentiel
        </li>
        <li style={{ marginBottom: '0.25rem' }}>
          <span style={{ color: theme.text.secondary }}>📋</span> Gris : Champ dans la configuration
        </li>
        <li style={{ marginBottom: '0.25rem' }}>
          <span style={{ color: theme.text.secondary }}>ⓘ</span> Gris : Champ commun
        </li>
        <li>
          <span style={{ color: theme.text.tertiary }}>○</span> Gris clair : Champ rare
        </li>
      </ul>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
          <input
            type="text"
            placeholder="Rechercher un champ..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              padding: '0.5rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '4px',
              backgroundColor: theme.input.background,
              color: theme.input.color,
            }}
          />
          <InfoIcon content={visualIndicatorsTooltip} position="bottom" />
        </div>
        <div
          style={{
            fontSize: '0.85rem',
            color: theme.text.secondary,
          }}
        >
          {selectedCount} / {totalFieldsToDisplay} champs sélectionnés
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0.5rem',
          border: `1px solid ${theme.border.primary}`,
          borderRadius: '4px',
          backgroundColor: theme.background.panel,
        }}
      >
        {filteredTree.length === 0 ? (
          <div style={{ padding: '1rem', textAlign: 'center', color: theme.text.secondary }}>
            {totalFields === 0
              ? 'Aucun champ détecté. Cliquez sur "Détecter automatiquement".'
              : 'Aucun champ ne correspond à la recherche.'}
          </div>
        ) : (
          filteredTree.map(node => renderFieldNode(node))
        )}
        
        {/* Section pour les champs uniques */}
        {Object.keys(uniqueFields).length > 0 && (
          <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: `1px solid ${theme.border.primary}` }}>
            <div style={{ 
              marginBottom: '1rem', 
              fontSize: '0.9rem', 
              fontWeight: 'bold',
              color: theme.text.primary 
            }}>
              Champs uniques (par fiche)
            </div>
            <div style={{ fontSize: '0.85rem', color: theme.text.secondary, marginBottom: '1rem' }}>
              Ces champs n'apparaissent que dans une seule fiche. Vous pouvez les mapper sur un champ générique.
            </div>
            {Object.entries(uniqueFields).map(([itemName, itemFields]) => (
              <div key={itemName} style={{ marginBottom: '1.5rem' }}>
                <div style={{ 
                  fontWeight: 'bold', 
                  marginBottom: '0.5rem',
                  color: theme.text.primary,
                  fontSize: '0.9rem'
                }}>
                  {itemName}
                </div>
                <div style={{ marginLeft: '1rem' }}>
                  {Object.entries(itemFields).map(([path, label]) => {
                    const isSelected = selectedFields.includes(path)
                    return (
                      <div
                        key={path}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0.25rem 0',
                          cursor: 'pointer',
                          color: isSelected ? theme.text.primary : theme.text.secondary,
                        }}
                        onClick={() => handleToggleField(path)}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleField(path)}
                          style={{ marginRight: '0.5rem' }}
                        />
                        <span style={{ fontSize: '0.85rem' }}>{label}</span>
                        <span style={{ 
                          marginLeft: '0.5rem', 
                          fontSize: '0.75rem', 
                          color: theme.text.tertiary 
                        }}>
                          ({path})
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

