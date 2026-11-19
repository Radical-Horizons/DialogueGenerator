import { describe, expect, it } from 'vitest'
import { splitDialogueLine } from './dialogueLineSegments'

describe('splitDialogueLine', () => {
  it('sépare la narration entre astérisques de la parole', () => {
    expect(
      splitDialogueLine(
        "*Voknir cesse de tracer.* « La galerie du Dédale Médullaire. » *Il se tait.*"
      )
    ).toEqual([
      { kind: 'narration', text: 'Voknir cesse de tracer.' },
      { kind: 'speech', text: '« La galerie du Dédale Médullaire. »' },
      { kind: 'narration', text: 'Il se tait.' },
    ])
  })

  it("garde l'action du PJ entre crochets et le préfixe de trait", () => {
    expect(splitDialogueLine("(Cynique +5) *[Vous faites un pas en arrière.]*")).toEqual([
      { kind: 'speech', text: '(Cynique +5)' },
      { kind: 'narration', text: '[Vous faites un pas en arrière.]' },
    ])
  })

  it('laisse en narration un astérisque ouvrant sans fermeture (aperçu tronqué)', () => {
    expect(splitDialogueLine('« Oui. » *Il pose son outil et s...')).toEqual([
      { kind: 'speech', text: '« Oui. »' },
      { kind: 'narration', text: 'Il pose son outil et s...' },
    ])
  })

  it("n'ouvre pas de narration sur un gras `**`", () => {
    expect(splitDialogueLine('« Le **nœud** de convergence. »')).toEqual([
      { kind: 'speech', text: '« Le **nœud** de convergence. »' },
    ])
  })

  it('rend une réplique sans narration telle quelle', () => {
    expect(splitDialogueLine('« Bonjour. »')).toEqual([{ kind: 'speech', text: '« Bonjour. »' }])
    expect(splitDialogueLine('')).toEqual([])
  })
})
