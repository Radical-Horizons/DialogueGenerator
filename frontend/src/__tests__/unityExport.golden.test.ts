/**
 * Golden de l'export Unity, chemins front (Story 20.1, risque R-01).
 *
 * Chaque dialogue de `tests/fixtures/unity_dialogues/inputs/` est chargé comme le
 * fait l'éditeur (`loadDialogueFromRawJson`) puis passé par trois chemins :
 * - `front-canonique` : `exportToUnity` (`graphToDocument`) ;
 * - `front-invite` : `useUnityExport` en session invitée (`JSON.stringify(state.document)`) ;
 * - `front-payload` : le corps que `useUnityExport` envoie à `save-and-write`, capturé
 *   sur `saveGraphAndWrite` pour un dialogue sans `documentId`, positions mises à zéro.
 *   Il sert aussi d'entrée au chemin `python-graphe` du pytest : régénérer ici d'abord.
 *
 * La sortie est comparée au texte de `expected/<chemin>/<fixture>.json` (ou
 * `.error.txt` quand le chemin rejette l'entrée). Les attendus figent le
 * comportement actuel, défauts compris ; `UPDATE_GOLDEN=1` les régénère.
 * Pendant Python : `tests/services/test_unity_export_golden.py`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

vi.mock('../api/documents', () => ({
  getLayout: vi.fn().mockRejectedValue({ response: { status: 404 } }),
}))
vi.mock('../api/graph', () => ({
  validateSchema: vi.fn(),
  saveGraphAndWrite: vi.fn(),
}))
vi.mock('../components/graph/graphEditorStandalone', () => ({
  downloadUnityExport: vi.fn(),
}))

import * as graphAPI from '../api/graph'
import { useGraphStore } from '../store/graphStore'
import { useAuthStore } from '../store/authStore'
import { useUnityExport, type UnityExportSchemaState } from '../hooks/useUnityExport'

/** Vitest tourne depuis `frontend/` (CI et scripts npm), comme les tests PWA. */
const GOLDEN_ROOT = resolve(process.cwd(), '..', 'tests', 'fixtures', 'unity_dialogues')
const INPUTS_DIR = join(GOLDEN_ROOT, 'inputs')
const EXPECTED_DIR = join(GOLDEN_ROOT, 'expected')
const UPDATE = process.env.UPDATE_GOLDEN === '1'
const INITIAL_AUTH_STATE = useAuthStore.getState()

const FIXTURES = readdirSync(INPUTS_DIR)
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.slice(0, -'.json'.length))
  .sort()

/** Défaillance du banc (mocks, validation bloquée) : le test échoue, rien n'est figé. */
class GoldenHarnessError extends Error {
  name = 'GoldenHarnessError'
}

const schemaState: UnityExportSchemaState = {
  setShowSchemaValidationPanel: vi.fn(),
  setSchemaValidationLoading: vi.fn(),
  setSchemaValidationIsValid: vi.fn(),
  setSchemaValidationErrors: vi.fn(),
  setSchemaValidationErrorCount: vi.fn(),
  setSchemaValidationWarnings: vi.fn(),
  setSchemaValidationStructuredErrors: vi.fn(),
}

/** Fiche de scène ajoutée à l'entrée pour vérifier qu'aucun chemin ne l'exporte. */
let injectedScene: Record<string, unknown> | null = null

/** Fixtures au format document : seules elles peuvent porter `scene`. */
const DOCUMENT_FIXTURES = FIXTURES.filter(
  (name) => !Array.isArray(JSON.parse(readFileSync(join(INPUTS_DIR, `${name}.json`), 'utf-8'))),
)

async function loadFixture(fixture: string): Promise<void> {
  let raw = readFileSync(join(INPUTS_DIR, `${fixture}.json`), 'utf-8')
  if (injectedScene) {
    raw = JSON.stringify({ ...(JSON.parse(raw) as object), scene: injectedScene })
  }
  await useGraphStore.getState().loadDialogueFromRawJson(raw, fixture)
}

async function renderCanonical(fixture: string): Promise<string> {
  await loadFixture(fixture)
  return useGraphStore.getState().exportToUnity()
}

async function renderGuest(fixture: string): Promise<string> {
  await loadFixture(fixture)
  useAuthStore.setState({ user: { role: 'guest' } } as never)
  const toast = vi.fn()
  const registerSuccessfulExport = vi.fn()
  const { result } = renderHook(() =>
    useUnityExport(toast, schemaState, { registerSuccessfulExport }),
  )
  await act(() => result.current.handleExportUnity())
  const call = registerSuccessfulExport.mock.calls[0]
  if (!call) {
    // Le hook avale ses erreurs en toast : sans export, c'est le banc qui est en cause.
    const reason = toast.mock.calls.map((args) => String(args[0])).join(' | ')
    throw new GoldenHarnessError(`export invité non produit : ${reason || 'aucun message'}`)
  }
  return String(call[0])
}

/** Corps que `useUnityExport` envoie vraiment à `saveGraphAndWrite` (dialogue sans `documentId`). */
async function renderPayload(fixture: string): Promise<string> {
  await loadFixture(fixture)
  useGraphStore.setState({ documentId: null })
  vi.mocked(graphAPI.saveGraphAndWrite).mockResolvedValue({ json_content: '', filename: 'x' } as never)
  const toast = vi.fn()
  const { result } = renderHook(() =>
    useUnityExport(toast, schemaState, { registerSuccessfulExport: vi.fn() }),
  )
  await act(() => result.current.handleExportUnity())
  const call = vi.mocked(graphAPI.saveGraphAndWrite).mock.calls[0]
  if (!call) {
    const reason = toast.mock.calls.map((args) => String(args[0])).join(' | ')
    throw new GoldenHarnessError(`save-and-write non appelé : ${reason || 'aucun message'}`)
  }
  const payload = call[0]
  // Le rendu Python ne lit pas les positions ; la redisposition ne doit pas faire tomber le golden.
  const nodes = payload.nodes.map((node) => ({ ...node, position: { x: 0, y: 0 } }))
  return JSON.stringify({ ...payload, nodes }, null, 2)
}

const PATHS: Record<string, (fixture: string) => Promise<string>> = {
  'front-canonique': renderCanonical,
  'front-invite': renderGuest,
  'front-payload': renderPayload,
}

function describeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}\n`
  let detail: string | undefined
  try {
    detail = JSON.stringify(err)
  } catch {
    detail = undefined
  }
  return `${typeof err}: ${detail ?? String(err)}\n`
}

async function render(
  pathName: string,
  fixture: string,
): Promise<{ extension: string; text: string }> {
  try {
    const text = await PATHS[pathName](fixture)
    return { extension: '.json', text: text.replace(/\r\n/g, '\n') }
  } catch (err) {
    if (err instanceof GoldenHarnessError) throw err
    return { extension: '.error.txt', text: describeError(err) }
  }
}

function firstDifference(expected: string, actual: string): string {
  const expectedLines = expected.split('\n')
  const actualLines = actual.split('\n')
  const count = Math.max(expectedLines.length, actualLines.length)
  for (let index = 0; index < count; index += 1) {
    const exp = expectedLines[index] ?? '<fin du fichier>'
    const act = actualLines[index] ?? '<fin du fichier>'
    if (exp !== act) {
      return `ligne ${index + 1}\n  attendu : ${JSON.stringify(exp)}\n  obtenu  : ${JSON.stringify(act)}`
    }
  }
  return 'aucune ligne ne diffère'
}

/**
 * Compare `actual` à `<expectedDir>/<chemin>/<fixture><extension>` ; renvoie un
 * message d'écart, ou `null`. En mode mise à jour, réécrit l'attendu et retire
 * l'autre forme (`.json` ou `.error.txt`).
 */
function compareWithGolden(
  expectedDir: string,
  pathName: string,
  fixture: string,
  extension: string,
  actual: string,
  update = false,
): string | null {
  const targetDir = join(expectedDir, pathName)
  const expectedPath = join(targetDir, `${fixture}${extension}`)
  const otherExtension = extension === '.json' ? '.error.txt' : '.json'
  const otherPath = join(targetDir, `${fixture}${otherExtension}`)

  if (update) {
    mkdirSync(targetDir, { recursive: true })
    writeFileSync(expectedPath, actual, 'utf-8')
    if (existsSync(otherPath)) unlinkSync(otherPath)
    return null
  }

  const label = `golden ${fixture} / ${pathName}`
  if (!existsSync(expectedPath)) {
    if (existsSync(otherPath)) {
      return `${label} : la sortie est un ${extension} alors que l'attendu est ${fixture}${otherExtension}`
    }
    return `${label} : attendu absent (${fixture}${extension}) — lancer avec UPDATE_GOLDEN=1`
  }
  const expected = readFileSync(expectedPath, 'utf-8')
  if (expected === actual) return null
  return `${label} (${fixture}${extension}) : ${firstDifference(expected, actual)}`
}

describe('p0 — golden export Unity (chemins front)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useGraphStore.getState().resetGraph()
    useAuthStore.setState(INITIAL_AUTH_STATE, true)
    vi.mocked(graphAPI.validateSchema).mockResolvedValue({
      is_valid: true,
      errors: [],
      error_count: 0,
      warnings: [],
      structured_errors: [],
    } as never)
  })

  it('trouve les fixtures d’entrée', () => {
    expect(FIXTURES.length).toBeGreaterThan(0)
  })

  for (const pathName of Object.keys(PATHS).sort()) {
    it.each(FIXTURES)(`%s / ${pathName}`, async (fixture) => {
      const { extension, text } = await render(pathName, fixture)
      expect(compareWithGolden(EXPECTED_DIR, pathName, fixture, extension, text, UPDATE)).toBeNull()
    })
  }

  describe('document portant une fiche de scène : sorties identiques', () => {
    afterEach(() => {
      injectedScene = null
    })

    for (const pathName of Object.keys(PATHS).sort()) {
      it.each(DOCUMENT_FIXTURES)(`%s / ${pathName} sans scene`, async (fixture) => {
        injectedScene = { brief: 'Jamais exporté', npcs: [{ name: 'X', entryId: null }] }

        const { extension, text } = await render(pathName, fixture)

        expect(useGraphStore.getState().scene?.brief).toBe('Jamais exporté')
        expect(text).not.toContain('Jamais exporté')
        expect(compareWithGolden(EXPECTED_DIR, pathName, fixture, extension, text)).toBeNull()
      })
    }
  })

  it('fait échouer un export invité bloqué par la validation au lieu de le figer', async () => {
    vi.mocked(graphAPI.validateSchema).mockResolvedValue({
      is_valid: false,
      errors: ['refusé'],
      error_count: 1,
      warnings: [],
      structured_errors: [],
    } as never)

    await expect(render('front-invite', FIXTURES[0])).rejects.toBeInstanceOf(GoldenHarnessError)
  })
})

describe('compareWithGolden', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'golden-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('nomme la fixture, le chemin et la première ligne qui diffère', () => {
    mkdirSync(join(dir, 'front-canonique'))
    writeFileSync(join(dir, 'front-canonique', 'demo.json'), '{\n  "a": 1\n}', 'utf-8')

    const message = compareWithGolden(dir, 'front-canonique', 'demo', '.json', '{\n  "a": 2\n}')

    expect(message).toContain('demo / front-canonique')
    expect(message).toContain('ligne 2')
  })

  it('échoue sans attendu et n’écrit rien hors du mode mise à jour', () => {
    const message = compareWithGolden(dir, 'front-invite', 'neuf', '.json', '{}')

    expect(message).toContain('UPDATE_GOLDEN=1')
    expect(existsSync(join(dir, 'front-invite'))).toBe(false)
  })

  it('en mise à jour, réécrit l’attendu et retire l’autre forme', () => {
    mkdirSync(join(dir, 'front-payload'))
    writeFileSync(join(dir, 'front-payload', 'demo.error.txt'), 'Error: ancien\n', 'utf-8')

    expect(compareWithGolden(dir, 'front-payload', 'demo', '.json', '{}', true)).toBeNull()

    expect(readFileSync(join(dir, 'front-payload', 'demo.json'), 'utf-8')).toBe('{}')
    expect(existsSync(join(dir, 'front-payload', 'demo.error.txt'))).toBe(false)
    expect(compareWithGolden(dir, 'front-payload', 'demo', '.json', '{}')).toBeNull()
  })

  it('signale une sortie .json quand l’attendu est un .error.txt', () => {
    mkdirSync(join(dir, 'front-canonique'))
    writeFileSync(join(dir, 'front-canonique', 'demo.error.txt'), 'Error: refus\n', 'utf-8')

    const message = compareWithGolden(dir, 'front-canonique', 'demo', '.json', '{}')

    expect(message).toContain('demo / front-canonique')
    expect(message).toContain('demo.error.txt')
  })

  it('décrit un rejet circulaire ou indéfini sans lever', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(describeError(circular)).toBe('object: [object Object]\n')
    expect(describeError(undefined)).toBe('undefined: undefined\n')
  })

  it('décrit un rejet qui n’est pas une Error par son JSON', () => {
    expect(describeError({ response: { status: 404 } })).toBe(
      'object: {"response":{"status":404}}\n',
    )
  })
})
