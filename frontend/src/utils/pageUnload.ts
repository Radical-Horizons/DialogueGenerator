/**
 * La page est-elle en train d'être quittée (F5, fermeture, navigation) ?
 *
 * Chrome coupe les `EventSource` entre `beforeunload` et `pagehide`, et déclenche leur
 * `onerror` (état CLOSED) : sans ce signal, un rechargement serait pris pour une perte
 * du serveur, la génération marquée en échec et sa reprise effacée avant le départ.
 * `pagehide` arrive trop tard, d'où `beforeunload` ; s'il est annulé (confirmation
 * refusée), la page reste et le drapeau retombe.
 */

const UNLOAD_SETTLE_MS = 1_000

let unloading = false
let installed = false

function install(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('beforeunload', () => {
    unloading = true
    window.setTimeout(() => {
      unloading = false
    }, UNLOAD_SETTLE_MS)
  })
  window.addEventListener('pagehide', () => {
    unloading = true
  })
  window.addEventListener('pageshow', () => {
    unloading = false
  })
}

install()

export function isPageUnloading(): boolean {
  return unloading
}
