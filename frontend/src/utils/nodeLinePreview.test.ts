import { describe, expect, it } from 'vitest'

import { formatNodeLinePreview, NODE_LINE_PREVIEW_MAX_CHARS } from './nodeLinePreview'

describe('formatNodeLinePreview', () => {
  it('met entre guillemets une réplique nue', () => {
    expect(formatNodeLinePreview('Bonjour.')).toBe('« Bonjour. »')
  })

  it('laisse telle quelle une réplique qui commence par un guillemet', () => {
    expect(formatNodeLinePreview('« Oh Théomaque ! »')).toBe('« Oh Théomaque ! »')
  })

  it('n’enveloppe pas une réplique qui s’ouvre sur une didascalie en italique', () => {
    const line = '*Il se tourne vers vous.* « Salutation. »'
    expect(formatNodeLinePreview(line)).toBe(line)
  })

  it('n’enveloppe pas une réplique dont les guillemets viennent après un texte', () => {
    const line = 'Il murmure : « Venez. »'
    expect(formatNodeLinePreview(line)).toBe(line)
  })

  it('tronque au-delà du seuil, sans doubler les guillemets', () => {
    const line = `*${'a'.repeat(NODE_LINE_PREVIEW_MAX_CHARS + 20)}*`
    const preview = formatNodeLinePreview(line)
    expect(preview.endsWith('...')).toBe(true)
    expect(preview.startsWith('«')).toBe(false)
  })

  it('renvoie une chaîne vide pour une réplique vide', () => {
    expect(formatNodeLinePreview('')).toBe('')
  })
})
