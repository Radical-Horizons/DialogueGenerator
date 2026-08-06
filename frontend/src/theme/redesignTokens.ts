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
  base: '#17171b',
  panel: '#1c1c22',
  node: '#1f1f26',
  nodeHeader: '#2a2a33',
} as const

export const redesignControl = {
  border: '#2e2e36',
} as const

/** Bordures des nœuds du graphe (écran 2e) : neutre par défaut, renforcée si validé. */
export const redesignNodeBorder = {
  default: '#3d3d46',
  strong: '#4a4a54',
} as const

/** Ombre portée des nœuds mis en avant (validé / sélectionné) — valeur maquette 2e. */
export const redesignNodeShadow = '0 2px 10px rgba(0, 0, 0, 0.4)'

/** Valeurs relevées telles quelles dans la maquette 1c (bloc `#1c` du handoff HTML). */
export const redesignText = {
  /** Corps du brief (15,5px / 1.72). */
  body: '#dcdce4',
  /**
   * Étiquettes mono capitales, chevrons.
   *
   * La maquette donne `#63636c` — soit **3,15:1** sur le fond de l'app, sous le
   * minimum WCAG AA (4,5:1) pour ces libellés de 9,5–10,5 px. Remonté à la
   * première valeur conforme qui garde la teinte froide : **4,79:1**.
   */
  label: '#84848f',
  /** Texte secondaire : « vider », liens sous le brief, résumé de fiche. */
  secondary: '#9a9aa4',
  /** Libellé de rangée (panneau droit), nom de fiche non sélectionnée. */
  row: '#d5d5dd',
  /** Valeurs mono en rangée, texte tertiaire. `#7c7c86` valait 4,17:1 — sous AA. */
  muted: '#8a8a95',
  /** Texte principal sur fond sombre. */
  strong: '#f2f2f5',
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
  serif: '"Instrument Serif", Georgia, "Times New Roman", serif',
  sans: '"Instrument Sans", system-ui, Avenir, Helvetica, Arial, sans-serif',
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
