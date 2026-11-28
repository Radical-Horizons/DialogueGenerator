/**
 * Inventaire (story 20.4) : aucun fichier qui lance une génération ne lit le panneau
 * de contexte. La fiche de scène est la seule source.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

/** Vitest tourne depuis `frontend/`. */
const SRC = resolve(process.cwd(), 'src')

/** Chemin de génération du graphe : doit exister et rester propre. */
const GRAPH_GENERATION_FILES = [
  'components/graph/AIGenerationPanel.tsx',
  'components/graph/GraphCanvas.tsx',
  'components/graph/NodeEditorPanel.tsx',
  'hooks/useBatchGenerateFromNodes.ts',
  'hooks/useSceneSheet.ts',
  'store/slices/generationSlice.ts',
  'store/slices/sceneSlice.ts',
  'store/sceneCatalogStore.ts',
  'store/sceneProfileStore.ts',
  'components/scene/SceneContextLine.tsx',
  'utils/sceneSheet.ts',
]

/** Page Générer : inchangée jusqu'à son retrait (story 20.11). */
const GENERATE_PAGE_EXCEPTIONS = ['hooks/useGenerationHandlers.ts']

const GENERATION_CALL =
  /\b(generateFromNode|applyGenerateNodeResponse|regenerateNode|generateNode|estimateCost|startBatchGenerateFromNodesJob|useEstimation|CostEstimationBadge|generateUnityDialogue|createGenerationJob)\b/
const CONTEXT_STORE = /\bcontextStore\b|\buseContextStore\b/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      return name === '__tests__' || name === 'testFixtures' ? [] : sourceFiles(path)
    }
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)
      ? [relative(SRC, path).split(sep).join('/')]
      : []
  })
}

function read(file: string): string {
  return readFileSync(join(SRC, file), 'utf-8')
}

const callers = sourceFiles(SRC).filter((file) => GENERATION_CALL.test(read(file)))

describe('inventaire des appels de génération', () => {
  it.each(GRAPH_GENERATION_FILES)('%s ne lit pas le panneau de contexte', (file) => {
    expect(read(file)).not.toMatch(CONTEXT_STORE)
  })

  it.each(GRAPH_GENERATION_FILES)('%s ne lit pas la scène de la page Générer', (file) => {
    expect(read(file)).not.toMatch(/\bsceneSelection\b/)
  })

  it('tout autre fichier qui lance une génération non plus', () => {
    const readers = callers.filter(
      (file) => !GENERATE_PAGE_EXCEPTIONS.includes(file) && CONTEXT_STORE.test(read(file)),
    )

    expect(readers).toEqual([])
  })

  it('le balayage voit bien les appels connus et les exceptions restent justifiées', () => {
    expect(callers).toEqual(
      expect.arrayContaining([
        'components/graph/AIGenerationPanel.tsx',
        'store/slices/generationSlice.ts',
        'hooks/useBatchGenerateFromNodes.ts',
      ]),
    )
    for (const file of GENERATE_PAGE_EXCEPTIONS) {
      expect(callers).toContain(file)
      expect(read(file)).toMatch(CONTEXT_STORE)
    }
  })
})
