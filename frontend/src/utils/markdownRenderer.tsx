/**
 * Utilitaire pour rendre le markdown en React.
 */
import React from 'react'
import { theme } from '../theme'

/**
 * Rendu simple du markdown en React.
 * Supporte les titres, le gras, l'italique, les listes et les blocs de code.
 */
export function renderMarkdown(text: string): React.ReactNode {
  if (!text) return null
  
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let currentList: string[] = []
  let listType: 'ul' | 'ol' | null = null
  
  const flushList = () => {
    if (currentList.length > 0 && listType) {
      const ListComponent = listType === 'ul' ? 'ul' : 'ol'
      elements.push(
        React.createElement(
          ListComponent,
          { key: `list-${elements.length}`, style: { margin: '0.5rem 0', paddingLeft: '1.5rem' } },
          currentList.map((item, idx) =>
            React.createElement('li', { key: idx }, renderInlineMarkdown(item))
          )
        )
      )
      currentList = []
      listType = null
    }
  }
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    
    // Titres
    if (line.startsWith('### ')) {
      flushList()
      elements.push(
        React.createElement('h3', { key: i, style: { margin: '1rem 0 0.5rem 0', fontSize: '1rem', fontWeight: 'bold' } }, 
          renderInlineMarkdown(line.substring(4))
        )
      )
      continue
    }
    if (line.startsWith('## ')) {
      flushList()
      elements.push(
        React.createElement('h2', { key: i, style: { margin: '1.25rem 0 0.75rem 0', fontSize: '1.1rem', fontWeight: 'bold' } }, 
          renderInlineMarkdown(line.substring(3))
        )
      )
      continue
    }
    if (line.startsWith('# ')) {
      flushList()
      elements.push(
        React.createElement('h1', { key: i, style: { margin: '1.5rem 0 1rem 0', fontSize: '1.25rem', fontWeight: 'bold' } }, 
          renderInlineMarkdown(line.substring(2))
        )
      )
      continue
    }
    
    // Listes
    if (line.match(/^[-*]\s/)) {
      if (listType !== 'ul') {
        flushList()
        listType = 'ul'
      }
      currentList.push(line.substring(2))
      continue
    }
    if (line.match(/^\d+\.\s/)) {
      if (listType !== 'ol') {
        flushList()
        listType = 'ol'
      }
      currentList.push(line.replace(/^\d+\.\s/, ''))
      continue
    }
    
    // Bloc de code
    if (line.startsWith('```')) {
      flushList()
      const codeLines: string[] = []
      i++ // Passer la ligne de début
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      elements.push(
        React.createElement(
          'pre',
          {
            key: i,
            style: {
              backgroundColor: theme.background.elevated,
              padding: '0.75rem',
              borderRadius: '4px',
              overflow: 'auto',
              margin: '0.5rem 0',
              fontSize: '0.85rem',
              fontFamily: 'monospace',
            },
          },
          React.createElement('code', null, codeLines.join('\n'))
        )
      )
      continue
    }
    
    // Ligne vide
    if (line === '') {
      flushList()
      elements.push(React.createElement('br', { key: i }))
      continue
    }
    
    // Paragraphe normal
    flushList()
    elements.push(
      React.createElement('p', { key: i, style: { margin: '0.4rem 0', lineHeight: '1.6' } }, renderInlineMarkdown(line))
    )
  }
  
  flushList()
  
  return React.createElement(React.Fragment, null, ...elements)
}

/**
 * Rendu des éléments inline markdown (gras, italique, code).
 */
function renderInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let currentIndex = 0
  
  // Pattern pour détecter **gras**, *italique*, `code`
  const patterns = [
    { regex: /\*\*(.+?)\*\*/g, type: 'bold' },
    { regex: /\*(.+?)\*/g, type: 'italic' },
    { regex: /`(.+?)`/g, type: 'code' },
  ]
  
  const matches: Array<{ start: number; end: number; type: string; content: string }> = []
  
  for (const pattern of patterns) {
    let match
    while ((match = pattern.regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        type: pattern.type,
        content: match[1],
      })
    }
  }
  
  // Trier par position
  matches.sort((a, b) => a.start - b.start)
  
  // Éviter les chevauchements (priorité: code > gras > italique)
  const filteredMatches: typeof matches = []
  for (const match of matches) {
    const overlaps = filteredMatches.some(
      (m) => (match.start < m.end && match.end > m.start)
    )
    if (!overlaps) {
      filteredMatches.push(match)
    }
  }
  
  // Construire les éléments
  for (const match of filteredMatches) {
    // Ajouter le texte avant le match
    if (match.start > currentIndex) {
      parts.push(text.substring(currentIndex, match.start))
    }
    
    // Ajouter l'élément formaté
    if (match.type === 'bold') {
      parts.push(React.createElement('strong', { key: match.start }, match.content))
    } else if (match.type === 'italic') {
      parts.push(React.createElement('em', { key: match.start }, match.content))
    } else if (match.type === 'code') {
      parts.push(
        React.createElement(
          'code',
          {
            key: match.start,
            style: {
              backgroundColor: theme.background.elevated,
              padding: '0.125rem 0.25rem',
              borderRadius: '3px',
              fontSize: '0.9em',
              fontFamily: 'monospace',
            },
          },
          match.content
        )
      )
    }
    
    currentIndex = match.end
  }
  
  // Ajouter le reste du texte
  if (currentIndex < text.length) {
    parts.push(text.substring(currentIndex))
  }
  
  return parts.length > 0 ? React.createElement(React.Fragment, null, ...parts) : text
}


