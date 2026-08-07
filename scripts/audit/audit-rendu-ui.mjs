/**
 * Audit de rendu de l'interface.
 *
 * Mesure ce qui se vérifie objectivement plutôt que de juger sur capture :
 * débordement horizontal, chevauchement d'éléments interactifs, contraste WCAG,
 * texte coupé, boutons sans nom accessible, invariants de la maquette.
 *
 * Deux précautions qui évitent les faux positifs, apprises à l'usage :
 *  - un élément scrollé hors de vue garde son rectangle : on compare donc les
 *    rectangles **clippés** par les ancêtres défilants, pas les boîtes brutes ;
 *  - le texte semi-transparent est composité sur son fond avant mesure.
 *
 * Prérequis : `npm run dev` (front 3000 + API 4243), compte admin/admin123.
 * Usage    : `node scripts/audit/audit-rendu-ui.mjs [--json]`
 * Sortie   : code 1 s'il reste un défaut `bloquant` ou `majeur`.
 *
 * Écart connu et assumé (décision produit 2026-08-06) : le texte blanc sur
 * l'accent `#4f7fff` plafonne à 3,61:1, sous le seuil AA de 4,5:1. L'accent ne
 * doit pas bouger ; ces occurrences sont attendues.
 */
import { chromium } from '@playwright/test'

const AUDIT = () => {
  const defauts = []
  const ajouter = (gravite, categorie, detail) => defauts.push({ gravite, categorie, detail })

  // ---- Contraste ----------------------------------------------------------
  const lum = (r, g, b) => {
    const f = (c) => {
      c /= 255
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number)
  const fondEffectif = (el) => {
    let n = el
    while (n && n !== document.documentElement) {
      const c = rgb(getComputedStyle(n).backgroundColor)
      if (c.length >= 3 && (c[3] === undefined || c[3] > 0.5)) return c
      n = n.parentElement
    }
    return [23, 23, 27]
  }
  const contraste = (el) => {
    const cs = getComputedStyle(el)
    const fg = rgb(cs.color)
    if (fg.length < 3) return null
    const alpha = fg[3] === undefined ? 1 : fg[3]
    const bg = fondEffectif(el)
    // Composite le texte semi-transparent sur son fond avant de mesurer.
    const mix = [0, 1, 2].map((i) => fg[i] * alpha + bg[i] * (1 - alpha))
    const a = lum(...mix)
    const b = lum(...bg.slice(0, 3))
    const [hi, lo] = a > b ? [a, b] : [b, a]
    return { ratio: (hi + 0.05) / (lo + 0.05), px: parseFloat(cs.fontSize), gras: parseInt(cs.fontWeight, 10) >= 700 }
  }

  /**
   * Un element compte comme visible s'il est peint ET non clippe par un ancetre
   * defilant. Sans ce second test, tout element scrolle hors de vue garde son
   * rectangle et produit de faux chevauchements avec ce qui est ancre en dessous.
   */
  const visible = (el) => {
    const b = el.getBoundingClientRect()
    if (b.width < 1 || b.height < 1) return false
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) <= 0.15) return false
    let p = el.parentElement
    while (p && p !== document.documentElement) {
      const pcs = getComputedStyle(p)
      const clippe = /auto|hidden|scroll/.test(pcs.overflow + pcs.overflowX + pcs.overflowY)
      if (clippe) {
        const pb = p.getBoundingClientRect()
        const interH = Math.min(b.right, pb.right) - Math.max(b.left, pb.left)
        const interV = Math.min(b.bottom, pb.bottom) - Math.max(b.top, pb.top)
        // Moins de la moitie de sa surface reellement dans la fenetre de l'ancetre.
        if (interH <= 1 || interV <= 1) return false
        if (interH * interV < b.width * b.height * 0.5) return false
      }
      p = p.parentElement
    }
    return true
  }

  /**
   * Rectangle reellement peint : l'intersection de la boite avec la fenetre de
   * chaque ancetre qui clippe. Comparer les boites brutes fait voir des
   * chevauchements entre un element scrolle hors de vue et ce qui est ancre.
   */
  const rectVisible = (el) => {
    let r = el.getBoundingClientRect()
    let box = { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
    let p = el.parentElement
    while (p && p !== document.documentElement) {
      const pcs = getComputedStyle(p)
      if (/auto|hidden|scroll/.test(pcs.overflow + pcs.overflowX + pcs.overflowY)) {
        const pb = p.getBoundingClientRect()
        box = {
          left: Math.max(box.left, pb.left),
          right: Math.min(box.right, pb.right),
          top: Math.max(box.top, pb.top),
          bottom: Math.min(box.bottom, pb.bottom),
        }
      }
      p = p.parentElement
    }
    return box
  }

  const texteDirect = (el) =>
    [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent || '').trim().length > 1)

  // 1. Contraste de tout texte visible
  for (const el of document.querySelectorAll('body *')) {
    if (!texteDirect(el) || !visible(el)) continue
    const c = contraste(el)
    if (!c) continue
    const seuil = c.px >= 24 || (c.px >= 18.66 && c.gras) ? 3 : 4.5
    if (c.ratio < seuil - 0.01) {
      ajouter('AA', 'contraste', {
        texte: (el.textContent || '').trim().slice(0, 42),
        ratio: +c.ratio.toFixed(2),
        seuil,
        px: c.px,
      })
    }
  }

  // 2. Débordement horizontal du document
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) {
    ajouter('bloquant', 'debordement', {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    })
  }

  // 3. Chevauchement entre éléments interactifs
  const interactifs = [...document.querySelectorAll('button, a, input, select, textarea')].filter(visible)
  for (let i = 0; i < interactifs.length; i++) {
    for (let j = i + 1; j < interactifs.length; j++) {
      const a = interactifs[i]
      const b = interactifs[j]
      if (a.contains(b) || b.contains(a)) continue
      const ra = rectVisible(a)
      const rb = rectVisible(b)
      const h = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)
      const v = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)
      if (h > 2 && v > 2) {
        ajouter('bloquant', 'chevauchement', {
          a: (a.textContent || a.getAttribute('aria-label') || a.tagName).trim().slice(0, 26),
          b: (b.textContent || b.getAttribute('aria-label') || b.tagName).trim().slice(0, 26),
          px: `${Math.round(h)}x${Math.round(v)}`,
        })
      }
    }
  }

  // 4. Élément interactif hors de l'écran
  for (const el of interactifs) {
    const r = el.getBoundingClientRect()
    if (r.right > window.innerWidth + 2 || r.left < -2) {
      ajouter('majeur', 'hors-ecran', {
        el: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30),
        left: Math.round(r.left),
        right: Math.round(r.right),
      })
    }
  }

  // 5. Bouton sans nom accessible
  for (const el of document.querySelectorAll('button')) {
    if (!visible(el)) continue
    const nom = (el.textContent || '').trim() || el.getAttribute('aria-label') || el.getAttribute('title')
    if (!nom) ajouter('majeur', 'bouton-sans-nom', { classe: el.className || '(aucune)' })
  }

  // 6. Invariant maquette : un seul aplat accent par écran
  const accents = [...document.querySelectorAll('button, a')].filter((el) => {
    if (!visible(el)) return false
    const bg = rgb(getComputedStyle(el).backgroundColor)
    return bg.length >= 3 && Math.abs(bg[0] - 79) < 26 && Math.abs(bg[1] - 127) < 26 && Math.abs(bg[2] - 255) < 26
  })
  if (accents.length > 1) {
    ajouter('maquette', 'accents-multiples', {
      nombre: accents.length,
      libelles: accents.map((e) => (e.textContent || '').trim().slice(0, 24)),
    })
  }

  // 7. Texte tronqué sans ellipsis (coupé net)
  for (const el of document.querySelectorAll('body *')) {
    if (!texteDirect(el) || !visible(el)) continue
    const cs = getComputedStyle(el)
    if (cs.overflow === 'visible' || cs.textOverflow === 'ellipsis') continue
    if (el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') {
      ajouter('mineur', 'texte-coupe', {
        texte: (el.textContent || '').trim().slice(0, 36),
        visible: el.clientWidth,
        reel: el.scrollWidth,
      })
    }
  }

  return defauts
}

const browser = await chromium.launch()
const rapport = []

async function auditer(nom, largeur, hauteur, preparer) {
  const page = await browser.newPage({ viewport: { width: largeur, height: hauteur } })
  const erreursConsole = []
  page.on('console', (m) => {
    if (m.type() === 'error') erreursConsole.push(m.text().slice(0, 150))
  })
  page.on('pageerror', (e) => erreursConsole.push('pageerror: ' + String(e).slice(0, 150)))

  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  await page.getByLabel(/nom d.utilisateur|utilisateur/i).fill('admin')
  await page.getByLabel(/mot de passe/i).fill('admin123')
  await page.getByRole('button', { name: /se connecter/i }).click()
  await page.waitForTimeout(3200)

  if (preparer) await preparer(page)

  const defauts = await page.evaluate(AUDIT)
  rapport.push({ ecran: nom, largeur, defauts, erreursConsole: [...new Set(erreursConsole)] })
  await page.close()
}

await auditer('1c generation', 1440, 880)
await auditer('1c large', 1890, 900)
await auditer('2d tablette', 1024, 800)
await auditer('mobile', 380, 800)
await auditer('edition', 1440, 880, async (p) => {
  await p.getByTestId('header-section-edition').click()
  await p.waitForTimeout(2200)
})
await auditer('2e graphe', 1440, 880, async (p) => {
  await p.getByTestId('header-section-graph').click()
  await p.waitForTimeout(2500)
})
await auditer('2c ecriture', 1440, 880, async (p) => {
  await p.keyboard.press('Control+\\')
  await p.waitForTimeout(1200)
})

await browser.close()

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rapport, null, 1))
} else {
  for (const e of rapport) {
    const parCategorie = {}
    for (const d of e.defauts) parCategorie[d.categorie] = (parCategorie[d.categorie] ?? 0) + 1
    const resume = Object.entries(parCategorie).map(([c, n]) => `${c}:${n}`).join(' ') || '—'
    console.log(`${String(e.ecran).padEnd(16)} ${String(e.largeur).padStart(5)}px  ${resume}`)
  }
}

const bloquants = rapport.flatMap((e) => e.defauts).filter((d) => d.gravite === 'bloquant' || d.gravite === 'majeur')
if (bloquants.length > 0) {
  console.error(`\n${bloquants.length} défaut(s) bloquant ou majeur :`)
  for (const d of bloquants) console.error(' -', d.categorie, JSON.stringify(d.detail))
  process.exit(1)
}
console.log('\nAucun défaut bloquant ni majeur.')
