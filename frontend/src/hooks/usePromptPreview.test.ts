/**
 * Tests unitaires pour le parsing du prompt structuré.
 */
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { parsePromptSections, parsePromptFromJson, usePromptPreview } from './usePromptPreview'

describe('parsePromptSections', () => {
  describe('Parsing des marqueurs explicites', () => {
    it('devrait parser les marqueurs explicites PNJ X en mode default', () => {
      const prompt = `### SECTION 2A. CONTEXTE GDD

--- CHARACTERS ---
--- PNJ 1 ---
Nom: Personnage 1
Alias: Alias 1
Occupation/Rôle: Guerrier
--- PNJ 2 ---
Nom: Personnage 2
Alias: Alias 2
Occupation/Rôle: Mage
`

      const sections = parsePromptSections(prompt)
      const section2A = sections.find(s => s.title.includes('SECTION 2A'))
      expect(section2A).toBeDefined()

      // Vérifier que les marqueurs sont parsés correctement
      const charactersSection = section2A?.children?.find(c => c.title === 'CHARACTERS')
      expect(charactersSection).toBeDefined()
      expect(charactersSection?.children).toBeDefined()
      expect(charactersSection?.children?.length).toBe(2)

      // Vérifier les noms de fiche extraits du contenu
      const pnj1 = charactersSection?.children?.find(c => c.title === 'Personnage 1')
      expect(pnj1).toBeDefined()
      expect(pnj1?.content).toContain('Personnage 1')
      expect(pnj1?.content).toContain('Alias 1')
      expect(pnj1?.content).toContain('Guerrier')

      const pnj2 = charactersSection?.children?.find(c => c.title === 'Personnage 2')
      expect(pnj2).toBeDefined()
      expect(pnj2?.content).toContain('Personnage 2')
      expect(pnj2?.content).toContain('Alias 2')
      expect(pnj2?.content).toContain('Mage')
    })

    it('devrait parser les marqueurs pour différentes catégories (LIEU, OBJET)', () => {
      const prompt = `### SECTION 2A. CONTEXTE GDD

--- LOCATIONS ---
--- LIEU 1 ---
Nom: Lieu 1
Description: Description du lieu 1
--- LIEU 2 ---
Nom: Lieu 2
Description: Description du lieu 2

--- ITEMS ---
--- OBJET 1 ---
Nom: Objet 1
Type: Arme
`

      const sections = parsePromptSections(prompt)
      const section2A = sections.find(s => s.title.includes('SECTION 2A'))
      expect(section2A).toBeDefined()

      // Vérifier les lieux
      const locationsSection = section2A?.children?.find(c => c.title === 'LOCATIONS')
      expect(locationsSection).toBeDefined()
      expect(locationsSection?.children?.length).toBe(2)
      expect(locationsSection?.children?.find(c => c.title === 'Lieu 1')).toBeDefined()
      expect(locationsSection?.children?.find(c => c.title === 'Lieu 2')).toBeDefined()

      // Vérifier les objets
      const itemsSection = section2A?.children?.find(c => c.title === 'ITEMS')
      expect(itemsSection).toBeDefined()
      expect(itemsSection?.children?.length).toBe(1)
      expect(itemsSection?.children?.find(c => c.title === 'Objet 1')).toBeDefined()
    })

    it('devrait parser les marqueurs avec noms de fiches explicites', () => {
      const prompt = `### SECTION 2A. CONTEXTE GDD

--- CHARACTERS ---
--- Elara ---
Nom: Elara
Occupation: Mage
--- Grog ---
Nom: Grog
Occupation: Guerrier
`

      const sections = parsePromptSections(prompt)
      const section2A = sections.find(s => s.title.includes('SECTION 2A'))
      const charactersSection = section2A?.children?.find(c => c.title === 'CHARACTERS')
      expect(charactersSection?.children?.map(c => c.title)).toEqual(['Elara', 'Grog'])
    })

    it('devrait utiliser le fallback sur "Nom:" si aucun marqueur explicite trouvé', () => {
      // Test de rétrocompatibilité : prompt sans marqueurs explicites
      const prompt = `### SECTION 2A. CONTEXTE GDD

--- CHARACTERS ---
Nom: Personnage 1
Alias: Alias 1
Nom: Personnage 2
Alias: Alias 2
`

      const sections = parsePromptSections(prompt)
      const section2A = sections.find(s => s.title.includes('SECTION 2A'))
      expect(section2A).toBeDefined()

      const charactersSection = section2A?.children?.find(c => c.title === 'CHARACTERS')
      expect(charactersSection).toBeDefined()
      
      // Le fallback devrait détecter les éléments par "Nom:"
      expect(charactersSection?.children).toBeDefined()
      expect(charactersSection?.children?.length).toBeGreaterThan(0)
    })

    it('devrait parser les marqueurs même en mode excerpt', () => {
      const prompt = `### SECTION 2A. CONTEXTE GDD

--- CHARACTERS ---
--- PNJ 1 ---
Nom (extrait): Personnage 1
Alias (extrait): Alias 1
--- PNJ 2 ---
Nom (extrait): Personnage 2
Alias (extrait): Alias 2
`

      const sections = parsePromptSections(prompt)
      const section2A = sections.find(s => s.title.includes('SECTION 2A'))
      expect(section2A).toBeDefined()

      const charactersSection = section2A?.children?.find(c => c.title === 'CHARACTERS')
      expect(charactersSection).toBeDefined()
      expect(charactersSection?.children?.length).toBe(2)
      expect(charactersSection?.children?.find(c => c.title === 'Personnage 1')).toBeDefined()
      expect(charactersSection?.children?.find(c => c.title === 'Personnage 2')).toBeDefined()
    })
  })
  it('devrait parser une SECTION 2A avec sections imbriquées CHARACTERS', () => {
    const prompt = `### SECTION 2A. CONTEXTE GDD

**CONTEXTE GÉNÉRAL DE LA SCÈNE**
--- CHARACTERS ---
--- IDENTITÉ ---
Nom: Akthar-Neth Amatru, l'Exégète
Alias: Grand-Père
Occupation/Rôle: Interprète des textes

--- CARACTÉRISATION ---
Désir Principal: Accomplir le Dernier Rituel
Faiblesse: Obsession terrifiante du Dernier Rituel

--- IDENTITÉ ---
Nom: Valkazer Reitar
Alias: Le Guerrier
Occupation/Rôle: Gardien

--- CARACTÉRISATION ---
Désir Principal: Protéger les siens
Faiblesse: Témérité excessive

### SECTION 2B. GUIDES NARRATIFS

Contenu des guides narratifs...
`

    const sections = parsePromptSections(prompt)

    // Vérifier qu'on a bien la SECTION 2A
    const section2A = sections.find(s => s.title.includes('SECTION 2A'))
    expect(section2A).toBeDefined()
    expect(section2A?.children).toBeDefined()
    expect(section2A?.children?.length).toBeGreaterThan(0)

    // Vérifier que les sections imbriquées sont détectées
    // On devrait avoir des wrappers "PNJ 1", "PNJ 2" avec des sections IDENTITÉ, CARACTÉRISATION en enfants
    const hasCharacterSections = section2A?.children?.some(
      child => child.title === "Akthar-Neth Amatru, l'Exégète" || child.title === 'Valkazer Reitar'
    )
    expect(hasCharacterSections).toBe(true)
    
    const characterWrappers = section2A?.children?.filter(
      child => child.title === "Akthar-Neth Amatru, l'Exégète" || child.title === 'Valkazer Reitar'
    )
    characterWrappers?.forEach(wrapper => {
      expect(wrapper.children).toBeDefined()
      expect(wrapper.children?.length).toBeGreaterThan(0)
    })

    // Vérifier que le contenu avant les sections --- est dans remainingContent
    expect(section2A?.content).toContain('CONTEXTE GÉNÉRAL DE LA SCÈNE')
  })

  it('devrait parser une SECTION 2A avec un seul personnage (wrapper au nom de la fiche)', () => {
    const prompt = `### SECTION 2A. CONTEXTE GDD

**CONTEXTE GÉNÉRAL DE LA SCÈNE**
--- CHARACTERS ---
--- IDENTITÉ ---
Nom: Akthar-Neth Amatru, l'Exégète
Alias: Grand-Père

--- CARACTÉRISATION ---
Désir Principal: Accomplir le Dernier Rituel

### SECTION 2B. GUIDES NARRATIFS

Contenu...
`

    const sections = parsePromptSections(prompt)
    const section2A = sections.find(s => s.title.includes('SECTION 2A'))

    expect(section2A).toBeDefined()
    expect(section2A?.children).toBeDefined()

    const hasCharacterWrapper = section2A?.children?.some(
      child => child.title === "Akthar-Neth Amatru, l'Exégète"
    )
    expect(hasCharacterWrapper).toBe(true)

    const pnjWrapper = section2A?.children?.find(
      child => child.title === "Akthar-Neth Amatru, l'Exégète"
    )
    expect(pnjWrapper?.children).toBeDefined()
    expect(pnjWrapper?.children?.length).toBeGreaterThan(0)
    
    const hasIdentity = pnjWrapper?.children?.some(child => child.title === 'IDENTITÉ')
    const hasCaracterisation = pnjWrapper?.children?.some(child => child.title === 'CARACTÉRISATION')
    expect(hasIdentity || hasCaracterisation).toBe(true)
  })

  it('devrait parser une SECTION 2A avec plusieurs personnages (wrappers au nom de chaque fiche)', () => {
    const prompt = `### SECTION 2A. CONTEXTE GDD

**CONTEXTE GÉNÉRAL DE LA SCÈNE**
--- CHARACTERS ---
--- IDENTITÉ ---
Nom: Akthar-Neth Amatru, l'Exégète

--- CARACTÉRISATION ---
Désir Principal: Accomplir le Dernier Rituel

--- IDENTITÉ ---
Nom: Valkazer Reitar

--- CARACTÉRISATION ---
Désir Principal: Protéger les siens

### SECTION 2B. GUIDES NARRATIFS

Contenu...
`

    const sections = parsePromptSections(prompt)
    const section2A = sections.find(s => s.title.includes('SECTION 2A'))

    expect(section2A).toBeDefined()
    expect(section2A?.children).toBeDefined()

    const characterWrappers = section2A?.children?.filter(
      child => child.title === "Akthar-Neth Amatru, l'Exégète" || child.title === 'Valkazer Reitar'
    )
    expect(characterWrappers?.length).toBe(2)

    // Chaque wrapper devrait avoir des enfants (sections IDENTITÉ, CARACTÉRISATION)
    characterWrappers?.forEach(wrapper => {
      expect(wrapper.children).toBeDefined()
      expect(wrapper.children?.length).toBeGreaterThan(0)
    })
  })

  it('devrait parser une SECTION 2A vide ou avec seulement du texte (sans sections ---)', () => {
    const prompt = `### SECTION 2A. CONTEXTE GDD

**CONTEXTE GÉNÉRAL DE LA SCÈNE**
Aucun contexte disponible pour cette scène.

**LIEU DE LA SCÈNE**
Lieu : Non spécifié

### SECTION 2B. GUIDES NARRATIFS

Contenu...
`

    const sections = parsePromptSections(prompt)
    const section2A = sections.find(s => s.title.includes('SECTION 2A'))

    expect(section2A).toBeDefined()
    // Si pas de sections ---, children devrait être undefined ou vide
    expect(section2A?.children === undefined || section2A?.children?.length === 0).toBe(true)
    // Le contenu devrait être dans content
    expect(section2A?.content).toContain('CONTEXTE GÉNÉRAL DE LA SCÈNE')
    expect(section2A?.content).toContain('LIEU DE LA SCÈNE')
  })

  it('devrait parser correctement les sections avec contenu avant les sections ---', () => {
    const prompt = `### SECTION 2A. CONTEXTE GDD

**CONTEXTE GÉNÉRAL DE LA SCÈNE**
Ceci est du texte avant les sections.

--- CHARACTERS ---
--- IDENTITÉ ---
Nom: Test Personnage

### SECTION 2B. GUIDES NARRATIFS

Contenu...
`

    const sections = parsePromptSections(prompt)
    const section2A = sections.find(s => s.title.includes('SECTION 2A'))

    expect(section2A).toBeDefined()
    // Le texte avant les sections --- devrait être dans remainingContent
    expect(section2A?.content).toContain('CONTEXTE GÉNÉRAL DE LA SCÈNE')
    expect(section2A?.content).toContain('Ceci est du texte avant les sections')
    // Les sections --- devraient être dans children
    expect(section2A?.children).toBeDefined()
    expect(section2A?.children?.length).toBeGreaterThan(0)
  })

  it('devrait parser plusieurs sections principales', () => {
    const prompt = `### SECTION 0. CONTRAT GLOBAL

Contenu section 0

### SECTION 1. INSTRUCTIONS TECHNIQUES

Contenu section 1

### SECTION 2A. CONTEXTE GDD

**CONTEXTE GÉNÉRAL DE LA SCÈNE**
--- CHARACTERS ---
--- IDENTITÉ ---
Nom: Test

### SECTION 3. INSTRUCTIONS DE SCÈNE

Contenu section 3
`

    const sections = parsePromptSections(prompt)

    expect(sections.length).toBeGreaterThanOrEqual(4)
    expect(sections.some(s => s.title.includes('SECTION 0'))).toBe(true)
    expect(sections.some(s => s.title.includes('SECTION 1'))).toBe(true)
    expect(sections.some(s => s.title.includes('SECTION 2A'))).toBe(true)
    expect(sections.some(s => s.title.includes('SECTION 3'))).toBe(true)
  })

  it('devrait gérer une SECTION 2A avec très peu de contenu (cas problématique)', () => {
    // Cas où la SECTION 2A contient seulement du texte introductif sans sections ---
    // Ce cas correspond à une SECTION 2A avec ~11 tokens
    const prompt = `### SECTION 2A. CONTEXTE GDD

**CONTEXTE GÉNÉRAL DE LA SCÈNE**

### SECTION 2B. GUIDES NARRATIFS

Contenu...
`

    const sections = parsePromptSections(prompt)
    const section2A = sections.find(s => s.title.includes('SECTION 2A'))

    expect(section2A).toBeDefined()
    // Si pas de sections ---, children devrait être undefined
    expect(section2A?.children).toBeUndefined()
    // Le contenu devrait être dans content
    expect(section2A?.content).toContain('CONTEXTE GÉNÉRAL DE LA SCÈNE')
    // Le token count devrait être calculé correctement
    expect(section2A?.tokenCount).toBeGreaterThan(0)
  })

  it('devrait détecter les sections --- même avec du texte avant', () => {
    // Cas réel : SECTION 2A avec texte avant les sections ---
    const prompt = `### SECTION 2A. CONTEXTE GDD

**CONTEXTE GÉNÉRAL DE LA SCÈNE**
Ce texte est avant les sections.

--- CHARACTERS ---
--- IDENTITÉ ---
Nom: Personnage Test
Alias: Alias Test

--- CARACTÉRISATION ---
Désir: Test désir

### SECTION 2B. GUIDES NARRATIFS

Contenu...
`

    const sections = parsePromptSections(prompt)
    const section2A = sections.find(s => s.title.includes('SECTION 2A'))

    expect(section2A).toBeDefined()
    // Le texte avant devrait être dans content
    expect(section2A?.content).toContain('CONTEXTE GÉNÉRAL DE LA SCÈNE')
    expect(section2A?.content).toContain('Ce texte est avant les sections')
    // Les sections --- devraient être détectées et dans children
    expect(section2A?.children).toBeDefined()
    expect(section2A?.children?.length).toBeGreaterThan(0)
    // Vérifier que les sections imbriquées contiennent bien le contenu
    // Dans le format legacy, les sections IDENTITÉ/CARACTÉRISATION sont imbriquées sous un wrapper PNJ
    const hasIdentity = section2A?.children?.some((wrapper) =>
      wrapper.children?.some(
        (child) => child.title === 'IDENTITÉ' && child.content.includes('Personnage Test')
      )
    )
    expect(hasIdentity).toBe(true)
  })

  it('devrait afficher le contenu de CHARACTERS même sans sections IDENTITÉ (format default)', () => {
    // Format réel généré par le mode "default" : --- CHARACTERS --- suivi directement des champs
    const prompt = `### SECTION 2A. CONTEXTE GDD

**CONTEXTE GÉNÉRAL DE LA SCÈNE**
--- CHARACTERS ---
Nom: Akthar-Neth Amatru, l'Exégète
Alias: Grand-Père
Occupation: Interprète des textes
Espèce: Van'Doei

### SECTION 2B. GUIDES NARRATIFS

Contenu...
`

    const sections = parsePromptSections(prompt)
    const section2A = sections.find(s => s.title.includes('SECTION 2A'))

    expect(section2A).toBeDefined()
    
    // En mode "default", on obtient un wrapper de catégorie (CHARACTERS) puis des items (PNJ 1, ...)
    const charactersSection = section2A?.children?.find((c) => c.title === 'CHARACTERS')
    expect(charactersSection).toBeDefined()

    const pnjSection = charactersSection?.children?.find(
      (c) => c.title === "Akthar-Neth Amatru, l'Exégète"
    )
    expect(pnjSection).toBeDefined()
    expect(pnjSection?.content).toContain('Akthar-Neth')
  })
})

describe('parsePromptFromJson', () => {
  it('should parse a valid PromptStructure into PromptSection[]', () => {
    const promptJson: import('../types/prompt').PromptStructure = {
      sections: [
        {
          type: 'system_prompt',
          title: 'System Prompt',
          content: 'You are a helpful assistant.',
          tokenCount: 10
        },
        {
          type: 'context',
          title: 'CONTEXTE GÉNÉRAL DE LA SCÈNE',
          content: '',
          tokenCount: 100,
          categories: [
            {
              type: 'characters',
              title: 'CHARACTERS',
              items: [
                {
                  id: 'PNJ_1',
                  name: 'Akthar-Neth Amatru',
                  metadata: { real_name: 'Akthar-Neth Amatru', element_name: 'Akthar-Neth Amatru' },
                  sections: [
                    {
                      title: 'IDENTITÉ',
                      content: 'Nom: Test Character',
                      tokenCount: 5
                    },
                    {
                      title: 'CARACTÉRISATION',
                      content: 'Désir: Test desire',
                      tokenCount: 5
                    }
                  ],
                  tokenCount: 10
                }
              ],
              tokenCount: 10
            }
          ]
        }
      ],
      metadata: {
        totalTokens: 110,
        generatedAt: '2025-01-01T12:00:00Z',
        organizationMode: 'narrative'
      }
    }

    const result = parsePromptFromJson(promptJson)

    expect(result).toHaveLength(2)
    expect(result[0].title).toBe('System Prompt')
    expect(result[0].content).toBe('You are a helpful assistant.')
    // Les sections de "contexte" sont aplaties: les catégories deviennent des sections top-level
    expect(result[1].title).toBe('CHARACTERS')
    expect(result[1].children).toBeDefined()
    expect(result[1].children).toHaveLength(1)
    expect(result[1].children![0].title).toBe('Akthar-Neth Amatru')
    expect(result[1].children![0].children).toBeDefined()
    expect(result[1].children![0].children).toHaveLength(2)
  })

  it('should return empty array for null input', () => {
    const result = parsePromptFromJson(null)
    expect(result).toEqual([])
  })

  it('should return empty array for undefined input', () => {
    const result = parsePromptFromJson(undefined)
    expect(result).toEqual([])
  })

  it('should handle sections without categories', () => {
    const promptJson: import('../types/prompt').PromptStructure = {
      sections: [
        {
          type: 'instruction',
          title: 'SECTION 3. INSTRUCTIONS',
          content: 'Test instructions',
          tokenCount: 5
        }
      ],
      metadata: {
        totalTokens: 5,
        generatedAt: '2025-01-01T12:00:00Z'
      }
    }

    const result = parsePromptFromJson(promptJson)

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('SECTION 3. INSTRUCTIONS')
    expect(result[0].content).toBe('Test instructions')
    expect(result[0].children).toBeUndefined()
  })
})

describe('usePromptPreview with structured prompt', () => {
  it('should use structured prompt when available', () => {
    const promptJson: import('../types/prompt').PromptStructure = {
      sections: [
        {
          type: 'context',
          title: 'CONTEXTE',
          content: '',
          tokenCount: 10,
          categories: []
        }
      ],
      metadata: {
        totalTokens: 10,
        generatedAt: '2025-01-01T12:00:00Z'
      }
    }

    const { result } = renderHook(() => usePromptPreview('fallback text', promptJson))

    expect(result.current.sections).toHaveLength(1)
    expect(result.current.sections[0].title).toBe('CONTEXTE')
  })

  it('should fallback to text parsing when structured prompt is null', () => {
    const textPrompt = '### SECTION 1. TEST\n\nTest content'
    
    const { result } = renderHook(() => usePromptPreview(textPrompt, null))

    expect(result.current.sections.length).toBeGreaterThan(0)
  })
})
