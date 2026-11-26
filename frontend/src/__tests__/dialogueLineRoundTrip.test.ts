/**
 * Aller-retour réplique ↔ blocs sur de vrais dialogues (Story 20.1) :
 * `serializeDialogueBlocks(parseDialogueLine(x)) === x` pour chaque `line` et texte de réponse.
 *
 * En CI : les fixtures de `tests/fixtures/unity_dialogues/inputs/`. En local,
 * `node scripts/dialogue-roundtrip-local.cjs` ajoute les dialogues de l'auteur via
 * `DIALOGUE_ROUNDTRIP_DIR`.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { parseDialogueLine, serializeDialogueBlocks } from '../utils/dialogueLineBlocks'

const FIXTURES_DIR = resolve(process.cwd(), '..', 'tests', 'fixtures', 'unity_dialogues', 'inputs')
const LOCAL_DIR = process.env.DIALOGUE_ROUNDTRIP_DIR

interface RawNode {
  id?: string
  line?: unknown
  choices?: { text?: unknown }[]
}

/** Tableau nu de nœuds (génération) ou document `{ nodes }` (fichier persisté). */
function readNodes(path: string): RawNode[] {
  const raw = JSON.parse(readFileSync(path, 'utf-8').replace(/^\ufeff/, ''))
  const nodes = Array.isArray(raw) ? raw : raw?.nodes
  if (!Array.isArray(nodes)) throw new Error(`${path} : ni tableau de nœuds ni { nodes }`)
  return nodes
}

function dialogueStrings(nodes: RawNode[]): { where: string; value: string }[] {
  return nodes.flatMap((node) =>
    [
      { where: `${node.id} line`, value: node.line },
      ...(node.choices ?? []).map((choice, index) => ({
        where: `${node.id} choix ${index}`,
        value: choice.text,
      })),
    ].filter((entry): entry is { where: string; value: string } => typeof entry.value === 'string')
  )
}

function checkFolder(dir: string): void {
  const files = readdirSync(dir).filter((name) => name.endsWith('.json'))
  let count = 0
  const mismatches: string[] = []
  for (const file of files) {
    for (const { where, value } of dialogueStrings(readNodes(join(dir, file)))) {
      count += 1
      const blocks = parseDialogueLine(value)
      const misplaced = blocks.some(
        (block) =>
          value.slice(block.textStart, block.textEnd) !== block.text ||
          value.slice(block.start, block.end) !== block.raw
      )
      if (misplaced || serializeDialogueBlocks(blocks) !== value) {
        mismatches.push(`${file} / ${where}`)
      }
    }
  }
  process.stdout.write(
    `aller-retour : ${files.length} dialogues, ${count} chaînes, ${mismatches.length} écart(s) depuis ${dir}\n`
  )
  expect(count, `aucune chaîne lue dans ${dir}`).toBeGreaterThan(0)
  expect(mismatches).toEqual([])
}

describe('p0 — aller-retour réplique ↔ blocs', () => {
  it('rend à l’identique chaque chaîne des fixtures', () => {
    checkFolder(FIXTURES_DIR)
  })

  it.skipIf(!LOCAL_DIR)('rend à l’identique chaque chaîne de DIALOGUE_ROUNDTRIP_DIR', () => {
    checkFolder(LOCAL_DIR as string)
  })
})
