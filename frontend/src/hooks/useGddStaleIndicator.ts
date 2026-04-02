/**
 * Compare l'empreinte GDD stockée sur le nœud à l'empreinte courante (Story 3.9 FR19).
 */
import { useEffect, useMemo, useState } from 'react'
import { postGddContentFingerprint } from '../api/gddContextStale'
import { useContextConfigStore } from '../store/contextConfigStore'

const FINGERPRINT_DEBOUNCE_MS = 280

export interface GddStaleNodeDataRef {
  id: string
  contextGddContentFingerprint?: unknown
  gddContextSelectionsSnapshot?: unknown
}

export function useGddStaleIndicator(nodeData: GddStaleNodeDataRef): {
  stale: boolean
  checking: boolean
} {
  const [stale, setStale] = useState(false)
  const [checking, setChecking] = useState(false)

  const fieldConfigs = useContextConfigStore((s) => s.fieldConfigs)
  const essentialFields = useContextConfigStore((s) => s.essentialFields)
  const organization = useContextConfigStore((s) => s.organization)
  const configRevision = useMemo(
    () =>
      JSON.stringify({
        organization,
        fieldConfigs,
        essentialFields,
      }),
    [organization, fieldConfigs, essentialFields]
  )

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
          const { fieldConfigs, essentialFields, organization } = useContextConfigStore.getState()
          const field_configs: Record<string, string[]> = {}
          for (const [elementType, fields] of Object.entries(fieldConfigs)) {
            const essential = essentialFields[elementType] || []
            field_configs[elementType] = [...new Set([...essential, ...fields])]
          }
          const { fingerprint } = await postGddContentFingerprint({
            context_selections: snap as Record<string, unknown>,
            field_configs: Object.keys(field_configs).length > 0 ? field_configs : undefined,
            organization_mode: organization,
          })
          if (!cancelled) {
            setStale(fingerprint !== fp)
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
  }, [
    nodeData.id,
    nodeData.contextGddContentFingerprint,
    nodeData.gddContextSelectionsSnapshot,
    configRevision,
  ])

  return { stale, checking }
}
