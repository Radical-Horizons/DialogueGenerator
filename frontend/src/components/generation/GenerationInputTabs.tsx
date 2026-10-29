/**
 * Barre d'onglets de la colonne d'entrée : Brief · Flags · Templates.
 *
 * Un onglet **annonce** qu'il remplace la surface de travail — c'est précisément ce
 * que les anciens liens du bandeau ne disaient pas, d'où la sensation que le brief
 * disparaissait. Les réglages (auteur, règles, prompt système) ne sont pas ici :
 * ils décrivent le comportement du LLM, pas ce qu'on rédige.
 *
 * Le style vient de `redesignTab` — motif unique partagé avec la barre du panneau
 * droit. Ne pas restyler à la main : le filet appartient au libellé, pas au bouton.
 */
import {
  GENERATION_INPUT_TABS,
  type GenerationInputTabId,
} from '../../hooks/useGenerationInputTab'
import { redesignHairline, redesignTab } from '../../theme/redesignTokens'

export interface GenerationInputTabsProps {
  activeTab: GenerationInputTabId
  onSelect: (tab: GenerationInputTabId) => void
  /** Nombre de variables liées au dialogue ; affiché sur l'onglet Flags s'il est > 0. */
  flagCount: number
}

export function GenerationInputTabs({ activeTab, onSelect, flagCount }: GenerationInputTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Entrées de la génération"
      data-testid="generation-input-tabs"
      style={{
        display: 'flex',
        gap: 20,
        alignItems: 'flex-end',
        flexWrap: 'wrap',
        borderBottom: `1px solid ${redesignHairline.strong}`,
        marginBottom: 14,
      }}
    >
      {GENERATION_INPUT_TABS.map((tab) => {
        const active = activeTab === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={`input-tab-${tab.id}`}
            onClick={() => onSelect(tab.id)}
            style={redesignTab.buttonStyle(active)}
          >
            {/* Le filet appartient au libellé, pas à la boîte du bouton. */}
            <span style={redesignTab.labelStyle(active)}>
              {tab.id === 'flags' && flagCount > 0 ? `${tab.label} · ${flagCount}` : tab.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
