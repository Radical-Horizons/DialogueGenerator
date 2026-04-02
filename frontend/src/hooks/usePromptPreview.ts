/**
 * Hook personnalisé pour formater et afficher le prompt.
 */
import { useMemo } from 'react'
import { hasJsonContent } from '../utils/jsonPrettifier'
import type { PromptStructure, ItemSection, ContextCategory } from '../types/prompt'

export interface PromptSection {
  title: string
  content: string
  hasJson: boolean
  tokenCount?: number
  children?: PromptSection[]  // Sous-sections imbriquées
}

/**
 * Sections de niveau 2 (catégories) : CHARACTERS, LOCATIONS, ITEMS, SPECIES, COMMUNITIES, etc.
 * Ces sections marquent le début d'un nouvel élément dans la catégorie
 */
const LEVEL_2_CATEGORIES = [
  'CHARACTERS', 'PERSONNAGES',
  'LOCATIONS', 'LIEUX',
  'ITEMS', 'OBJETS',
  'SPECIES', 'ESPÈCES', 'ESPECES',
  'COMMUNITIES', 'COMMUNAUTÉS', 'COMMUNAUTES',
  'QUESTS', 'QUÊTES', 'QUETES',
]

/**
 * Mapping des catégories vers leurs noms d'éléments individuels
 * Utilise des noms français pour une meilleure lisibilité
 */
const CATEGORY_TO_ITEM_NAME: Record<string, string> = {
  'CHARACTERS': 'PNJ',
  'PERSONNAGES': 'PNJ',
  'LOCATIONS': 'LIEU',
  'LIEUX': 'LIEU',
  'ITEMS': 'OBJET',
  'OBJETS': 'OBJET',
  'SPECIES': 'ESPÈCE',
  'ESPÈCES': 'ESPÈCE',
  'ESPECES': 'ESPÈCE',
  'COMMUNITIES': 'COMMUNAUTÉ',
  'COMMUNAUTÉS': 'COMMUNAUTÉ',
  'COMMUNAUTES': 'COMMUNAUTÉ',
  'QUESTS': 'QUÊTE',
  'QUÊTES': 'QUÊTE',
  'QUETES': 'QUÊTE',
}

/**
 * Estimation rapide des tokens pour le parsing (évite les appels répétés à estimateTokens).
 * ~4 caractères par token, utilisé uniquement dans parsePromptSections / parseSubSections.
 */
function estimateTokensFast(text: string): number {
  if (!text || text.length === 0) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

/**
 * Vérifie si une section est une catégorie de niveau 2
 */
function isLevel2Category(title: string): boolean {
  const upperTitle = title.toUpperCase()
  return LEVEL_2_CATEGORIES.some(cat => upperTitle === cat.toUpperCase())
}

/**
 * Obtient le nom d'élément individuel pour une catégorie
 */
function getItemNameForCategory(categoryTitle: string): string {
  const upperTitle = categoryTitle.toUpperCase()
  for (const [cat, itemName] of Object.entries(CATEGORY_TO_ITEM_NAME)) {
    if (upperTitle === cat.toUpperCase()) {
      return itemName
    }
  }
  return categoryTitle // Fallback
}

/**
 * Parse récursivement les sous-sections dans un contenu (sections de niveau 2+).
 * Détecte les sections au format --- TITRE --- et crée une hiérarchie :
 * - Niveau 2 : Catégories (CHARACTERS, LOCATIONS, etc.)
 * - Niveau 3 : Sections d'éléments (IDENTITÉ, CARACTÉRISATION, etc.) regroupées sous les catégories
 */
function parseSubSections(content: string): { children: PromptSection[], remainingContent: string } {
  const children: PromptSection[] = []
  const subSectionRegex = /^--- (.+?) ---$/gm
  
  // Trouver toutes les positions des sous-sections
  const subSectionMatches: Array<{ index: number; title: string; isLevel2: boolean }> = []
  let match
  while ((match = subSectionRegex.exec(content)) !== null) {
    const title = match[1].trim()
    if (title) {
      subSectionMatches.push({
        index: match.index,
        title,
        isLevel2: isLevel2Category(title),
      })
    }
  }
  
  if (subSectionMatches.length === 0) {
    // Pas de sous-sections détectées
    // Vérifier s'il y a du contenu avant la première section potentielle
    // Si le contenu commence par du texte en gras (comme **CONTEXTE GÉNÉRAL DE LA SCÈNE**),
    // on le garde dans remainingContent
    return { children: [], remainingContent: content }
  }
  
  // Grouper les éléments individuels par catégorie
  // Structure réelle : un seul marqueur "CHARACTERS" puis tous les personnages avec leurs sections
  let i = 0
  while (i < subSectionMatches.length) {
    const currentSection = subSectionMatches[i]
    
    if (currentSection.isLevel2) {
      // Section de niveau 2 (marqueur de catégorie) : trouver toutes les sections de niveau 3 qui suivent
      const categoryTitle = currentSection.title
      const itemName = getItemNameForCategory(categoryTitle)
      
      // Trouver où se termine cette catégorie (prochaine catégorie ou fin du contenu)
      let categoryEnd = content.length
      let j = i + 1
      while (j < subSectionMatches.length) {
        if (subSectionMatches[j].isLevel2) {
          categoryEnd = subSectionMatches[j].index
          break
        }
        j++
      }
      
      // Extraire le contenu de la catégorie
      const categoryStart = currentSection.index
      const categoryHeaderMatch = content.substring(categoryStart).match(/^--- (.+?) ---\s*\n?/m)
      if (!categoryHeaderMatch) {
        i++
        continue
      }
      
      const categoryContentStart = categoryStart + categoryHeaderMatch[0].length
      const categoryContent = content.substring(categoryContentStart, categoryEnd).trim()

      // -------------------------------------------------------------------
      // Format "marqueurs explicites" : --- PNJ 1 --- / --- LIEU 2 --- / etc.
      // Dans ce format, on garde une hiérarchie explicite : CATEGORY -> ITEMS
      // -------------------------------------------------------------------
      const elementMarkerPattern = new RegExp(
        `^--- (${itemName}|PNJ|LIEU|OBJET|ESPÈCE|ESPECE|COMMUNAUTÉ|COMMUNAUTE|QUÊTE|QUETE) (\\d+) ---$`,
        'gm'
      )

      const elementMarkers: Array<{ index: number; label: string; number: number; markerLength: number }> = []
      let markerMatch: RegExpExecArray | null
      while ((markerMatch = elementMarkerPattern.exec(categoryContent)) !== null) {
        elementMarkers.push({
          index: markerMatch.index,
          label: markerMatch[1],
          number: parseInt(markerMatch[2], 10),
          markerLength: markerMatch[0].length,
        })
      }

      if (elementMarkers.length > 0) {
        const categoryChildren: PromptSection[] = []

        for (let idx = 0; idx < elementMarkers.length; idx++) {
          const marker = elementMarkers[idx]
          const start = marker.index + marker.markerLength
          const end = idx < elementMarkers.length - 1 ? elementMarkers[idx + 1].index : categoryContent.length
          const itemContent = categoryContent.substring(start, end).trim()
          if (itemContent.length === 0) continue

          categoryChildren.push({
            title: `${marker.label} ${marker.number}`,
            content: itemContent,
            hasJson: hasJsonContent(itemContent),
            tokenCount: estimateTokensFast(itemContent),
          })
        }

        const categoryTokenCount = categoryChildren.reduce((sum, c) => sum + (c.tokenCount || 0), 0)
        children.push({
          title: categoryTitle,
          content: '',
          hasJson: false,
          tokenCount: categoryTokenCount,
          children: categoryChildren,
        })

        // Passer à la prochaine catégorie
        i = j
        continue
      }
      
      // Extraire toutes les sections de niveau 3 dans cette catégorie
      const level3Matches: Array<{ index: number; title: string }> = []
      let level3Match
      const level3Regex = /^--- (.+?) ---$/gm
      while ((level3Match = level3Regex.exec(categoryContent)) !== null) {
        const level3Title = level3Match[1].trim()
        if (level3Title && !isLevel2Category(level3Title)) {
          level3Matches.push({
            index: level3Match.index,
            title: level3Title,
          })
        }
      }
      
      if (level3Matches.length === 0) {
        // Pas de sections de niveau 3 : fallback rétrocompatible (détection via "Nom:" / "Nom (extrait):")
        const categoryChildren: PromptSection[] = []
        
        const elementStartPattern = /^Nom(?:\s*\(extrait\))?:/gm
        const elementStarts: number[] = []
        let fallbackMatch
        while ((fallbackMatch = elementStartPattern.exec(categoryContent)) !== null) {
          elementStarts.push(fallbackMatch.index)
        }

        if (elementStarts.length > 0) {
          // Plusieurs éléments détectés par pattern "Nom:"
          for (let idx = 0; idx < elementStarts.length; idx++) {
            const start = elementStarts[idx]
            const end = idx < elementStarts.length - 1 ? elementStarts[idx + 1] : categoryContent.length
            const itemContent = categoryContent.substring(start, end).trim()

            if (itemContent.length > 0) {
              categoryChildren.push({
                title: `${itemName} ${idx + 1}`,
                content: itemContent,
                hasJson: hasJsonContent(itemContent),
                tokenCount: estimateTokensFast(itemContent),
              })
            }
          }
        } else if (categoryContent.trim().length > 0) {
          // Aucun pattern trouvé, traiter comme un seul élément
          categoryChildren.push({
            title: `${itemName} 1`,
            content: categoryContent,
            hasJson: hasJsonContent(categoryContent),
            tokenCount: estimateTokensFast(categoryContent),
          })
        }

        const categoryTokenCount = categoryChildren.reduce((sum, c) => sum + (c.tokenCount || 0), 0)
        children.push({
          title: categoryTitle,
          content: '',
          hasJson: false,
          tokenCount: categoryTokenCount,
          children: categoryChildren,
        })
        
        // Passer à la prochaine catégorie
        i = j
        continue
      }
      
      // Grouper les sections de niveau 3 par élément individuel
      // Un nouvel élément commence quand on voit une section IDENTITÉ après avoir vu d'autres sections
      // ou quand on voit une section IDENTITÉ et qu'on a déjà un élément en cours avec des sections non-IDENTITÉ
      const items: Array<{ sections: PromptSection[] }> = []
      let currentItemSections: PromptSection[] = []
      
      for (let k = 0; k < level3Matches.length; k++) {
        const level3Match = level3Matches[k]
        const isIdentity = level3Match.title.toUpperCase() === 'IDENTITÉ' || level3Match.title.toUpperCase() === 'IDENTITE'
        
        // Si on voit IDENTITÉ et qu'on a déjà un élément en cours avec des sections, c'est un nouvel élément
        if (isIdentity && currentItemSections.length > 0) {
          // Vérifier si l'élément en cours contient des sections autres que IDENTITÉ
          const hasNonIdentitySections = currentItemSections.some(sec => {
            const secTitle = sec.title.toUpperCase()
            return secTitle !== 'IDENTITÉ' && secTitle !== 'IDENTITE'
          })
          
          if (hasNonIdentitySections) {
            // Finaliser l'élément précédent
            items.push({
              sections: [...currentItemSections],
            })
            
            // Commencer un nouvel élément
            currentItemSections = []
          }
        }
        
        // Extraire le contenu de cette section
        const level3Start = level3Match.index
        const level3End = k < level3Matches.length - 1 
          ? level3Matches[k + 1].index 
          : categoryContent.length
        
        const level3HeaderMatch = categoryContent.substring(level3Start).match(/^--- (.+?) ---\s*\n?/m)
        if (level3HeaderMatch) {
          const level3ContentStart = level3Start + level3HeaderMatch[0].length
          const level3Content = categoryContent.substring(level3ContentStart, level3End).trim()
          
          if (level3Content) {
            const level3TokenCount = estimateTokensFast(level3Content)
            currentItemSections.push({
              title: level3Match.title,
              content: level3Content,
              hasJson: hasJsonContent(level3Content),
              tokenCount: level3TokenCount,
            })
          }
        }
      }
      
      // Ajouter le dernier élément
      if (currentItemSections.length > 0) {
        items.push({
          sections: currentItemSections,
        })
      }
      
      // Toujours créer des wrappers avec balises distinctives (PNJ1, PNJ2, etc.)
      // même pour un seul élément, pour une meilleure séparation visuelle
      items.forEach((item, idx) => {
        const itemTokenCount = item.sections.reduce((sum, sec) => sum + (sec.tokenCount || 0), 0)
        children.push({
          title: `${itemName} ${idx + 1}`,
          content: '',
          hasJson: false,
          tokenCount: itemTokenCount,
          children: item.sections.length > 0 ? item.sections : undefined,
        })
      })
      
      // Passer à la prochaine catégorie
      i = j
    } else {
      // Section de niveau 3 (ou autre) : traiter normalement (récursif pour les niveaux plus profonds)
      const sectionStart = currentSection.index
      const sectionEnd = i < subSectionMatches.length - 1 
        ? subSectionMatches[i + 1].index 
        : content.length
      
      // Extraire le contenu de la sous-section (après le marqueur)
      const sectionHeaderMatch = content.substring(sectionStart).match(/^--- (.+?) ---\s*\n?/m)
      if (sectionHeaderMatch) {
        const contentStart = sectionStart + sectionHeaderMatch[0].length
        const subContent = content.substring(contentStart, sectionEnd).trim()
        
        if (subContent) {
          // Parser récursivement les sous-sections de niveau inférieur (niveau 4+)
          const { children: grandChildren, remainingContent: finalContent } = parseSubSections(subContent)
          
          // Calculer le token count récursivement
          const childrenTokenCount = grandChildren.reduce((sum, child) => sum + (child.tokenCount || 0), 0)
          const contentTokenCount = estimateTokensFast(finalContent)
          const totalTokenCount = childrenTokenCount + contentTokenCount
          
          children.push({
            title: currentSection.title,
            content: finalContent,
            hasJson: hasJsonContent(finalContent),
            tokenCount: totalTokenCount,
            children: grandChildren.length > 0 ? grandChildren : undefined,
          })
        }
      }
      
      i++
    }
  }
  
  // Construire le contenu restant (avant la première sous-section)
  // Si on a des sections détectées, le contenu avant la première section est le remainingContent
  // Sinon, tout le contenu est dans remainingContent
  const firstSubSectionIndex = subSectionMatches.length > 0 ? subSectionMatches[0].index : content.length
  const remainingContent = content.substring(0, firstSubSectionIndex).trim()
  
  return { children, remainingContent }
}

/**
 * Parse une structure JSON de prompt en sections pour l'affichage.
 * Convertit la structure backend (PromptStructure) en structure frontend (PromptSection[]).
 */
export function parsePromptFromJson(promptJson: PromptStructure | null | undefined): PromptSection[] {
  if (!promptJson || !promptJson.sections) {
    return []
  }
  
  const sections: PromptSection[] = []
  
  // Fonction helper pour créer les children d'une catégorie
  const createCategoryChildren = (category: ContextCategory): PromptSection[] => {
    const categoryChildren: PromptSection[] = []
    
    for (const item of category.items) {
      // Si l'item a une seule section avec titre vide ou "INFORMATIONS", afficher le contenu directement
      // Sinon, créer des sections pour chaque section de l'item
      const hasSingleInfoSection = item.sections.length === 1 && 
        (item.sections[0].title === '' || item.sections[0].title === 'INFORMATIONS')
      
      // PRIORITÉ: Utiliser raw_content si disponible, sinon content
      const getSectionContent = (itemSection: ItemSection): string => {
        if (itemSection.raw_content) {
          // Sérialiser raw_content en JSON string pour affichage
          try {
            return JSON.stringify(itemSection.raw_content, null, 2)
          } catch (e) {
            return String(itemSection.raw_content)
          }
        }
        return itemSection.content || ''
      }
      
      if (hasSingleInfoSection) {
        // Aplatir : afficher le contenu directement dans l'item
        const sectionContent = getSectionContent(item.sections[0])
        categoryChildren.push({
          title: item.name,
          content: sectionContent,
          hasJson: hasJsonContent(sectionContent),
          tokenCount: item.tokenCount
        })
      } else if (item.sections.length > 0) {
        // Plusieurs sections ou section avec titre : créer des children
        const itemChildren: PromptSection[] = item.sections
          .filter(itemSection => itemSection.title !== '') // Filtrer les sections sans titre
          .map(itemSection => {
            const sectionContent = getSectionContent(itemSection)
            return {
              title: itemSection.title,
              content: sectionContent,
              hasJson: hasJsonContent(sectionContent),
              tokenCount: itemSection.tokenCount
            }
          })
        
        // Si après filtrage on n'a qu'une section, aplatir aussi
        if (itemChildren.length === 1) {
          categoryChildren.push({
            title: item.name,
            content: itemChildren[0].content,
            hasJson: itemChildren[0].hasJson,
            tokenCount: item.tokenCount
          })
        } else if (itemChildren.length > 1) {
          categoryChildren.push({
            title: item.name,
            content: '', // Le contenu est dans les children
            hasJson: false,
            tokenCount: item.tokenCount,
            children: itemChildren
          })
        } else {
          // Aucune section valide, créer quand même l'item avec contenu vide
          categoryChildren.push({
            title: item.name,
            content: '',
            hasJson: false,
            tokenCount: item.tokenCount
          })
        }
      } else {
        // Aucune section, créer l'item vide
        categoryChildren.push({
          title: item.name,
          content: '',
          hasJson: false,
          tokenCount: item.tokenCount
        })
      }
    }
    
    return categoryChildren
  }
  
  for (const backendSection of promptJson.sections) {
    // Vérifier si c'est une section de contexte qui doit être aplatie
    const isContextSection = backendSection.categories && backendSection.categories.length > 0 &&
      (backendSection.title.toUpperCase().includes('CONTEXTE GÉNÉRAL') ||
       backendSection.title.toUpperCase().includes('CONTEXTE GENERAL') ||
       backendSection.title.toUpperCase().includes('SECTION') && backendSection.title.toUpperCase().includes('CONTEXTE'))
    
    if (isContextSection) {
      // Aplatir : ajouter directement les catégories comme sections de premier niveau
      for (const category of backendSection.categories!) {
        const categoryChildren = createCategoryChildren(category)
        
        if (categoryChildren.length > 0) {
          sections.push({
            title: category.title,
            content: '', // Le contenu est dans les children
            hasJson: false,
            tokenCount: category.tokenCount,
            children: categoryChildren
          })
        }
      }
    } else {
      // Section normale : créer la section avec children
      const children: PromptSection[] = []
      
      if (backendSection.categories) {
        for (const category of backendSection.categories) {
          const categoryChildren = createCategoryChildren(category)
          
          if (categoryChildren.length > 0) {
            children.push({
              title: category.title,
              content: '', // Le contenu est dans les children
              hasJson: false,
              tokenCount: category.tokenCount,
              children: categoryChildren
            })
          }
        }
      }
      
      sections.push({
        title: backendSection.title,
        content: backendSection.content || '',
        hasJson: hasJsonContent(backendSection.content || ''),
        tokenCount: backendSection.tokenCount,
        children: children.length > 0 ? children : undefined
      })
    }
  }
  
  return sections
}

/**
 * Parse le prompt en sections délimitées par --- SECTION --- ou ### SECTION X.
 * Supporte l'imbrication multi-niveaux.
 * 
 * @deprecated Utiliser parsePromptFromJson() si structured_prompt est disponible.
 */
export function parsePromptSections(prompt: string): PromptSection[] {
  if (!prompt) return []
  
  const sections: PromptSection[] = []
  // D'abord, détecter UNIQUEMENT les sections principales (### SECTION X)
  // Les sous-sections (--- TITRE ---) seront parsées récursivement dans le contenu
  const mainSectionRegex = /^### (SECTION \d+[A-Z]?\. .+?)$/gm
  
  // Trouver toutes les positions des sections principales
  const sectionMatches: Array<{ index: number; title: string }> = []
  let match
  while ((match = mainSectionRegex.exec(prompt)) !== null) {
    const title = match[1].trim()
    if (title) {
      sectionMatches.push({
        index: match.index,
        title,
      })
    }
  }
  
  // Si aucune section principale n'est trouvée, essayer le format alternatif --- SECTION ---
  if (sectionMatches.length === 0) {
    const altSectionRegex = /^--- (.+?) ---$/gm
    while ((match = altSectionRegex.exec(prompt)) !== null) {
      const title = match[1].trim()
      if (title && title.startsWith('SECTION')) {
        sectionMatches.push({
          index: match.index,
          title,
        })
      }
    }
  }

  if (sectionMatches.length === 0) {
    // Pas de sections, tout le contenu est une seule section "System Prompt"
    const trimmedPrompt = prompt.trim()
    return [{
      title: 'System Prompt',
      content: trimmedPrompt,
      hasJson: hasJsonContent(trimmedPrompt),
      tokenCount: estimateTokensFast(trimmedPrompt),
    }]
  }
  
  // Extraire le contenu avant la première section (System Prompt)
  if (sectionMatches[0].index > 0) {
    const systemPromptContent = prompt.substring(0, sectionMatches[0].index).trim()
    if (systemPromptContent) {
      sections.push({
        title: 'System Prompt',
        content: systemPromptContent,
        hasJson: hasJsonContent(systemPromptContent),
        tokenCount: estimateTokensFast(systemPromptContent),
      })
    }
  }
  
  // Extraire chaque section avec parsing récursif des sous-sections
  for (let i = 0; i < sectionMatches.length; i++) {
    const sectionStart = sectionMatches[i].index
    const sectionEnd = i < sectionMatches.length - 1 
      ? sectionMatches[i + 1].index 
      : prompt.length
    
    // Extraire le contenu de la section (après le marqueur)
    // Support pour les deux formats : --- SECTION --- et ### SECTION X. TITRE (avec support pour 2A, 2B, 2C)
    // Le regex doit capturer le header complet incluant le saut de ligne
    const sectionHeaderMatch = prompt.substring(sectionStart).match(/^(?:--- (.+?) ---|### (SECTION \d+[A-Z]?\. .+?))(\s*\n+)/m)
    if (sectionHeaderMatch) {
      // sectionHeaderMatch[0] contient le header complet (titre + saut de ligne)
      const contentStart = sectionStart + sectionHeaderMatch[0].length
      const rawContent = prompt.substring(contentStart, sectionEnd).trim()

      if (rawContent) {
        // Parser récursivement les sous-sections
        const { children, remainingContent } = parseSubSections(rawContent)
        
        // Calculer le token count récursivement
        const childrenTokenCount = children.reduce((sum, child) => sum + (child.tokenCount || 0), 0)
        const contentTokenCount = estimateTokensFast(remainingContent)
        const totalTokenCount = childrenTokenCount + contentTokenCount
        
        // Si on a des enfants mais pas de remainingContent, c'est que tout le contenu a été parsé en sections
        // Si on a à la fois des enfants et du remainingContent, on garde les deux
        sections.push({
          title: sectionMatches[i].title,
          content: remainingContent,
          hasJson: hasJsonContent(remainingContent),
          tokenCount: totalTokenCount,
          children: children.length > 0 ? children : undefined,
        })
      }
    }
  }
  
  return sections
}

export function usePromptPreview(
  promptText: string | null | undefined,
  structuredPrompt: PromptStructure | null | undefined = null
) {
  const formattedPrompt = useMemo(() => {
    if (!promptText) return ''
    // Pour l'instant, on retourne le texte tel quel
    // On pourrait ajouter de la coloration syntaxique ou du formatage ici
    return promptText
  }, [promptText])
  
  const sections = useMemo(() => {
    // Priorité au JSON structuré si disponible
    if (structuredPrompt) {
      return parsePromptFromJson(structuredPrompt)
    }
    // Fallback sur parsing texte
    if (promptText) {
      return parsePromptSections(promptText)
    }
    return []
  }, [promptText, structuredPrompt])

  return {
    formattedPrompt,
    sections,
    isEmpty: !promptText || promptText.trim().length === 0,
  }
}



