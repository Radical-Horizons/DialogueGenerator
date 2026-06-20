/**
 * Bandeau progression export batch (menu Actions / liste Unity).
 */
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import { useUnityBatchExportMenuStore } from '../../store/unityBatchExportMenuStore'

export function BatchExportProgressBanner() {
  const label = useUnityBatchExportMenuStore((s) => s.menu?.batchProgressLabel)

  if (!label) return null

  return (
    <div
      data-testid="batch-export-progress-banner"
      role="status"
      aria-live="polite"
      style={{
        flexShrink: 0,
        padding: '0.35rem 0.75rem',
        fontSize: remSize('small'),
        color: theme.text.primary,
        backgroundColor: theme.background.tertiary,
        borderBottom: `1px solid ${theme.border.primary}`,
      }}
    >
      Export batch : {label}
    </div>
  )
}
