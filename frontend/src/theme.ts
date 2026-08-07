/**
 * Constantes de thème pour l'application (mode sombre).
 *
 * Typographie responsive : `index.css` (base `html` + champs globaux), `theme/uiTypography.ts`
 * (échelle rem pour styles inline), `theme/responsiveChrome.ts` (onglets / panneaux / graphe).
 */

export const theme = {
  /**
   * Surfaces (refonte 2026).
   *
   * La maquette n'a **qu'un seul fond** pour tout l'écran : les colonnes ne sont
   * séparées que par un filet à 6 % d'opacité, jamais par un changement de teinte.
   * `secondary`, `panel` et `panelHeader` sont donc alignés sur `primary` ; ils
   * restent distincts par leur *nom* pour ne pas casser les 600+ usages et pour
   * garder la possibilité de réintroduire une élévation là où elle a du sens.
   *
   * **Écart assumé à la maquette** (décision produit, 2026-08-06) : l'échelle est
   * remontée d'un cran — fond `#17171b` au lieu du `#121214` de la maquette, qui
   * rendait l'app uniformément trop sombre à l'usage. Les quatre surfaces gardent
   * leurs écarts relatifs : remonter le seul fond l'aurait fait entrer en
   * collision avec les champs de saisie (`input.background`, exactement `#17171b`)
   * et les modales auraient cessé de se détacher.
   *
   * `tertiary` reste **en relief** : c'est la surface des menus, des en-têtes de
   * nœud et des îlots qui doivent se détacher. `elevated` sert aux modales, qui
   * ont besoin de contraste sur leur voile.
   */
  background: {
    primary: '#17171b',
    secondary: '#17171b',
    tertiary: '#2a2a33',
    panel: '#17171b',
    panelHeader: '#17171b',
    /** Surface des modales — au-dessus du voile, pas dans le flux de la page. */
    elevated: '#1f1f26',
  },
  /**
   * Bordures : la refonte ne connaît que des **filets**. `primary` vaut le filet
   * standard de la maquette (6 %), `secondary` le filet renforcé (9 %) des
   * séparations structurantes. Les contours de contrôle vivent dans `input.border`
   * et `button.*.border` (#2e2e36), pas ici.
   */
  border: {
    primary: 'rgba(255, 255, 255, 0.06)',
    secondary: 'rgba(255, 255, 255, 0.09)',
    focus: '#4f7fff',
  },
  // Couleurs de texte
  text: {
    primary: 'rgba(255, 255, 255, 0.95)',
    secondary: 'rgba(255, 255, 255, 0.75)',
    tertiary: 'rgba(255, 255, 255, 0.55)',
    inverse: '#213547',
  },
  // Couleurs de bouton
  button: {
    default: {
      // Contrôle secondaire de la maquette : fond transparent, contour #2e2e36.
      background: 'transparent',
      color: 'rgba(255, 255, 255, 0.87)',
      border: '#2e2e36',
      hover: {
        background: 'rgba(255, 255, 255, 0.03)',
        border: '#3d3d46',
      },
    },
    primary: {
      // Accent unique de la refonte — un seul bouton plein par écran.
      background: '#4f7fff',
      color: '#ffffff',
      hover: {
        background: '#3d6ae8',
      },
    },
    secondary: {
      background: 'transparent',
      color: 'rgba(255, 255, 255, 0.87)',
      border: '#2e2e36',
    },
    selected: {
      background: '#1a3a5a',
      color: '#ffffff',
      border: '#4f7fff',
    },
  },
  // Couleurs d'input
  input: {
    // Un cran au-dessus du fond de page, sinon le champ disparaît dedans.
    background: '#1c1c22',
    border: '#2e2e36',
    color: 'rgba(255, 255, 255, 0.87)',
    focus: {
      border: '#4f7fff',
      outline: 'rgba(79, 127, 255, 0.25)',
    },
  },
  // Couleurs d'état
  state: {
    error: {
      background: '#3a1a1a',
      color: '#ff6b6b',
      border: '#ff4444',
    },
    success: {
      background: '#1a3a2a',
      color: '#51cf66',
    },
    info: {
      background: '#1a2a3a',
      color: '#74c0fc',
    },
    warning: {
      background: '#3a3a1a',
      color: '#ffd43b',
      border: '#ffc107',
    },
    /** Contradictions lore explicites (FR38) — distinct structure / complétude */
    lore: {
      background: '#2a1f38',
      color: '#e9d5ff',
      border: '#c084fc',
    },
    selected: {
      background: '#1a3a5a',
      color: '#74c0fc',
    },
    hover: {
      background: '#323238',
    },
    /** Bordure nœuds pending (générés, non validés) — Story 1.4 */
    pending: {
      border: '#F5A623',
    },
    /** Bordure nœuds accepted (validés) — Story 1.4 */
    accepted: {
      border: '#27AE60',
    },
  },
  /** Élévation légère (cartes, accordéons) — mode sombre */
  shadow: {
    card: '0 2px 10px rgba(0, 0, 0, 0.4)',
    cardInset: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  },
} as const
