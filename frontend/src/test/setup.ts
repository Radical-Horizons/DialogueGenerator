import '@testing-library/jest-dom'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// ResizeObserver n'est pas disponible dans JSDOM
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Nettoyer après chaque test
afterEach(() => {
  cleanup()
})

