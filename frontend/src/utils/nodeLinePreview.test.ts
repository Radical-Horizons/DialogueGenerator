import { describe, expect, it } from 'vitest'

import { parseDialogueLine, visibleDialogueBlocks } from './dialogueLineBlocks'
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
    expect(preview).toBe(`${line.substring(0, NODE_LINE_PREVIEW_MAX_CHARS)}...*`)
    expect(preview.startsWith('«')).toBe(false)
  })

  it('renvoie une chaîne vide pour une réplique vide', () => {
    expect(formatNodeLinePreview('')).toBe('')
  })
})

describe('formatNodeLinePreview — coupe et didascalies', () => {
  const filler = 'a'.repeat(NODE_LINE_PREVIEW_MAX_CHARS)
  const shown = (line: string) =>
    visibleDialogueBlocks(parseDialogueLine(formatNodeLinePreview(line)))

  it.each([
    ['après un guillemet', `« Oui. » *${filler}*`],
    ['dans une réplique nue, que l’aperçu entoure de guillemets', `Il dit *${filler}*`],
    ['juste après l’astérisque ouvrant', `${'a'.repeat(NODE_LINE_PREVIEW_MAX_CHARS - 1)}*fin*`],
    ['juste avant l’astérisque fermant', `*${'a'.repeat(NODE_LINE_PREVIEW_MAX_CHARS - 1)}*`],
  ])('referme la didascalie coupée %s', (_title, line) => {
    const blocks = shown(line)
    expect(blocks[blocks.length - 1].kind).toBe('narration')
    expect(blocks.map((block) => block.text).join('')).not.toContain('*')
  })

  it.each([
    [
      'après un guillemet',
      `« Oui. » *${filler}*`,
      [
        { kind: 'speech', text: '« Oui. »' },
        { kind: 'narration', text: `${'a'.repeat(NODE_LINE_PREVIEW_MAX_CHARS - 10)}...` },
      ],
    ],
    [
      'dans une réplique nue entre guillemets',
      `Il dit *${filler}*`,
      [
        { kind: 'speech', text: '« Il dit' },
        { kind: 'narration', text: `${'a'.repeat(NODE_LINE_PREVIEW_MAX_CHARS - 8)}... »` },
      ],
    ],
  ])('montre les mêmes passages pour une coupe %s', (_title, line, expected) => {
    expect(shown(line).map(({ kind, text }) => ({ kind, text }))).toEqual(expected)
  })

  it('laisse visible l’astérisque jamais fermé d’une réplique tronquée', () => {
    const line = `« Oui. » *${filler}`
    expect(formatNodeLinePreview(line).endsWith('*')).toBe(false)
    const blocks = shown(line)
    expect(blocks.map((block) => block.kind)).toEqual(['speech'])
    expect(blocks[0].text).toContain('*')
  })

  it.each([
    ['fermée avant la coupe', `*Il rit.* ${filler}`],
    ['fermée juste avant la coupe', `*${'a'.repeat(NODE_LINE_PREVIEW_MAX_CHARS - 2)}* suite`],
    ['ouverte après la coupe', `${filler}*Il rit.*`],
  ])('n’ajoute rien quand la didascalie est %s', (_title, line) => {
    expect(formatNodeLinePreview(line).endsWith('*')).toBe(false)
  })
})
