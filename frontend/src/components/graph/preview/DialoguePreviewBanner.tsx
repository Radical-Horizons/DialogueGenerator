/**
 * Bannière mode simulation (Story 9.4 AC3).
 */
import { theme } from '../../../theme'
import type { VisibilityEvalState } from '../../../types/visibilityConditions'

function lightStateFingerprint(st: VisibilityEvalState): string {
  const payload = JSON.stringify({
    f: st.flags,
    r: st.reputation,
  })
  let h = 2166136261
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** Nombre de clés d'état suivies (flags + réputation) pour le résumé bannière (AC3). */
function countPreviewStateEntries(st: VisibilityEvalState): number {
  return Object.keys(st.flags).length + Object.keys(st.reputation).length
}

interface DialoguePreviewBannerProps {
  visibilityEvalState: VisibilityEvalState
}

export function DialoguePreviewBanner({ visibilityEvalState }: DialoguePreviewBannerProps) {
  const n = countPreviewStateEntries(visibilityEvalState)
  const fp = lightStateFingerprint(visibilityEvalState)
  return (
    <div
      role="status"
      data-testid="dialogue-preview-banner"
      aria-live="polite"
      style={{
        flex: '0 0 auto',
        padding: '6px 12px',
        backgroundColor: theme.state.info.background ?? 'rgba(52, 152, 219, 0.2)',
        borderBottom: `1px solid ${theme.border.primary}`,
        color: theme.text.primary,
        fontSize: '0.85rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
      }}
    >
      <span style={{ fontWeight: 700 }}>Preview — état simulé</span>
      <span style={{ color: theme.text.secondary }}>
        entrées d&apos;état : {n} · empreinte : {fp}
      </span>
    </div>
  )
}
