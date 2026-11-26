import { describe, expect, it } from 'vitest'
import {
  parseDialogueLine,
  serializeDialogueBlocks,
  visibleDialogueBlocks,
} from './dialogueLineBlocks'

const shown = (line: string) =>
  visibleDialogueBlocks(parseDialogueLine(line)).map(({ kind, text }) => ({ kind, text }))

const CASES: [string, string, ReturnType<typeof shown>][] = [
  [
    'sépare la narration entre astérisques de la parole',
    '*Voknir cesse de tracer.* « La galerie du Dédale Médullaire. » *Il se tait.*',
    [
      { kind: 'narration', text: 'Voknir cesse de tracer.' },
      { kind: 'speech', text: '« La galerie du Dédale Médullaire. »' },
      { kind: 'narration', text: 'Il se tait.' },
    ],
  ],
  [
    'sépare une didascalie posée en paragraphe',
    '*Il se lève.*\n\n« Oui. »',
    [
      { kind: 'narration', text: 'Il se lève.' },
      { kind: 'speech', text: '« Oui. »' },
    ],
  ],
  [
    "garde l'action du PJ entre crochets et le préfixe de trait",
    '(Cynique +5) *[Vous reculez.]*',
    [
      { kind: 'speech', text: '(Cynique +5)' },
      { kind: 'narration', text: '[Vous reculez.]' },
    ],
  ],
  [
    'garde en texte un astérisque ouvrant sans fermeture',
    '« Oui. » *Il pose',
    [{ kind: 'speech', text: '« Oui. » *Il pose' }],
  ],
  [
    'apparie ce qui peut l’être et laisse le dernier astérisque seul en parole',
    '*A* b *c',
    [
      { kind: 'narration', text: 'A' },
      { kind: 'speech', text: 'b *c' },
    ],
  ],
  [
    "n'ouvre pas de narration sur un gras `**`",
    'Le **nœud**.',
    [{ kind: 'speech', text: 'Le **nœud**.' }],
  ],
  ['rend une réplique sans narration telle quelle', '« Bonjour. »', [
    { kind: 'speech', text: '« Bonjour. »' },
  ]],
  ['ne montre rien pour des espaces seuls', '  ', []],
  ['ne montre rien pour une chaîne vide', '', []],
  ['ne montre rien pour une didascalie vide', '*  *', []],
]

/** Entrées hors affichage, pour la réversibilité et la partition. */
const EDGE_INPUTS = [
  '*',
  '**',
  '***',
  '*a**',
  '*a **b** c*',
  '  *a*  *b*  ',
  'a\r\n*b\r\n*\r\n',
  '😀 *il rit 😀* « 😀 »',
  '\u00a0*\u202fIl attend\u202f*\u00a0',
]

const ALL_INPUTS = [...CASES.map(([, line]) => line), ...EDGE_INPUTS]

describe('parseDialogueLine', () => {
  it.each(CASES)('%s', (_title, line, expected) => {
    expect(shown(line)).toEqual(expected)
  })

  it.each(ALL_INPUTS)('rend %j à l’identique après sérialisation', (line) => {
    expect(serializeDialogueBlocks(parseDialogueLine(line))).toBe(line)
  })

  it.each(ALL_INPUTS)('partitionne %j et positionne chaque texte', (line) => {
    const blocks = parseDialogueLine(line)
    let cursor = 0
    for (const block of blocks) {
      expect(block.start).toBe(cursor)
      expect(block.end).toBeGreaterThan(block.start)
      expect(block.raw).toBe(line.slice(block.start, block.end))
      expect(line.slice(block.textStart, block.textEnd)).toBe(block.text)
      expect(block.textStart).toBeGreaterThanOrEqual(block.start)
      expect(block.textEnd).toBeLessThanOrEqual(block.end)
      cursor = block.end
    }
    expect(cursor).toBe(line.length)
  })

  it('borne le texte montré sans les délimiteurs ni les espaces', () => {
    const [narration, speech] = parseDialogueLine('* Il rit. *  « Oui. » ')
    expect(narration).toMatchObject({ start: 0, end: 11, textStart: 2, textEnd: 9 })
    expect(speech).toMatchObject({ start: 11, end: 22, textStart: 13, textEnd: 21 })
  })

  it('compte les positions en unités UTF-16, comme `selectionStart`', () => {
    const [, narration] = parseDialogueLine('😀 *ri*')
    expect(narration).toMatchObject({ start: 3, textStart: 4, textEnd: 6, end: 7 })
  })
})
