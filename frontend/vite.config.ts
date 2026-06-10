/// <reference types="vite/client" />
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { API_TIMEOUTS } from './src/constants'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootPackageJsonPath = resolve(__dirname, '..', 'package.json')
const rootPackageVersion = JSON.parse(
  readFileSync(rootPackageJsonPath, 'utf-8')
) as { version?: string }
const appVersion =
  typeof rootPackageVersion.version === 'string'
    ? rootPackageVersion.version
    : '0.0.0'

const pwaManifestPath = resolve(__dirname, 'public', 'manifest.webmanifest')
const pwaManifest = JSON.parse(readFileSync(pwaManifestPath, 'utf-8')) as Record<string, unknown>

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Story 17.5: installabilité PWA (sans offline-first).
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: {
        // Evite les pièges de cache en dev (Epic 17: flux ergonomie).
        enabled: false,
      },
      // Source-of-truth: `public/manifest.webmanifest` (évite la duplication).
      manifest: pwaManifest,
      // Ne pas mettre `/api` en cache: le backend est dynamique.
      workbox: {
        navigateFallbackDenylist: [/^\/api(?:\/|$)/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /^\/api(?:\/|$)/.test(url.pathname),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    port: 3000,
    // true = 0.0.0.0 : joignable en 127.0.0.1 ET localhost (évite ::1-only sous Windows, compatible scripts/dev.js)
    host: true,
    strictPort: true, // Échoue si le port est déjà utilisé au lieu de prendre un autre port
    open: false, // Ne pas ouvrir automatiquement (géré par scripts/dev.js)
    // Configuration HMR robuste pour garantir le rafraîchissement
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 3000,
      clientPort: 3000,
      // Forcer le rechargement complet si le HMR échoue
      overlay: true,
    },
    // Watch de fichiers optimisé pour Windows
    watch: {
      // Utiliser le polling sur Windows si nécessaire (détecté automatiquement)
      usePolling: false, // Vite détecte automatiquement si nécessaire
      // Intervalle de polling si activé (en ms)
      interval: 1000,
      // Ignorer certains dossiers pour améliorer les performances
      ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    },
    // Désactiver le cache en développement pour garantir des changements toujours visibles
    fs: {
      // Permettre l'accès aux fichiers en dehors de la racine si nécessaire
      strict: false,
      // true = moins de stat() répétés → démarrage / résolution de modules plus rapide (Vite recommandé en dev)
      cachedChecks: true,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:4243',  // Port dev (4243), production utilise 4242
        changeOrigin: true,
        secure: false, // Désactiver la vérification SSL en dev
        ws: false, // Désactiver le proxy WebSocket (non utilisé)
        // Sync GDD Notion : même délai que axios (`API_TIMEOUTS.GDD_NOTION_SYNC`).
        timeout: API_TIMEOUTS.GDD_NOTION_SYNC,
        proxyTimeout: API_TIMEOUTS.GDD_NOTION_SYNC,
        // Désactiver le cache du proxy en développement
        configure: (proxy, _options) => {
          // Logs de debug uniquement si DEBUG_VITE_PROXY=true
          const debugProxy = process.env.DEBUG_VITE_PROXY === 'true';
          
          if (debugProxy) {
            console.error(`=== VITE PROXY CONFIGURED: target=${_options.target}, changeOrigin=${_options.changeOrigin} ===`);
          }
          
          proxy.on('proxyReq', (proxyReq, req) => {
            if (debugProxy) {
              const url = req.url || '';
              const method = req.method || 'UNKNOWN';
              const targetUrl = `${proxyReq.getHeader('host') || 'localhost:4243'}${proxyReq.path || url}`;
              console.error(`=== VITE PROXY REQ: ${method} ${url} -> ${targetUrl} ===`);
            }
            
            // Ajouter des headers anti-cache pour les requêtes API en dev
            if (process.env.NODE_ENV !== 'production') {
              proxyReq.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
              proxyReq.setHeader('Pragma', 'no-cache');
              proxyReq.setHeader('Expires', '0');
            }
          });
          
          proxy.on('proxyRes', (proxyRes, req) => {
            if (debugProxy) {
              const url = req.url || '';
              const status = proxyRes.statusCode || 0;
              console.error(`=== VITE PROXY RESPONSE: ${status} ${url} ===`);
              
              // Capturer le body complet de la réponse pour les requêtes estimate-tokens
              if (url.includes('estimate-tokens')) {
                const bodyChunks: Buffer[] = [];
                const originalPipe = proxyRes.pipe.bind(proxyRes);
                proxyRes.pipe = function(dest: NodeJS.WritableStream) {
                  proxyRes.on('data', (chunk: Buffer) => {
                    bodyChunks.push(chunk);
                  });
                  proxyRes.on('end', () => {
                    if (bodyChunks.length > 0) {
                      const fullBody = Buffer.concat(bodyChunks).toString('utf-8');
                      try {
                        const parsed = JSON.parse(fullBody);
                        const rawPrompt = parsed.raw_prompt || '';
                        const startsWithSection0 = rawPrompt.trim().startsWith('### SECTION 0');
                        const startsWithVocab = rawPrompt.trim().startsWith('[VOCABULAIRE ALTEIR]');
                        console.error(`=== VITE PROXY RESPONSE BODY FULL: starts_with_section0=${startsWithSection0} starts_with_vocab=${startsWithVocab} prompt_len=${rawPrompt.length} ===`);
                        console.error(`=== VITE PROXY RESPONSE BODY PREVIEW (first 500): ${rawPrompt.substring(0, 500)} ===`);
                      } catch (e: unknown) {
                        const msg = e instanceof Error ? e.message : String(e)
                        console.error(`=== VITE PROXY RESPONSE BODY PARSE ERROR: ${msg} ===`);
                      }
                    }
                  });
                  return originalPipe(dest);
                };
              }
            }
          });
          
          proxy.on('error', (err, req) => {
            // Toujours logger les erreurs de proxy
            console.error(`=== VITE PROXY ERROR: ${err.message} ${req.url} ===`);
            if (debugProxy) {
              console.error(`=== VITE PROXY ERROR STACK: ${err.stack} ===`);
            }
          });
        },
      }
    }
  },
  // Désactiver le cache en développement pour garantir des changements toujours visibles
  cacheDir: 'node_modules/.vite',
  clearScreen: false, // Garder les logs visibles
  build: {
    outDir: 'dist',
    sourcemap: false, // Désactiver les source maps en production pour réduire la taille
    minify: 'terser', // Utiliser terser pour une meilleure minification
    terserOptions: {
      compress: {
        drop_console: true, // Supprimer les console.log en production
      },
    },
    // Code-splitting automatique par Vite (plus fiable que manualChunks)
    // Laisser Vite gérer automatiquement pour éviter les problèmes d'ordre de chargement
    // Le warning sur la taille des chunks est acceptable (< 500 KB après minification)
  },
  // Optimisation pour le développement
  optimizeDeps: {
    // Forcer la re-pré-transformation des dépendances si nécessaire
    force: false, // Mettre à true pour forcer un rebuild complet
    // Désactiver le cache des dépendances pré-transformées en dev si nécessaire
    // (décommenter si problèmes persistants)
    // entries: [],
  },
  // Base path pour déploiement en sous-dossier (optionnel)
  // base: '/dialogue-generator/',
})

