/**
 * Découpe d'une réplique en narration et en parole.
 *
 * Convention des dialogues : la narration (didascalie, action du PJ) est entre astérisques
 * simples — `*Il pose son outil.*`, `*[Vous restez sur le seuil.]*` — et le reste est dit.
 * L'affichage met chaque passage de l'un à l'autre à la ligne : narration en italique
 * grisé, parole en romain. Un astérisque ouvrant sans fermeture (aperçu tronqué, génération
 * en cours) laisse la suite en narration.
 */

export type DialogueLineSegmentKind = 'narration' | 'speech'

export interface DialogueLineSegment {
  kind: DialogueLineSegmentKind
  text: string
}

function pushSegment(segments: DialogueLineSegment[], kind: DialogueLineSegmentKind, raw: string): void {
  const text = raw.trim()
  if (text) segments.push({ kind, text })
}

export function splitDialogueLine(line: string): DialogueLineSegment[] {
  const segments: DialogueLineSegment[] = []
  let cursor = 0
  while (cursor < line.length) {
    const open = findSingleAsterisk(line, cursor)
    if (open < 0) {
      pushSegment(segments, 'speech', line.slice(cursor))
      break
    }
    pushSegment(segments, 'speech', line.slice(cursor, open))
    const close = findSingleAsterisk(line, open + 1)
    if (close < 0) {
      pushSegment(segments, 'narration', line.slice(open + 1))
      break
    }
    pushSegment(segments, 'narration', line.slice(open + 1, close))
    cursor = close + 1
  }
  return segments
}

/** Astérisque isolé : `**gras**` n'ouvre pas de narration. */
function findSingleAsterisk(text: string, from: number): number {
  for (let index = from; index < text.length; index++) {
    if (text[index] !== '*') continue
    if (text[index + 1] === '*') {
      index++
      continue
    }
    return index
  }
  return -1
}
