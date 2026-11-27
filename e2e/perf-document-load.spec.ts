/**
 * ADR-008 perf (Story 16.6 AC5) : p95 load document + projection + affichage.
 * Optionnel en CI (peut être exclu si flaky). Seuils : docs/architecture/adr-008-perf-targets.md
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
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
 * Seuils : `epic-20.md` « Seuils de mesure ». `PERF_VARIANTS` choisit les variantes.
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
const OUT_DIR = path.join('tmp', 'perf-20-2')
/** `PERF_STEPS=load,zoom,typing,drag` : mesure par morceaux, cumulée dans le même fichier. */
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
          } else if (performance.now() > deadline) reject(new Error('Graphe non affiché en 90 s'))
          else requestAnimationFrame(check)
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
      let start = 0
      window.addEventListener(startEvent, (e) => (start = e.timeStamp), true)
      window.addEventListener(
        endEvent,
        (event) => {
          const from = start
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

test.describe('Perf graphe 500 répliques (Story 20.2)', () => {
  test.skip(!process.env.PERF_HARNESS, 'Mesure locale : npm run test:perf:graph')
  test.setTimeout(45 * 60_000)

  const selected = process.env.PERF_VARIANTS?.split(',')

  for (const variant of VARIANTS) {
    test(`500 répliques — ${variant.name}`, async ({ page, request, browser }, testInfo) => {
      test.skip(selected != null && !selected.includes(variant.name), 'Variante non demandée')
      const documentId = `e2e-perf500-${variant.name}`
      const fixture = JSON.parse(
        fs.readFileSync(path.join('e2e', 'fixtures', 'perf-graph-500.json'), 'utf-8')
      ) as Record<string, unknown>
      const documentUrl = `${API_BASE}/api/v1/documents/${documentId}`
      const target = process.env.PERF_TARGET === 'dev' ? 'dev' : 'prod'
      fs.mkdirSync(OUT_DIR, { recursive: true })

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
      const outFile = path.join(OUT_DIR, `${variant.name}-${target}.json`)
      if (STEPS && fs.existsSync(outFile)) {
        // Les étapes déjà mesurées restent ; l'en-tête est celui du run en cours.
        Object.assign(results, JSON.parse(fs.readFileSync(outFile, 'utf-8')), { ...results })
      }
      const save = () => fs.writeFileSync(outFile, JSON.stringify(results, null, 2))

      const reseed = async () => {
        await request.delete(documentUrl)
        await seedDocumentWithRetry(request, API_BASE, documentId, fixture)
      }

      try {
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
          await browser.startTracing(page, { path: path.join(OUT_DIR, `trace-zoom-${variant.name}-${target}.json`) })
          await zoomOutGesture(page)
          await browser.stopTracing()
          await wheelToZoom(page, 1)
          save()
        }
        if (wants('typing')) {
          // Frappe : à la touche enfoncée jusqu'à l'image qui suit.
          await page.goto('about:blank')
          await openAndTime(page, documentId, variant)
          await page.waitForTimeout(1500)
          const card = await zoomToWorkingView(page)
          const field = variant.textCards
            ? card.getByTestId('text-card-editor')
            : page.getByTestId('graph-inspector').locator('textarea[name="line"]')
          if (variant.textCards) {
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
          const valueBefore = await field.inputValue()
          await installLatencyProbe(page, 'keydown', 'input')
          const typed = 'Une suite tapée au clavier pour la mesure. '.slice(0, Math.max(REPS * 2, 20))
          await page.keyboard.type(typed, { delay: 90 })
          await page.waitForTimeout(1000)
          const typing = await readProbe(page)
          await expect(field, 'la frappe a changé le champ').not.toHaveValue(valueBefore)
          results.typing = {
            latency: stats(typing.latencies),
            longestTaskMs: Math.round(Math.max(0, ...typing.longTasks)),
          }
          save()
        }
        if (wants('drag')) {
          // Glisser une carte, au palier de travail puis vue ajustée.
          await page.goto('about:blank')
          await openAndTime(page, documentId, variant)
          await page.waitForTimeout(1500)
          const working = await zoomToWorkingView(page)
          results.dragAtZoom100 = await measureDrags(page, working)
          await page.goto('about:blank')
          await openAndTime(page, documentId, variant)
          await page.waitForTimeout(1500)
          const fitted = await centralCard(page)
          results.dragAtFit = await measureDrags(
            page,
            page.locator(`.react-flow__node[data-id="${fitted.id}"] ${CARD}`)
          )
          save()
        }
      } finally {
        save()
        await testInfo.attach('mesures', { body: JSON.stringify(results, null, 2) })
        console.log(JSON.stringify(results, null, 2))
        await page.goto('about:blank')
        await request.delete(documentUrl)
      }

      if (process.env.PERF_STRICT === '1' && variant.judged && target === 'prod') {
        const r = results as unknown as {
          firstOpen?: { fromGet: { p95: number } }
          nextOpen?: { fromGet: { p95: number } }
          typing?: { latency: { p95: number } }
          dragAtZoom100?: { latency: { p95: number } }
          dragAtFit?: { latency: { p95: number } }
          zoom?: { frameMs: { p95: number }; longestTaskMs: number }
        }
        const below = (value: number | undefined, limit: number, label: string) =>
          expect.soft(value ?? Number.POSITIVE_INFINITY, label).toBeLessThanOrEqual(limit)
        if (wants('load')) {
          below(r.firstOpen?.fromGet.p95, PERF_500.loadMs, 'p95 première ouverture (ms)')
          below(r.nextOpen?.fromGet.p95, PERF_500.loadMs, 'p95 ouverture suivante (ms)')
        }
        if (wants('zoom')) {
          below(r.zoom?.frameMs.p95, PERF_500.frameMs, 'p95 intervalle entre images au zoom (ms)')
          below(r.zoom?.longestTaskMs, PERF_500.longTaskMs, 'tâche la plus longue au zoom (ms)')
        }
        if (wants('typing')) below(r.typing?.latency.p95, PERF_500.keyMs, 'p95 frappe (ms)')
        if (wants('drag')) {
          below(r.dragAtZoom100?.latency.p95, PERF_500.dragMs, 'p95 glisser à 100 % (ms)')
          below(r.dragAtFit?.latency.p95, PERF_500.dragMs, 'p95 glisser, vue ajustée (ms)')
        }
      }
    })
  }
})
