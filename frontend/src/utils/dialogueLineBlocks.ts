/**
 * Conversion réversible d'une réplique en blocs de narration et de parole.
 *
 * Convention des dialogues : la narration (didascalie, action du PJ) est entre astérisques
 * simples — `*Il pose son outil.*`, `*[Vous restez sur le seuil.]*` — et le reste est dit.
 * Affichage seulement : la chaîne stockée reste la donnée.
 *
 * Les blocs partitionnent la chaîne : un bloc de narration va de son `*` ouvrant à son `*`
 * fermant inclus, tout le reste (espaces et `*` sans paire compris) est parole. Les positions
 * sont en unités UTF-16 dans la chaîne stockée ; elles ne valent comme `selectionStart` que
 * pour une chaîne sans CRLF, qu'un `<textarea>` ramène à LF.
 */

export type DialogueLineBlockKind = 'narration' | 'speech'

export interface DialogueLineBlock {
  readonly kind: DialogueLineBlockKind
  /** Bornes du bloc dans la réplique, `end` exclu. */
  readonly start: number
  readonly end: number
  /** Bornes du texte montré, sans les espaces de bordure ni les délimiteurs. */
  readonly textStart: number
  readonly textEnd: number
  readonly raw: string
  readonly text: string
}

export function parseDialogueLine(line: string): DialogueLineBlock[] {
  const blocks: DialogueLineBlock[] = []
  let cursor = 0
  while (cursor < line.length) {
    const open = findSingleAsterisk(line, cursor)
    const close = open < 0 ? -1 : findSingleAsterisk(line, open + 1)
    if (close < 0) {
      blocks.push(buildBlock(line, 'speech', cursor, line.length))
      break
    }
    if (open > cursor) blocks.push(buildBlock(line, 'speech', cursor, open))
    blocks.push(buildBlock(line, 'narration', open, close + 1))
    cursor = close + 1
  }
  return blocks
}

export function serializeDialogueBlocks(blocks: readonly DialogueLineBlock[]): string {
  return blocks.map((block) => block.raw).join('')
}

/** Les blocs qui ont quelque chose à montrer ; les autres ne servent qu'à l'aller-retour. */
export function visibleDialogueBlocks(blocks: readonly DialogueLineBlock[]): DialogueLineBlock[] {
  return blocks.filter((block) => block.text !== '')
}

function buildBlock(
  line: string,
  kind: DialogueLineBlockKind,
  start: number,
  end: number
): DialogueLineBlock {
  const delimiter = kind === 'narration' ? 1 : 0
  const inner = line.slice(start + delimiter, end - delimiter)
  const text = inner.trim()
  const textStart = start + delimiter + (inner.length - inner.trimStart().length)
  return {
    kind,
    start,
    end,
    textStart,
    textEnd: textStart + text.length,
    raw: line.slice(start, end),
    text,
  }
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
