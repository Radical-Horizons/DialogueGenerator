/// <reference types="node" />
import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Tests lourds exclus de `npm test` (défaut) pour un retour en minutes, pas en heures.
 * Suite complète : `npm run test:full` ou CI (VITEST_FULL=1).
 */
const SLOW_INTEGRATION_TESTS = [
  '**/GraphCanvas.virtualization.test.tsx',
  '**/GenerationPanel.integration.test.tsx',
  '**/Dashboard.test.tsx',
] as const

const runFullSuite = process.env.VITEST_FULL === '1'

export default defineConfig({
  // @ts-expect-error - Rollup version mismatch between vitest and vite, but works at runtime
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: true,
    /** Plafond par test (augmenter localement avec it(..., { timeout }) si besoin). */
    testTimeout: 30_000,
    hookTimeout: 15_000,
    /**
     * 4 workers max — évite le thundering herd jsdom sur machines multi-cœurs.
     * Chaque fork crée une VM + env jsdom ; au-delà de ~4-6 le startup domine le test.
     */
    maxWorkers: 4,
    minWorkers: 1,
    /**
     * Force l'arrêt des workers après 3s de teardown pour éviter les processus zombies
     * (handles ouverts de type setTimeout, IndexedDB, etc.).
     */
    teardownTimeout: 3_000,
    exclude: runFullSuite
      ? [...configDefaults.exclude]
      : [...configDefaults.exclude, ...SLOW_INTEGRATION_TESTS],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})



