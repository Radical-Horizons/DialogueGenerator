/**
 * ADR-008 perf (Story 16.6 AC5) : p95 load document + projection + affichage.
 * Optionnel en CI (peut être exclu si flaky). Seuils : docs/architecture/adr-008-perf-targets.md
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import type { Browser, Locator, Page } from '@playwright/test'
import { uniqueE2EDocumentId, seedDocumentWithRetry, matchDocumentJsonGetResponse } from './helpers'
import { E2E_MS, E2E_TEST_TIMEOUT_MS } from './timeouts'

const COMFORT_LOAD_MS = 3000 // p95 load < 3s pour cible confort (N < 500)
const API_BASE = 'http://127.0.0.1:4243'
const FIXTURE_PREFIX = 'e2e-perf'
const FIXTURE_DOC = {
  schemaVersion: '1.1.0',
  nodes: [
    { id: 'START', speaker: 'Perf', line: 'Start', nextNode: 'N1', choices: [] },
    { id: 'N1', speaker: 'Perf', line: 'Middle', nextNode: 'END', choices: [] },
    { id: 'END', speaker: 'Perf', line: 'End', nextNode: null, choices: [] },
  ],
}

test.describe('ADR-008 Perf (Story 16.6)', () => {
  test.setTimeout(E2E_TEST_TIMEOUT_MS.cost)

  test.afterEach(async ({ request }, testInfo) => {
    const fixtureId = uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo)
    const res = await request.delete(`${API_BASE}/api/v1/documents/${encodeURIComponent(fixtureId)}`)
    if (!res.ok() && res.status() !== 404) {
      const text = await res.text().catch(() => '')
      throw new Error(`Cleanup DELETE failed ${res.status()}: ${text}`)
    }
  })

  test('p95 load: document confort (petit graphe) sous seuil raisonnable', async ({
    page,
    request,
  }, testInfo) => {
    const fixtureId = uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo)

    await page.goto('/')
    const onLogin = await page
      .getByRole('heading', { name: /connexion/i })
      .isVisible({ timeout: E2E_MS.control })
      .catch(() => false)
    if (onLogin) {
      await page.getByLabel(/nom d'utilisateur/i).fill('admin')
      await page.getByLabel(/mot de passe/i).fill('admin123')
      await page.getByRole('button', { name: /se connecter/i }).click()
      await expect(page).toHaveURL(/\//, { timeout: E2E_MS.ui })
    }

    await seedDocumentWithRetry(request, API_BASE, fixtureId, FIXTURE_DOC)

    const start = Date.now()
    await Promise.all([
      page.waitForResponse((r) => matchDocumentJsonGetResponse(fixtureId, r), { timeout: E2E_MS.documentLoad }),
      page.goto(`/graph-editor/${encodeURIComponent(fixtureId)}`, { waitUntil: 'domcontentloaded' }),
    ])
    await expect(page.getByText(/Chargement du graphe/i)).toBeHidden({ timeout: E2E_MS.graphLoad })
    await expect(page.locator('[data-testid="graph-node-content"]').first()).toBeVisible({ timeout: E2E_MS.graphLoad })
    const loadMs = Date.now() - start

    if (process.env.PERF_STRICT === '1') {
      expect(loadMs).toBeLessThan(COMFORT_LOAD_MS)
    }
    expect(loadMs).toBeLessThan(E2E_MS.perfMaxLoad)
  })
})

/**
 * Story 20.2 : graphe de 500 répliques. Lancé par `playwright.perf.config.ts` seulement.
 * Seuils : `epic-20.md` « Seuils de mesure ». Protocole robuste à la charge du poste :
 * passages alternés avant / après (`PERF_BEFORE_DIST` = build de référence), `PERF_PASSES`
 * passages de chaque, charge consignée, témoin de 2 répliques joué avec le même geste, travail
 * du fil principal lu dans la trace. Le résumé retient la médiane des p95 par passage.
 * `PERF_VARIANTS` choisit les variantes, `PERF_STEPS` les étapes.
 */
const PERF_500 = {
  loadMs: 3000,
  keyMs: 100,
  dragMs: 200,
  /** « p95 des images ≤ 16 ms » = aucune image sautée à 60 Hz, gigue 0,5 ms comprise. */
  frameMs: 16.7 + 0.5,
  longTaskMs: 50,
}
const REPS = Number(process.env.PERF_REPS ?? 20)
const PASSES = Number(process.env.PERF_PASSES ?? 5)
if (!Number.isInteger(PASSES) || PASSES < 1) {
  throw new Error(`PERF_PASSES doit être un entier positif, reçu « ${process.env.PERF_PASSES} »`)
}
const OUT_DIR = path.join('tmp', 'perf-20-2')
const RUN_DIR = path.join(OUT_DIR, `run-${process.env.PERF_RUN_ID ?? 'local'}`)
const TRACE_CATEGORIES = [
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'toplevel',
  'blink.user_timing',
]
/** `PERF_STEPS=load,zoom,typing,drag` : ne mesurer que certaines étapes. */
const STEPS = process.env.PERF_STEPS?.split(',')
const wants = (step: string) => STEPS == null || STEPS.includes(step)

interface Variant {
  name: string
  textCards: boolean
  testBars: boolean
  judged: boolean
}

const VARIANTS: Variant[] = [
  { name: 'cards', textCards: true, testBars: false, judged: true },
  { name: 'cards-testbars', textCards: true, testBars: true, judged: false },
  { name: 'baseline', textCards: false, testBars: false, judged: false },
]

const CARD = '[data-testid="graph-node-content"][data-node-type="dialogue"]'

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const at = (p: number) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]
  const round = (v: number | undefined) => (v === undefined ? null : Math.round(v * 10) / 10)
  return {
    n: sorted.length,
    median: round(at(0.5)),
    p95: round(at(0.95)),
    max: round(sorted[sorted.length - 1]),
  }
}

async function currentZoom(page: Page): Promise<number> {
  return page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>('.react-flow__viewport')
    const match = /scale\(([\d.]+)\)/.exec(viewport?.style.transform ?? '')
    return match ? Number(match[1]) : 1
  })
}

/** Molette sous le pointeur courant jusqu'au zoom visé (d3 : facteur 2^(-deltaY × 0,002)). */
async function wheelToZoom(page: Page, target: number): Promise<void> {
  for (let step = 0; step < 40; step++) {
    const zoom = await currentZoom(page)
    if (Math.abs(zoom / target - 1) < 0.005) break
    const deltaY = -Math.log2(target / zoom) / 0.002
    await page.mouse.wheel(0, Math.max(-300, Math.min(300, deltaY)))
    await page.waitForTimeout(40)
  }
  await page.waitForTimeout(800)
  const drift = Math.abs((await currentZoom(page)) / target - 1)
  expect(drift, `zoom ${target} atteint`).toBeLessThan(0.01)
}

/** Ouvre le document et rend les durées jusqu'à l'affichage stable. */
async function openAndTime(page: Page, documentId: string, variant: Variant) {
  await page.goto(`/graph-editor/${encodeURIComponent(documentId)}`, {
    waitUntil: 'commit',
  })
  await page.waitForFunction(() => document.readyState !== 'loading')
  return page.evaluate(
    ({ id, card, textCards }) =>
      new Promise<{ fromGetMs: number; fromNavigationMs: number }>((resolve, reject) => {
        const deadline = performance.now() + 90_000
        const check = () => {
          const viewport = document.querySelector<HTMLElement>('.react-flow__viewport')
          const match = /scale\(([\d.]+)\)/.exec(viewport?.style.transform ?? '')
          const node = document.querySelector<HTMLElement>(card)
          // Fini : cartes à l'écran, vue ajustée et, en prototype, palier posé.
          const done =
            node != null &&
            match != null &&
            Number(match[1]) < 0.99 &&
            (!textCards || node.dataset.tier === 'situate')
          if (done) {
            requestAnimationFrame(() =>
              setTimeout(() => {
                const end = performance.now()
                const get = performance
                  .getEntriesByType('resource')
                  .find((entry) => entry.name.endsWith(`/api/v1/documents/${id}`))
                if (!get) reject(new Error('GET document introuvable'))
                else resolve({ fromGetMs: end - get.startTime, fromNavigationMs: end })
              }, 0)
            )
          } else if (performance.now() > deadline) {
            // L'état au moment de l'abandon, pour dire ce qui manquait.
            reject(
              new Error(
                `Graphe non affiché en 90 s (zoom ${match?.[1]}, carte ${node != null}, ` +
                  `palier ${node?.dataset.tier}, page « ${document.body.innerText.slice(0, 300)} »)`
              )
            )
          } else requestAnimationFrame(check)
        }
        check()
      }),
    { id: encodeURIComponent(documentId), card: CARD, textCards: variant.textCards }
  )
}

/** Carte entièrement visible la plus proche du centre du canvas. */
async function centralCard(page: Page) {
  const found = await page.evaluate((selector) => {
    const pane = document.querySelector('.react-flow')!.getBoundingClientRect()
    const cx = pane.left + pane.width / 2
    const cy = pane.top + pane.height / 2
    let best: { id: string; x: number; y: number; width: number; d: number } | null = null
    for (const card of document.querySelectorAll(selector)) {
      const r = card.getBoundingClientRect()
      if (r.top < pane.top || r.left < pane.left || r.top > pane.bottom - 60) continue
      const d = Math.hypot(r.left - cx, r.top - cy)
      const id = card.closest('.react-flow__node')!.getAttribute('data-id')!
      if (!best || d < best.d) best = { id, x: r.left, y: r.top, width: r.width, d }
    }
    return best
  }, CARD)
  if (!found) throw new Error('Aucune carte visible')
  return found
}

/** Zoome à 100 % en gardant une carte du milieu du graphe sous les yeux. */
async function zoomToWorkingView(page: Page) {
  const card = await centralCard(page)
  await page.mouse.move(card.x - 4, card.y + 4)
  await wheelToZoom(page, 1)
  return page.locator(`.react-flow__node[data-id="${card.id}"] ${CARD}`)
}

async function installLatencyProbe(page: Page, startEvent: string, endEvent: string) {
  await page.evaluate(
    ({ startEvent, endEvent }) => {
      const store = window as unknown as {
        __latencies: number[]
        __fromEnd: number[]
        __longTasks: number[]
      }
      store.__latencies = []
      store.__fromEnd = []
      store.__longTasks = []
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) store.__longTasks.push(entry.duration)
      }).observe({ type: 'longtask' })
      let start: number | null = null
      window.addEventListener(startEvent, (e) => (start = e.timeStamp), true)
      window.addEventListener(
        endEvent,
        (event) => {
          // `é` est inséré sans touche enfoncée : le mesurer depuis la précédente le fausserait.
          if (start === null) return
          const from = start
          start = null
          const ended = event.timeStamp
          requestAnimationFrame(() =>
            setTimeout(() => {
              store.__latencies.push(performance.now() - from)
              store.__fromEnd.push(performance.now() - ended)
            }, 0)
          )
        },
        true
      )
    },
    { startEvent, endEvent }
  )
}

async function readProbe(page: Page) {
  return page.evaluate(() => {
    const store = window as unknown as {
      __latencies: number[]
      __fromEnd: number[]
      __longTasks: number[]
    }
    return {
      latencies: [...store.__latencies],
      fromEnd: [...store.__fromEnd],
      longTasks: [...store.__longTasks],
    }
  })
}

/** Un zoom continu 100 % → 20 % : images et tâches longues pendant le geste puis à la pose. */
async function zoomOutGesture(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>
    const frames: Array<{ at: number; delta: number; tier: string }> = []
    const tasks: Array<{ start: number; duration: number }> = []
    const observer = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) tasks.push({ start: e.startTime, duration: e.duration })
    })
    observer.observe({ type: 'longtask' })
    let last = 0
    let on = true
    const loop = (at: number) => {
      const tier = document.querySelector<HTMLElement>('[data-card="text"]')?.dataset.tier ?? ''
      if (last) frames.push({ at, delta: at - last, tier })
      last = at
      if (on) requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
    w.__zoom = { frames, tasks, stop: () => ((on = false), observer.disconnect()) }
  })
  await page.waitForTimeout(200)
  const start = await page.evaluate(() => performance.now())
  const totalDeltaY = Math.log2(5) / 0.002
  const steps = 40
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, totalDeltaY / steps)
    await page.waitForTimeout(16)
  }
  const end = await page.evaluate(
    () => new Promise<number>((r) => requestAnimationFrame(() => r(performance.now())))
  )
  await page.waitForTimeout(1200)
  return page.evaluate(
    ({ start, end }) => {
      const data = (
        window as unknown as {
          __zoom: {
            frames: Array<{ at: number; delta: number; tier: string }>
            tasks: Array<{ start: number; duration: number }>
            stop: () => void
          }
        }
      ).__zoom
      data.stop()
      const during = data.frames.filter((f) => f.at > start && f.at <= end)
      return {
        gestureMs: end - start,
        frames: during.map((f) => f.delta),
        tiersDuringGesture: [...new Set(during.map((f) => f.tier))],
        longTasks: data.tasks
          .filter((t) => t.start >= start && t.start < end)
          .map((t) => t.duration),
        settleFrames: data.frames.filter((f) => f.at > end).map((f) => f.delta),
        settleLongTasks: data.tasks.filter((t) => t.start >= end).map((t) => t.duration),
      }
    },
    { start, end }
  )
}

async function dragCard(page: Page, card: Locator, direction: number): Promise<void> {
  const box = (await card.boundingBox())!
  const zoom = await currentZoom(page)
  const x = box.x + box.width / 2
  const y = box.y + Math.max(3, 12 * zoom)
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(x + direction * i * 6, y + direction * i * 3)
  await page.mouse.up()
  await page.waitForTimeout(350)
  await expect.poll(async () => (await card.boundingBox())?.x, 'carte déplacée').not.toBe(box.x)
}

async function measureDrags(page: Page, card: Locator) {
  await installLatencyProbe(page, 'mousedown', 'mouseup')
  for (let i = 0; i < REPS; i++) await dragCard(page, card, i % 2 === 0 ? 1 : -1)
  await page.waitForTimeout(1000)
  const probe = await readProbe(page)
  return {
    /** Mesure jugée (ADR-008) : de l'enfoncement au lâcher peint, dix déplacements compris. */
    latency: stats(probe.latencies),
    /** Information : du seul lâcher à l'image qui suit, hors durée du geste scripté. */
    releaseToPaint: stats(probe.fromEnd),
    longestTaskMs: Math.max(0, ...probe.longTasks),
  }
}

/** Cœurs occupés (page au repos : le fait d'autres processus) et charge du GPU. */
async function machineLoad(page: Page) {
  const sample = () =>
    os.cpus().reduce(
      (sum, cpu) => {
        const total = Object.values(cpu.times).reduce((a, b) => a + b, 0)
        return { total: sum.total + total, idle: sum.idle + cpu.times.idle }
      },
      { total: 0, idle: 0 }
    )
  const before = sample()
  await page.waitForTimeout(2000)
  const after = sample()
  const busy = 1 - (after.idle - before.idle) / (after.total - before.total)
  let gpuPercent: number | null = null
  try {
    gpuPercent = Number(
      execFileSync('nvidia-smi', ['--query-gpu=utilization.gpu', '--format=csv,noheader,nounits'])
        .toString()
        .split('\n')[0]
    )
  } catch {
    // Pas de GPU NVIDIA : la charge GPU n'est pas consignée.
  }
  return { busyCores: Math.round(busy * os.cpus().length * 10) / 10, gpuPercent }
}

interface TraceEvent {
  name: string
  cat: string
  ph: string
  pid: number
  tid: number
  ts: number
  dur?: number
  args?: { data?: { type?: string } }
}

/**
 * Travail du fil principal de la page pendant `action`, lu dans la trace : total, et part
 * tombant entre `mousedown` et `mouseup` (le glisser lui-même, sans l'enregistrement qui suit).
 */
async function mainThreadWork(
  browser: Browser,
  page: Page,
  name: string,
  action: () => Promise<void>
) {
  const file = path.join(RUN_DIR, `trace-${name}.json`)
  await browser.startTracing(page, { path: file, categories: TRACE_CATEGORIES })
  await page.evaluate(() => performance.mark('perf-start'))
  await action()
  await page.evaluate(() => performance.mark('perf-end'))
  await browser.stopTracing()
  const events = (JSON.parse(fs.readFileSync(file, 'utf-8')) as { traceEvents: TraceEvent[] })
    .traceEvents
  const mark = (markName: string) =>
    events.find((e) => e.name === markName && e.cat.includes('blink.user_timing'))!
  const start = mark('perf-start')
  const end = mark('perf-end')
  const main = events.filter(
    (e) => e.pid === start.pid && e.tid === start.tid && e.ts >= start.ts && e.ts <= end.ts
  )
  const tasks = main.filter((e) => e.name === 'RunTask' && e.ph === 'X')
  const inputs = (type: string) =>
    main.filter((e) => e.name === 'EventDispatch' && e.args?.data?.type === type)
  const ups = inputs('mouseup')
  const gestures = inputs('mousedown').map((down) => [
    down.ts,
    ups.find((up) => up.ts > down.ts)?.ts ?? down.ts,
  ])
  const sum = (list: TraceEvent[]) => list.reduce((total, e) => total + (e.dur ?? 0), 0) / 1000
  return {
    totalMs: sum(tasks),
    inGestureMs: sum(tasks.filter((t) => gestures.some(([a, b]) => t.ts >= a && t.ts <= b))),
    longestTaskMs: Math.max(0, ...tasks.map((t) => (t.dur ?? 0) / 1000)),
  }
}

const round1 = (value: number) => Math.round(value * 10) / 10

/** Cadence au repos du navigateur, sur la page mesurée. */
async function idleCadence(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const values: number[] = []
        let last = 0
        const loop = (at: number) => {
          if (last) values.push(at - last)
          last = at
          if (values.length < 120) requestAnimationFrame(loop)
          else resolve(values.sort((a, b) => a - b)[60])
        }
        requestAnimationFrame(loop)
      })
  )
}

/** Témoin : les deux premières répliques du graphe, reliées, sans test. */
function witnessDocument(fixture: Record<string, unknown>): Record<string, unknown> {
  type Node = { id: string; choices?: Array<Record<string, unknown>> }
  const [first, second] = fixture.nodes as Node[]
  const choices = (first.choices ?? []).map((choice, index) => {
    const kept = Object.fromEntries(
      Object.entries(choice).filter(([key]) => !key.startsWith('test') && key !== 'targetNode')
    )
    return index === 0 ? { ...kept, targetNode: second.id } : kept
  })
  return {
    ...fixture,
    nodes: [
      { ...first, choices },
      { ...second, choices: [] },
    ],
  }
}

async function openWitness(page: Page, documentId: string) {
  await page.goto('about:blank')
  await page.goto(`/graph-editor/${encodeURIComponent(documentId)}`)
  await expect(page.locator(CARD).first()).toBeVisible({ timeout: E2E_MS.graphLoad })
  await page.waitForTimeout(1500)
}

/** Met le curseur dans le texte d'une carte (prototype) ou dans l'inspecteur (graphe actuel). */
async function startTyping(page: Page, card: Locator, textCards: boolean): Promise<Locator> {
  const field = textCards
    ? card.getByTestId('text-card-editor')
    : page.getByTestId('graph-inspector').locator('textarea[name="line"]')
  if (textCards) {
    await card.getByTestId('text-card-line').click({ position: { x: 20, y: 10 } })
    await expect(field).toBeFocused()
  } else {
    await card.click({ position: { x: 100, y: 12 } })
    await page
      .getByTestId('graph-inspector-node-summary')
      .getByRole('button', { name: 'éditer' })
      .first()
      .click()
    await field.click()
  }
  await page.waitForTimeout(500)
  return field
}

const TYPED = 'Une suite tapée au clavier pour la mesure. '

async function measureTyping(page: Page, field: Locator) {
  const valueBefore = await field.inputValue()
  await installLatencyProbe(page, 'keydown', 'input')
  await page.keyboard.type(TYPED.slice(0, Math.max(REPS * 2, 20)), { delay: 90 })
  await page.waitForTimeout(1000)
  const typing = await readProbe(page)
  await expect(field, 'la frappe a changé le champ').not.toHaveValue(valueBefore)
  return {
    latency: stats(typing.latencies),
    longestTaskMs: Math.round(Math.max(0, ...typing.longTasks)),
  }
}

const TRACED_DRAGS = 6

/** Travail du fil principal de quelques glissers : par image du geste, et au total. */
async function dragWork(browser: Browser, page: Page, card: Locator, name: string) {
  const work = await mainThreadWork(browser, page, name, async () => {
    for (let i = 0; i < TRACED_DRAGS; i++) await dragCard(page, card, i % 2 === 0 ? 1 : -1)
    await page.waitForTimeout(1500)
  })
  return {
    /** Un glisser compte dix déplacements, donc dix images. */
    perFrameMs: round1(work.inGestureMs / TRACED_DRAGS / 10),
    totalPerDragMs: round1(work.totalMs / TRACED_DRAGS),
    longestTaskMs: Math.round(work.longestTaskMs),
  }
}

/** Travail du fil principal par frappe, enregistrement automatique compris. */
async function typingWork(browser: Browser, page: Page, name: string) {
  const keys = 'abcdefghij klmnopqrs'
  const work = await mainThreadWork(browser, page, name, async () => {
    await page.keyboard.type(keys, { delay: 90 })
    await page.waitForTimeout(2500)
  })
  return {
    perKeyMs: round1(work.totalMs / keys.length),
    longestTaskMs: Math.round(work.longestTaskMs),
  }
}

type Build = 'avant' | 'apres'
const BUILD_URL: Record<Build, string | undefined> = {
  apres: undefined,
  avant: 'http://localhost:4174',
}

test.describe('Perf graphe 500 répliques (Story 20.2)', () => {
  test.skip(!process.env.PERF_HARNESS, 'Mesure locale : npm run test:perf:graph')
  test.setTimeout(45 * 60_000)

  const selected = process.env.PERF_VARIANTS?.split(',')

  const runs: Array<{ variant: Variant; build: Build; pass: number }> = []
  const judgedVariant = VARIANTS[0]
  const builds: Build[] = process.env.PERF_BEFORE_DIST ? ['avant', 'apres'] : ['apres']
  for (let pass = 1; pass <= PASSES; pass++) {
    // Ordre inversé un passage sur deux : une charge qui monte ne pèse pas toujours du même côté.
    for (const build of pass % 2 === 1 ? builds : [...builds].reverse()) {
      runs.push({ variant: judgedVariant, build, pass })
    }
  }
  for (const variant of VARIANTS.slice(1)) runs.push({ variant, build: 'apres', pass: 1 })

  for (const { variant, build, pass } of runs) {
    test.describe(`${variant.name}, ${build}, passage ${pass}`, () => {
      if (BUILD_URL[build]) test.use({ baseURL: BUILD_URL[build] })

    test(`500 répliques — ${variant.name} ${build} ${pass}`, async ({ page, request, browser }, testInfo) => {
      test.skip(selected != null && !selected.includes(variant.name), 'Variante non demandée')
      const documentId = `e2e-perf500-${variant.name}`
      const witnessId = `e2e-perf2-${variant.name}`
      const runName = `${variant.name}-${build}-${pass}`
      const fixture = JSON.parse(
        fs.readFileSync(path.join('e2e', 'fixtures', 'perf-graph-500.json'), 'utf-8')
      ) as Record<string, unknown>
      const documentUrl = `${API_BASE}/api/v1/documents/${documentId}`
      const target = process.env.PERF_TARGET === 'dev' ? 'dev' : 'prod'
      fs.mkdirSync(RUN_DIR, { recursive: true })

      await page.addInitScript(
        ({ textCards, testBars }) => {
          // Le serveur de développement charge des centaines de modules : sans cette marge,
          // l'entrée du GET document sort du tampon des mesures de ressources.
          performance.setResourceTimingBufferSize(10_000)
          if (textCards) localStorage.setItem('ui.textCardsPrototype', '1')
          if (testBars) localStorage.setItem('ui.textCardsTestBars', '1')
        },
        { textCards: variant.textCards, testBars: variant.testBars }
      )
      // Identifiants de test du seed local : un invité ne pourrait ni écrire ni enregistrer.
      await page.goto('/login')
      await page.getByLabel(/nom d'utilisateur/i).fill('admin')
      await page.getByLabel(/mot de passe/i).fill('admin123')
      await page.getByRole('button', { name: /se connecter/i }).click()
      await expect(page).not.toHaveURL(/login/, { timeout: E2E_MS.authRedirect })

      // Le rendu doit passer par le GPU : un rendu logiciel fausserait toutes les mesures.
      const cdp = await browser.newBrowserCDPSession()
      const { gpu } = (await cdp.send('SystemInfo.getInfo')) as unknown as {
        gpu: { featureStatus?: Record<string, string> }
      }
      await cdp.detach()
      const gpuCompositing = gpu.featureStatus?.gpu_compositing ?? 'inconnu'
      const environment = await page.evaluate(async () => {
        const gl = document.createElement('canvas').getContext('webgl')
        const info = gl?.getExtension('WEBGL_debug_renderer_info')
        const intervals = await new Promise<number[]>((resolve) => {
          const values: number[] = []
          let last = 0
          const loop = (at: number) => {
            if (last) values.push(at - last)
            last = at
            if (values.length < 60) requestAnimationFrame(loop)
            else resolve(values)
          }
          requestAnimationFrame(loop)
        })
        return {
          gpu: info ? String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'inconnu',
          idleFrameMs: intervals.sort((a, b) => a - b)[30],
        }
      })
      console.log(`WebGL : ${environment.gpu} — composition : ${gpuCompositing}`)
      expect(environment.gpu, 'rendu WebGL matériel').toMatch(/NVIDIA|AMD|Radeon|Intel|Apple/)
      expect(environment.gpu, 'pas de rendu logiciel').not.toMatch(/SwiftShader|llvmpipe|Basic Render/i)
      expect(gpuCompositing, 'composition sur le GPU').toMatch(/^enabled/)
      const results: Record<string, unknown> = {
        gpuCompositing,
        headless: testInfo.project.use.headless ?? true,
        variant: variant.name,
        target,
        repetitions: REPS,
        browser: `${testInfo.project.use.channel} ${browser.version()}`,
        machine: `${os.cpus()[0].model.trim()}, ${Math.round(os.totalmem() / 2 ** 30)} Go, ${os.release()}`,
        ...environment,
      }
      Object.assign(results, { build, pass })
      const outFile = path.join(RUN_DIR, `${runName}-${target}.json`)
      const save = () => fs.writeFileSync(outFile, JSON.stringify(results, null, 2))
      const loads: Record<string, unknown> = {}
      results.load = loads

      const reseed = async () => {
        await request.delete(documentUrl)
        await seedDocumentWithRetry(request, API_BASE, documentId, fixture)
      }

      try {
        loads.start = await machineLoad(page)
        if (!wants('load')) {
          // Sans l'étape de chargement : un document neuf, ouvert une fois pour le disposer.
          await reseed()
          await openAndTime(page, documentId, variant)
          await page.waitForTimeout(2000)
        }
        if (wants('load')) {
          // Premières ouvertures : aucun layout enregistré, la disposition est calculée.
          const first: number[] = []
          const firstNavigation: number[] = []
          for (let i = 0; i < REPS; i++) {
            await page.goto('about:blank')
            await reseed()
            const layoutSaved = variant.textCards
              ? page.waitForResponse(
                  (r) => r.request().method() === 'PUT' && r.url().endsWith('/layout'),
                  { timeout: 120_000 }
                )
              : null
            const timing = await openAndTime(page, documentId, variant)
            first.push(timing.fromGetMs)
            firstNavigation.push(timing.fromNavigationMs)
            await layoutSaved
          }
          results.firstOpen = { fromGet: stats(first), fromNavigation: stats(firstNavigation) }
          save()

          // Ouvertures suivantes : positions enregistrées. Le graphe actuel ne les écrit qu'au
          // premier changement : un glisser les pose.
          if (!variant.textCards) {
            const saved = page.waitForResponse(
              (r) => r.request().method() === 'PUT' && r.url().endsWith('/layout'),
              { timeout: 120_000 }
            )
            await dragCard(page, await zoomToWorkingView(page), 1)
            await saved
          }
          await page.waitForTimeout(1500)
          const next: number[] = []
          const nextNavigation: number[] = []
          let layoutWritesOnReopen = 0
          const countWrites = (r: { method(): string; url(): string }) => {
            if (r.method() === 'PUT' && r.url().endsWith('/layout')) layoutWritesOnReopen++
          }
          page.on('request', countWrites)
          for (let i = 0; i < REPS; i++) {
            await page.goto('about:blank')
            const timing = await openAndTime(page, documentId, variant)
            next.push(timing.fromGetMs)
            nextNavigation.push(timing.fromNavigationMs)
            await page.waitForTimeout(300)
          }
          page.off('request', countWrites)
          results.nextOpen = {
            fromGet: stats(next),
            fromNavigation: stats(nextNavigation),
            layoutWritesOnReopen,
          }
          save()
        }
        if (wants('zoom')) {
          // Zoom continu 100 % → 20 %.
          await page.goto('about:blank')
          await openAndTime(page, documentId, variant)
          await page.waitForTimeout(2000)
          await zoomToWorkingView(page)
          loads.zoom = await machineLoad(page)
          const zoomIdleFrameMs = await idleCadence(page)
          const frames: number[] = []
          const settleFrames: number[] = []
          const longTasks: number[] = []
          const settleLongTasks: number[] = []
          const tiers = new Set<string>()
          const perRepetitionP95: number[] = []
          const zoomRange: string[] = []
          let cardsAtEnd = 0
          for (let i = 0; i < REPS; i++) {
            const from = await currentZoom(page)
            const gesture = await zoomOutGesture(page)
            const reached = await currentZoom(page)
            expect(reached, 'zoom arrivé à 20 %').toBeCloseTo(0.2, 2)
            zoomRange.push(`${from.toFixed(2)}→${reached.toFixed(2)}`)
            cardsAtEnd = await page.locator(CARD).count()
            frames.push(...gesture.frames)
            settleFrames.push(...gesture.settleFrames)
            longTasks.push(...gesture.longTasks)
            settleLongTasks.push(...gesture.settleLongTasks)
            gesture.tiersDuringGesture.forEach((t) => tiers.add(t))
            perRepetitionP95.push(stats(gesture.frames).p95!)
            await wheelToZoom(page, 1)
          }
          results.zoom = {
            idleFrameMs: zoomIdleFrameMs,
            frameMs: stats(frames),
            perRepetitionP95: stats(perRepetitionP95),
            framesOverThreshold: frames.filter((f) => f > PERF_500.frameMs).length,
            longTaskCount: longTasks.filter((t) => t > PERF_500.longTaskMs).length,
            longestTaskMs: Math.round(Math.max(0, ...longTasks)),
            tiersDuringGesture: [...tiers],
            zoomRange: [...new Set(zoomRange)],
            cardsInViewAt20: cardsAtEnd,
            settleFrameMs: stats(settleFrames),
            settleLongestTaskMs: Math.round(Math.max(0, ...settleLongTasks)),
          }
          let tracedFrames = 0
          const zoomWork = await mainThreadWork(browser, page, `zoom-${runName}`, async () => {
            tracedFrames = (await zoomOutGesture(page)).frames.length
          })
          // La fenêtre tracée contient la pose qui suit le geste, d'où une borne haute.
          results.zoomWork = { perFrameMs: round1(zoomWork.totalMs / Math.max(1, tracedFrames)) }
          await wheelToZoom(page, 1)
          save()
        }
        if (wants('typing')) {
          // Frappe : à la touche enfoncée jusqu'à l'image qui suit.
          await page.goto('about:blank')
          await openAndTime(page, documentId, variant)
          await page.waitForTimeout(1500)
          const card = await zoomToWorkingView(page)
          const field = await startTyping(page, card, variant.textCards)
          loads.typing = await machineLoad(page)
          results.typing = await measureTyping(page, field)
          results.typingWork = await typingWork(browser, page, `frappe-${runName}`)
          save()
        }
        if (wants('drag')) {
          // Glisser une carte, au palier de travail puis vue ajustée.
          await page.goto('about:blank')
          await openAndTime(page, documentId, variant)
          await page.waitForTimeout(1500)
          const working = await zoomToWorkingView(page)
          loads.drag = await machineLoad(page)
          results.dragAtZoom100 = await measureDrags(page, working)
          results.dragWorkAtZoom100 = await dragWork(browser, page, working, `glisser100-${runName}`)
          await page.goto('about:blank')
          await openAndTime(page, documentId, variant)
          await page.waitForTimeout(1500)
          const fitted = await centralCard(page)
          const fittedCard = page.locator(`.react-flow__node[data-id="${fitted.id}"] ${CARD}`)
          results.dragAtFit = await measureDrags(page, fittedCard)
          results.dragWorkAtFit = await dragWork(browser, page, fittedCard, `glisser-vue-${runName}`)
          save()
        }
        if (variant.textCards && (wants('typing') || wants('drag'))) {
          // Témoin : les mêmes gestes sur 2 répliques, le plancher de la mesure sur ce poste.
          await page.goto('about:blank')
          await request.delete(`${API_BASE}/api/v1/documents/${witnessId}`)
          await seedDocumentWithRetry(request, API_BASE, witnessId, witnessDocument(fixture))
          const witness: Record<string, unknown> = {}
          results.witness = witness
          if (wants('typing')) {
            await openWitness(page, witnessId)
            const card = await zoomToWorkingView(page)
            const field = await startTyping(page, card, true)
            witness.typing = await measureTyping(page, field)
            witness.typingWork = await typingWork(browser, page, `temoin-frappe-${runName}`)
          }
          if (wants('drag')) {
            await openWitness(page, witnessId)
            const card = await zoomToWorkingView(page)
            witness.drag = await measureDrags(page, card)
            witness.dragWork = await dragWork(browser, page, card, `temoin-glisser-${runName}`)
          }
          save()
        }
        loads.end = await machineLoad(page)
      } finally {
        save()
        await testInfo.attach('mesures', { body: JSON.stringify(results, null, 2) })
        console.log(JSON.stringify(results, null, 2))
        await page.goto('about:blank')
        await request.delete(documentUrl)
        await request.delete(`${API_BASE}/api/v1/documents/${witnessId}`)
      }

    })
    })
  }

  test('résumé des passages et verdicts', async ({ browserName }, testInfo) => {
    void browserName
    const target = process.env.PERF_TARGET === 'dev' ? 'dev' : 'prod'
    const judged = selected == null || selected.includes(judgedVariant.name)
    const summary = summarize(target, judged)
    fs.mkdirSync(RUN_DIR, { recursive: true })
    fs.writeFileSync(path.join(RUN_DIR, 'resume.json'), JSON.stringify(summary, null, 2))
    await testInfo.attach('resume', { body: JSON.stringify(summary, null, 2) })
    console.log(JSON.stringify(summary, null, 2))
    if (process.env.PERF_STRICT === '1' && target === 'prod') {
      for (const verdict of summary.verdicts) {
        expect
          .soft(
            verdict.verdict,
            `${verdict.label} : ${verdict.value} (seuil ${verdict.limit}, ${verdict.passes}/${PASSES} passages)`
          )
          .toBe('tenu')
      }
    }
  })
})

type PassResult = Record<string, unknown>

const read = (result: PassResult, dotted: string): number | undefined => {
  let value: unknown = result
  for (const key of dotted.split('.')) value = (value as Record<string, unknown> | undefined)?.[key]
  return typeof value === 'number' ? value : undefined
}

/** Médiane, minimum et maximum d'une valeur sur les passages. */
function across(results: PassResult[], pick: (r: PassResult) => number | undefined) {
  const values = results
    .map(pick)
    .filter((v): v is number => v !== undefined)
    .sort((a, b) => a - b)
  if (values.length === 0) return null
  const middle = values.length >> 1
  const median = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2
  return { passes: values.length, median: round1(median), min: values[0], max: values[values.length - 1] }
}

const SUMMARY_KEYS = [
  'firstOpen.fromGet.p95',
  'nextOpen.fromGet.p95',
  'typing.latency.p95',
  'typing.longestTaskMs',
  'typingWork.perKeyMs',
  'typingWork.longestTaskMs',
  'dragAtZoom100.latency.p95',
  'dragAtZoom100.releaseToPaint.p95',
  'dragWorkAtZoom100.perFrameMs',
  'dragWorkAtZoom100.totalPerDragMs',
  'dragAtFit.latency.p95',
  'dragAtFit.releaseToPaint.p95',
  'dragWorkAtFit.perFrameMs',
  'dragWorkAtFit.totalPerDragMs',
  'zoom.frameMs.p95',
  'zoom.idleFrameMs',
  'zoom.longestTaskMs',
  'zoomWork.perFrameMs',
  'witness.typing.latency.p95',
  'witness.typingWork.perKeyMs',
  'witness.drag.latency.p95',
  'witness.dragWork.perFrameMs',
  'load.start.busyCores',
  'load.start.gpuPercent',
  'load.zoom.busyCores',
  'load.typing.busyCores',
  'load.drag.busyCores',
  'load.drag.gpuPercent',
  'load.end.busyCores',
]

/** Écart entre le p95 des images et la limite du passage (cadence au repos comprise). */
function zoomExcess(result: PassResult): number | undefined {
  const p95 = read(result, 'zoom.frameMs.p95')
  const idle = read(result, 'zoom.idleFrameMs')
  if (p95 === undefined || idle === undefined) return undefined
  return round1(p95 - (Math.max(16.7, idle) + 0.5))
}

/** `judged` : la variante jugée fait partie du lancement (`PERF_VARIANTS`). */
function summarize(target: string, judged: boolean) {
  const files = fs.existsSync(RUN_DIR)
    ? fs.readdirSync(RUN_DIR).filter((f) => f.endsWith(`-${target}.json`) && !f.startsWith('trace-'))
    : []
  const all = files.map((f) => JSON.parse(fs.readFileSync(path.join(RUN_DIR, f), 'utf-8')) as PassResult)
  const groups: Record<string, PassResult[]> = {}
  for (const result of all) (groups[`${result.variant}-${result.build}`] ??= []).push(result)
  const table = Object.fromEntries(
    Object.entries(groups).map(([name, results]) => [
      name,
      {
        ...Object.fromEntries(SUMMARY_KEYS.map((key) => [key, across(results, (r) => read(r, key))])),
        'zoom.excessMs': across(results, zoomExcess),
      },
    ])
  )
  const results = groups['cards-apres'] ?? []
  type Criterion = [string, string, (r: PassResult) => number | undefined, number, string?]
  const criteria: Criterion[] = [
    ['load', 'p95 première ouverture (ms)', (r) => read(r, 'firstOpen.fromGet.p95'), PERF_500.loadMs],
    ['load', 'p95 ouverture suivante (ms)', (r) => read(r, 'nextOpen.fromGet.p95'), PERF_500.loadMs],
    ['typing', 'p95 frappe (ms)', (r) => read(r, 'typing.latency.p95'), PERF_500.keyMs, 'witness.typing.latency.p95'],
    ['drag', 'p95 glisser à 100 % (ms)', (r) => read(r, 'dragAtZoom100.latency.p95'), PERF_500.dragMs, 'witness.drag.latency.p95'],
    ['drag', 'p95 glisser, vue ajustée (ms)', (r) => read(r, 'dragAtFit.latency.p95'), PERF_500.dragMs, 'witness.drag.latency.p95'],
    ['zoom', 'images au zoom : excès sur la limite du passage (ms)', zoomExcess, 0],
    ['zoom', 'tâche la plus longue au zoom (ms)', (r) => read(r, 'zoom.longestTaskMs'), PERF_500.longTaskMs],
  ]
  const expected = criteria.filter(([step]) => judged && wants(step))
  const verdicts = expected.map(([, label, pick, limit, witnessKey]) => {
    const value = across(results, pick)
    const witness = witnessKey ? across(results, (r) => read(r, witnessKey)) : null
    // Asymétrie du protocole : tenu sous charge est tenu ; dépassé quand le témoin dépasse
    // déjà le seuil n'est pas jugeable. Sans tous les passages, rien n'est jugé.
    const verdict =
      !value || value.passes < PASSES
        ? 'non mesuré'
        : value.median <= limit
          ? 'tenu'
          : witness && witness.median > limit
            ? 'non jugeable'
            : 'dépassé'
    return {
      label,
      limit,
      passes: value?.passes ?? 0,
      value: value?.median ?? null,
      min: value?.min ?? null,
      max: value?.max ?? null,
      witness,
      verdict,
    }
  })
  return { runDir: RUN_DIR, passes: PASSES, repetitions: REPS, table, verdicts }
}
