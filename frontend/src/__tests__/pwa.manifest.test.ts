import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { ensurePwaPngIcons } from '../utils/pwaIcons'

function loadManifest() {
  const path = resolve(process.cwd(), 'public', 'manifest.webmanifest')
  const raw = readFileSync(path, 'utf-8')
  return JSON.parse(raw) as {
    name?: string
    short_name?: string
    start_url?: string
    scope?: string
    display?: string
    theme_color?: string
    background_color?: string
    icons?: Array<{ src?: string; sizes?: string; type?: string }>
  }
}

describe('PWA manifest', () => {
  it('exposes a valid manifest with required fields and icons', () => {
    // Ensure PNG assets exist for platforms that require them.
    ensurePwaPngIcons({ iconsDirAbs: resolve(process.cwd(), 'public', 'icons') })

    const manifestPath = resolve(process.cwd(), 'public', 'manifest.webmanifest')
    expect(existsSync(manifestPath)).toBe(true)

    const m = loadManifest()
    expect(m.name).toBeTruthy()
    expect(m.short_name).toBeTruthy()
    expect(m.start_url).toBeTruthy()
    expect(m.scope).toBeTruthy()
    expect(m.display).toBeTruthy()
    expect(m.theme_color).toBeTruthy()
    expect(m.background_color).toBeTruthy()

    const icons = m.icons ?? []
    expect(icons.length).toBeGreaterThanOrEqual(2)

    const bySize = (sizes: string) => icons.find((i) => i.sizes === sizes)
    const i192 = bySize('192x192')
    const i512 = bySize('512x512')
    expect(i192?.src).toBeTruthy()
    expect(i512?.src).toBeTruthy()

    const icon192Path = resolve(process.cwd(), 'public', String(i192?.src).replace(/^\//, ''))
    const icon512Path = resolve(process.cwd(), 'public', String(i512?.src).replace(/^\//, ''))
    expect(existsSync(icon192Path)).toBe(true)
    expect(existsSync(icon512Path)).toBe(true)
  })
})

