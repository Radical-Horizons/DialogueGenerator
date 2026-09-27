/**
 * Composant de barre de progression segmentée pour visualiser le budget de tokens.
 * Affiche la répartition du budget par catégorie avec des couleurs distinctes.
 */
import { useMemo } from 'react'
import { theme } from '../../theme'
import { redesignAccent } from '../../theme/redesignTokens'
import type { PromptStructure } from '../../types/prompt'

export interface TokenBudgetBarProps {
  /** Structure du prompt (optionnelle) */
  structuredPrompt?: PromptStructure | null
  /** Nombre total de tokens (fallback si structuredPrompt non disponible) */
  tokenCount?: number | null
  /** Indique si l'estimation est en cours */
  isEstimating?: boolean
  /** Limite maximale de tokens (pour calculer le pourcentage) */
  maxTokens?: number | null
  /** Hauteur de la barre en pixels */
  height?: number
}

interface TokenSegment {
  label: string
  tokens: number
  color: string
  percentage: number
}

const SEGMENT_COLORS = {
  system: redesignAccent.base, // jauge de budget : seul segment sur le bleu d'accent
  characters: '#50C878',  // Vert
  locations: '#FFD700',   // Jaune
  instructions: '#9B59B6', // Violet
  other: '#95A5A6',       // Gris
}

/**
 * Extrait les segments de tokens depuis la structure du prompt.
 */
function extractTokenSegments(
  structuredPrompt: PromptStructure | null | undefined,
  totalTokens: number | null
): TokenSegment[] {
  if (!structuredPrompt || !structuredPrompt.sections || totalTokens === null || totalTokens === 0) {
    return []
  }

  const segments: Record<string, number> = {
    system: 0,
    characters: 0,
    locations: 0,
    instructions: 0,
    other: 0,
  }

  // Parcourir les sections
  for (const section of structuredPrompt.sections) {
    if (section.type === 'system_prompt') {
      segments.system += section.tokenCount || 0
    } else if (section.type === 'instruction') {
      segments.instructions += section.tokenCount || 0
    } else if (section.type === 'context' && section.categories) {
      // Pour les sections context, utiliser les tokenCount des catégories
      // (le tokenCount de la section parente devrait être la somme des catégories)
      for (const category of section.categories) {
        const categoryTokens = category.tokenCount || 0
        
        if (category.type === 'characters') {
          segments.characters += categoryTokens
        } else if (category.type === 'locations') {
          segments.locations += categoryTokens
        } else {
          // Autres catégories (items, species, communities, quests, etc.)
          segments.other += categoryTokens
        }
      }
    } else {
      // Autres types de sections
      segments.other += section.tokenCount || 0
    }
  }

  // Convertir en tableau de segments, filtrer les segments vides
  const segmentArray: TokenSegment[] = []
  
  if (segments.system > 0) {
    segmentArray.push({
      label: 'Système',
      tokens: segments.system,
      color: SEGMENT_COLORS.system,
      percentage: (segments.system / totalTokens) * 100,
    })
  }
  
  if (segments.characters > 0) {
    segmentArray.push({
      label: 'Personnages',
      tokens: segments.characters,
      color: SEGMENT_COLORS.characters,
      percentage: (segments.characters / totalTokens) * 100,
    })
  }
  
  if (segments.locations > 0) {
    segmentArray.push({
      label: 'Lieux',
      tokens: segments.locations,
      color: SEGMENT_COLORS.locations,
      percentage: (segments.locations / totalTokens) * 100,
    })
  }
  
  if (segments.instructions > 0) {
    segmentArray.push({
      label: 'Instructions',
      tokens: segments.instructions,
      color: SEGMENT_COLORS.instructions,
      percentage: (segments.instructions / totalTokens) * 100,
    })
  }
  
  if (segments.other > 0) {
    segmentArray.push({
      label: 'Libre',
      tokens: segments.other,
      color: SEGMENT_COLORS.other,
      percentage: (segments.other / totalTokens) * 100,
    })
  }

  return segmentArray
}

export function TokenBudgetBar({
  structuredPrompt,
  tokenCount,
  isEstimating = false,
  maxTokens = null,
  height = 16,
}: TokenBudgetBarProps) {
  const segments = useMemo(() => {
    if (isEstimating || tokenCount === null || tokenCount === undefined) {
      return []
    }
    return extractTokenSegments(structuredPrompt, tokenCount)
  }, [structuredPrompt, tokenCount, isEstimating])

  const totalDisplayTokens = tokenCount ?? 0
  const percentageOfMax = maxTokens && maxTokens > 0 
    ? (totalDisplayTokens / maxTokens) * 100 
    : null

  // Si pas de segments mais qu'on a un total, afficher une barre unie (fallback)
  const hasSegments = segments.length > 0
  const displayTotal = hasSegments ? segments.reduce((sum, seg) => sum + seg.tokens, 0) : totalDisplayTokens

  if (isEstimating) {
    return (
      <div style={{ 
        padding: '0.5rem',
        backgroundColor: theme.background.secondary,
        borderRadius: '4px',
        color: theme.text.secondary,
        fontSize: '0.85rem',
      }}>
        Estimation en cours...
      </div>
    )
  }

  if (tokenCount === null || tokenCount === undefined) {
    return null
  }

  return (
    <div style={{ 
      padding: '0.75rem',
      backgroundColor: theme.background.secondary,
      borderRadius: '4px',
      border: `1px solid ${theme.border.primary}`,
    }}>
      {/* Barre de progression segmentée */}
      <div style={{ 
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}>
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
        }}>
          <div style={{
            height: `${height}px`,
            backgroundColor: theme.input.background,
            borderRadius: '4px',
            overflow: 'hidden',
            display: 'flex',
            position: 'relative',
            border: `1px solid ${theme.border.primary}`,
          }}>
            {hasSegments ? (
              segments.map((segment, index) => (
                <div
                  key={segment.label}
                  style={{
                    width: `${segment.percentage}%`,
                    backgroundColor: segment.color,
                    height: '100%',
                    borderRight: index < segments.length - 1 ? `1px solid ${theme.border.primary}` : 'none',
                    transition: 'width 0.3s ease',
                    cursor: 'pointer',
                    position: 'relative',
                  }}
                  title={`${segment.label}: ${segment.tokens.toLocaleString()} tokens (${segment.percentage.toFixed(1)}%)`}
                />
              ))
            ) : (
              <div
                style={{
                  width: percentageOfMax ? `${Math.min(percentageOfMax, 100)}%` : '100%',
                  backgroundColor: theme.state.info.background,
                  height: '100%',
                  transition: 'width 0.3s ease',
                }}
              />
            )}
          </div>
          
          {/* Étiquettes sous la barre */}
          {hasSegments && (
            <div style={{
              display: 'flex',
              position: 'relative',
              height: '1.2rem',
            }}>
              {segments.map((segment) => (
                <div
                  key={segment.label}
                  style={{
                    width: `${segment.percentage}%`,
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    fontSize: '0.7rem',
                    color: theme.text.secondary,
                    paddingTop: '0.1rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={`${segment.label}: ${segment.tokens.toLocaleString()} tokens (${segment.percentage.toFixed(1)}%)`}
                >
                  {segment.percentage >= 5 ? segment.label : ''}
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Compteur total */}
        <div style={{
          minWidth: '80px',
          textAlign: 'right',
          fontWeight: 'bold',
          color: theme.text.primary,
          fontSize: '0.9rem',
        }}>
          {displayTotal.toLocaleString()}
          {maxTokens && (
            <span style={{ 
              fontSize: '0.75rem',
              color: theme.text.secondary,
              fontWeight: 'normal',
              marginLeft: '0.25rem',
            }}>
              / {maxTokens.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Indicateur de limite si maxTokens est défini */}
      {maxTokens && percentageOfMax !== null && (
        <div style={{
          marginTop: '0.5rem',
          fontSize: '0.7rem',
          color: percentageOfMax > 100 
            ? theme.state.error?.color || '#ff6b6b'
            : percentageOfMax > 90
            ? theme.state.warning?.color || '#f39c12'
            : theme.text.tertiary,
          textAlign: 'right',
        }}>
          {percentageOfMax > 100 
            ? `Dépassement : ${(percentageOfMax - 100).toFixed(1)}%`
            : `${percentageOfMax.toFixed(1)}% du budget utilisé`
          }
        </div>
      )}
    </div>
  )
}
