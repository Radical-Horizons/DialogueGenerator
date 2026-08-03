/**
 * Tokens de la refonte UI (2026) — page de génération, listes, éditeur de graphe.
 * Palette de base inchangée (`theme.ts`) ; ce module ajoute les valeurs propres au
 * traitement "filets + colonne de lecture" sans toucher aux écrans non redessinés.
 *
 * Réf. design : handoff `Refonte UI DialogueGenerator` (écrans 1c, 2a–2e).
 */
import type { CSSProperties } from 'react'

/** Bleu unique de l'écran : sélection de fiche/nœud, jauge de budget, action primaire — rien d'autre. */
export const redesignAccent = {
  base: '#4f7fff',
  light: '#a9c3ff',
  selectedBg: 'rgba(79, 127, 255, 0.08)',
  selectedBgStrong: 'rgba(79, 127, 255, 0.05)',
  ring: 'rgba(79, 127, 255, 0.18)',
} as const

/** Filets remplaçant cartes/ombres sur les rangées de liste. */
export const redesignHairline = {
  standard: 'rgba(255, 255, 255, 0.06)',
  strong: 'rgba(255, 255, 255, 0.09)',
  rowHover: 'rgba(255, 255, 255, 0.03)',
} as const

export const redesignSurface = {
  base: '#121214',
  panel: '#17171b',
  node: '#1a1a1f',
  nodeHeader: '#25252c',
} as const

export const redesignControl = {
  border: '#2e2e36',
} as const

export const redesignText = {
  body: '#dcdce4',
  label: '#63636c',
} as const

/** Échelle unique d'espacement. Rien entre ces valeurs. */
export const redesignSpacing = {
  xs: 5,
  sm: 9,
  md: 14,
  lg: 20,
  xl: 34,
} as const

export const redesignRadius = {
  control: 6,
  node: 8,
  chip: 99,
  frame: 10,
} as const

/**
 * Piles de police du prototype. Décision retenue : fallback système (pas de self-host) —
 * mêmes rôles (serif titres/répliques, sans interface, mono chiffres/étiquettes) sans fichier
 * de police ajouté au repo. À remplacer par Instrument Serif / Instrument Sans / IBM Plex Mono
 * si le self-hosting est validé plus tard.
 */
export const redesignFont = {
  serif: 'Georgia, "Times New Roman", serif',
  sans: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
  mono: '"IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
} as const

/** Colonne de lecture centrale (écran 1c / 2a / 2b). 760px en mode écriture, 600px à 1024px. */
export const redesignReadingColumn = {
  default: 660,
  writingMode: 760,
  tablet: 600,
} as const

/** Rail replié (contexte GDD ou inspecteur graphe une fois la génération faite). */
export const redesignRailWidth = 56

/** Style de rangée de liste (fiches GDD, dialogues) : filet au lieu de carte. */
export function redesignListRowStyle(selected: boolean): CSSProperties {
  return {
    borderRadius: 0,
    boxShadow: selected ? `inset 2px 0 0 ${redesignAccent.base}` : 'none',
    backgroundColor: selected ? redesignAccent.selectedBg : 'transparent',
    borderBottom: `1px solid ${redesignHairline.standard}`,
  }
}

/** Étiquette capitale mono (compteurs, statuts, ids) — jamais de chiffre en sans-serif. */
export const redesignMonoLabelStyle: CSSProperties = {
  fontFamily: redesignFont.mono,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}
