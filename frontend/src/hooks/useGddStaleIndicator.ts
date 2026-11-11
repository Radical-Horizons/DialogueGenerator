/**
 * Compare l'empreinte GDD stockée sur le nœud à l'empreinte courante (Story 3.9 FR19).
 *
 * L'empreinte ne couvre que le contenu des fiches du snapshot : les réglages d'affichage du
 * contexte (champs, organisation) n'y entrent pas et ne doivent pas relancer le contrôle.
 */
import { useEffect, useState } from 'react'
import { postGddContentFingerprint } from '../api/gddContextStale'

const FINGERPRINT_DEBOUNCE_MS = 280

export interface GddStaleNodeDataRef {
  id: string
  contextGddContentFingerprint?: unknown
  gddContextSelectionsSnapshot?: unknown
}

function fingerprintVersion(fingerprint: string): string {
  const separatorIndex = fingerprint.indexOf(':')
  return separatorIndex === -1 ? '' : fingerprint.slice(0, separatorIndex)
}

/** Deux empreintes de versions différentes ne se comparent pas : elles diffèrent toujours. */
function isStaleFingerprint(stored: string, current: string): boolean {
  return fingerprintVersion(stored) === fingerprintVersion(current) && stored !== current
}

export function useGddStaleIndicator(nodeData: GddStaleNodeDataRef): {
  stale: boolean
  checking: boolean
} {
  const [stale, setStale] = useState(false)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    const fp = nodeData.contextGddContentFingerprint
    const snap = nodeData.gddContextSelectionsSnapshot
    if (
      typeof fp !== 'string' ||
      !fp ||
      typeof snap !== 'object' ||
      snap === null ||
      Array.isArray(snap)
    ) {
      setStale(false)
      setChecking(false)
      return
    }

    let cancelled = false
    setChecking(true)

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { fingerprint } = await postGddContentFingerprint({
            context_selections: snap as Record<string, unknown>,
          })
          if (!cancelled) {
            setStale(isStaleFingerprint(fp, fingerprint))
          }
        } catch (err) {
          if (import.meta.env.DEV) {
            console.debug('[useGddStaleIndicator] fingerprint request failed', err)
          }
          if (!cancelled) {
            setStale(false)
          }
        } finally {
          if (!cancelled) {
            setChecking(false)
          }
        }
      })()
    }, FINGERPRINT_DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [nodeData.id, nodeData.contextGddContentFingerprint, nodeData.gddContextSelectionsSnapshot])

  return { stale, checking }
}
