/**
 * Header du panneau de génération avec titre et indicateur de statut de sauvegarde.
 */
import { SaveStatusIndicator } from '../shared'
import type { SaveStatus } from '../shared/SaveStatusIndicator'
import { theme } from '../../theme'

export interface GenerationPanelHeaderProps {
  /** Statut de sauvegarde */
  saveStatus: SaveStatus
}

/**
 * Header du panneau de génération.
 */
export function GenerationPanelHeader({ saveStatus }: GenerationPanelHeaderProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
      <h2 style={{ marginTop: 0, marginBottom: 0, color: theme.text.primary }}>Génération de Dialogues</h2>
      <SaveStatusIndicator appearance="discreet" status={saveStatus} />
    </div>
  )
}
