import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('PWA Vite config', () => {
  it('includes vite-plugin-pwa with dev disabled', () => {
    const pkgPath = resolve(process.cwd(), 'package.json')
    const pkgRaw = readFileSync(pkgPath, 'utf-8')
    expect(pkgRaw).toContain('vite-plugin-pwa')

    const viteConfigPath = resolve(process.cwd(), 'vite.config.ts')
    const viteConfigRaw = readFileSync(viteConfigPath, 'utf-8')
    expect(viteConfigRaw).toContain('VitePWA(')
    expect(viteConfigRaw).toContain('devOptions')
    expect(viteConfigRaw).toContain('enabled: false')
  })
})

