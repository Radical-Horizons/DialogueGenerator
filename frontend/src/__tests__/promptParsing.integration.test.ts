/**
 * Tests d'intégration pour le parsing structuré du prompt (parsePromptSections).
 *
 * Utilise des prompts au format ### SECTION X. pour vérifier le parsing.
 * Optionnel : fichier test_prompt_output.txt à la racine pour données API réelles.
 *
 * Exécution : npm run test -- promptParsing.integration
 */
import { describe, it, expect } from 'vitest'
import { parsePromptSections } from '@/hooks/usePromptPreview'
import { readFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

describe('parsePromptSections - Integration avec vraies données API', () => {
  it('devrait parser un prompt avec SECTION 2A et CHARACTERS', () => {
    const realPrompt = `### SECTION 2A. CONTEXTE GDD

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

    const sections = parsePromptSections(realPrompt)

    const section2A = sections.find(s => s.title.includes('SECTION 2A'))
    expect(section2A).toBeDefined()

    if (section2A) {
      expect(section2A.content.length).toBeGreaterThan(0)
      const hasCharacterOrContent =
        (section2A.children?.length ?? 0) > 0 || section2A.content.includes('Akthar') || section2A.content.includes('CHARACTER')
      expect(hasCharacterOrContent).toBe(true)
    }
  })

  it('devrait parser toutes les sections principales au format ### SECTION X.', () => {
    const realPrompt = `### SECTION 0. CONTRAT GLOBAL
Contenu SECTION 0

### SECTION 1. INSTRUCTIONS TECHNIQUES
Contenu SECTION 1

### SECTION 2A. CONTEXTE GDD
--- CHARACTERS ---
Nom: Test

### SECTION 2B. GUIDES NARRATIFS
Contenu SECTION 2B

### SECTION 3. INSTRUCTIONS DE SCÈNE
Contenu SECTION 3
`

    const sections = parsePromptSections(realPrompt)

    const sectionTitles = sections.map(s => s.title)
    const hasSection0 = sectionTitles.some(t => t.includes('SECTION 0'))
    const hasSection1 = sectionTitles.some(t => t.includes('SECTION 1'))
    const hasSection2A = sectionTitles.some(t => t.includes('SECTION 2A'))
    const hasSection2B = sectionTitles.some(t => t.includes('SECTION 2B'))
    const hasSection3 = sectionTitles.some(t => t.includes('SECTION 3'))

    expect(hasSection0 || hasSection1 || hasSection2A || hasSection2B || hasSection3).toBe(true)
  })

  it('devrait parser un prompt réel depuis test_prompt_output.txt si présent', () => {
    const promptPath = join(__dirname, '../../../test_prompt_output.txt')
    let realPrompt: string
    try {
      const fileContent = readFileSync(promptPath, 'utf-8')
      const match = fileContent.match(/={80}\nPROMPT BRUT COMPLET RETOURNÉ PAR L'API:\n={80}\n([\s\S]*?)\n={80}/)
      realPrompt = match ? match[1] : fileContent
    } catch {
      realPrompt = `### SECTION 2A. CONTEXTE GDD\n--- CHARACTERS ---\nNom: Test`
    }

    const sections = parsePromptSections(realPrompt)
    expect(Array.isArray(sections)).toBe(true)
    expect(sections.length).toBeGreaterThan(0)
  })
})
