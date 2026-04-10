import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('PWA index.html', () => {
  it('links the web app manifest', () => {
    const indexPath = resolve(process.cwd(), 'index.html')
    const html = readFileSync(indexPath, 'utf-8')
    expect(html).toContain('rel="manifest"')
    expect(html).toContain('manifest.webmanifest')
  })
})

