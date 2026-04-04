import { describe, it, expect } from 'vitest'
import { splitSectionsGeneralText } from './splitSectionsGeneral'

describe('splitSectionsGeneralText', () => {
  it('retourne [] pour chaîne vide', () => {
    expect(splitSectionsGeneralText('')).toEqual([])
    expect(splitSectionsGeneralText('   ')).toEqual([])
  })

  it('produit un seul bloc préambule sans titres', () => {
    const chunks = splitSectionsGeneralText('Ligne unique.\nDeuxième.')
    expect(chunks).toHaveLength(1)
    expect(chunks[0].slug).toBe('preamble')
    expect(chunks[0].title).toBe('Préambule')
    expect(chunks[0].body).toContain('Ligne unique')
  })

  it('découpe sur # ## ### (niveau ≤ 3)', () => {
    const text = ['Intro avant titre.', '# Titre A', 'Corps A', '## Titre B', 'Corps B'].join('\n')
    const chunks = splitSectionsGeneralText(text)
    expect(chunks.map((c) => c.title)).toEqual(['Préambule', 'Titre A', 'Titre B'])
    expect(chunks[0].body).toContain('Intro avant titre')
    expect(chunks[1].body.trim()).toBe('Corps A')
    expect(chunks[2].body.trim()).toBe('Corps B')
  })

  it('ligne commençant par #### est traitée comme titre ### (aligné Python)', () => {
    const text = ['# Un', 'ok', '#### Quatre', 'ligne'].join('\n')
    const chunks = splitSectionsGeneralText(text)
    expect(chunks.map((c) => c.title)).toContain('Un')
    expect(chunks.some((c) => c.title === '# Quatre')).toBe(true)
    expect(chunks.find((c) => c.title === 'Un')?.body.trim()).toBe('ok')
  })
})
