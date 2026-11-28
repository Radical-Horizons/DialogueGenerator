/**
 * Tokens de la refonte UI (2026) — page de génération, listes, éditeur de graphe.
 * Palette de base inchangée (`theme.ts`) ; ce module ajoute les valeurs propres au
 * traitement "filets + colonne de lecture" sans toucher aux écrans non redessinés.
 *
 * Les valeurs et leur raison d'être sont dans `tokenValues.ts`. Ce qui change d'un thème à
 * l'autre (couleurs, ombre) se lit ici en `var(--dg-…)` : là où la valeur sort du CSS,
 * passer par `resolveToken`. Espacements, rayons, largeurs, glyphes et polices restent des
 * littéraux, qui servent aux calculs.
 *
 * Réf. design : handoff `Refonte UI DialogueGenerator` (écrans 1c, 2a–2e).
 */
import type { CSSProperties } from 'react'
import { tokenRef, tokenRefs } from './publishTokens'
import { nightTokens } from './tokenValues'

export const redesignAccent = tokenRefs('accent', nightTokens.accent)
export const redesignHairline = tokenRefs('hairline', nightTokens.hairline)
export const redesignSurface = tokenRefs('surface', nightTokens.surface)
export const redesignControl = tokenRefs('control', nightTokens.control)
export const redesignNodeBorder = tokenRefs('nodeBorder', nightTokens.nodeBorder)
export const redesignNodeShadow = tokenRef('nodeShadow')
export const redesignText = tokenRefs('text', nightTokens.text)
export const redesignGraphEdge = tokenRefs('graphEdge', nightTokens.graphEdge)

export const redesignSpacing = nightTokens.spacing
export const redesignRadius = nightTokens.radius
export const redesignDisclosureArrow = nightTokens.disclosureArrow
export const redesignFont = nightTokens.font
export const redesignReadingColumn = nightTokens.readingColumn
export const redesignRailWidth = nightTokens.railWidth

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

/**
 * Barre d'onglets — motif unique de la refonte (panneau droit, inspecteur, colonne
 * de génération).
 *
 * ⚠️ Le filet actif appartient au **libellé**, pas à la boîte du bouton : un
 * `borderBottom` sur le `<button>` se fait arrondir par le rayon des contrôles et
 * rend un arc au lieu d'un filet. D'où le `<span>` interne et le `box-shadow`.
 * Utiliser `tabButtonStyle` + `tabLabelStyle` ensemble, jamais l'un sans l'autre.
 */
export const redesignTab = {
  /** Style du `<button role="tab">` : mono capitales, sans bordure. */
  buttonStyle(active: boolean, fontSizePx = 10): CSSProperties {
    return {
      border: 'none',
      background: 'none',
      padding: 0,
      cursor: 'pointer',
      fontFamily: redesignFont.mono,
      fontSize: `${fontSizePx}px`,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: active ? redesignText.strong : redesignText.label,
      whiteSpace: 'nowrap',
    }
  },
  /** Style du `<span>` interne qui porte le filet actif. */
  labelStyle(active: boolean): CSSProperties {
    return {
      paddingBottom: 2,
      boxShadow: active ? `inset 0 -1px 0 ${redesignAccent.base}` : 'none',
    }
  },
} as const
