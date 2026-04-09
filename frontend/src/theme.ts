/**
 * Constantes de thème pour l'application (mode sombre).
 *
 * Typographie responsive : `index.css` (base `html` + champs globaux), `theme/uiTypography.ts`
 * (échelle rem pour styles inline), `theme/responsiveChrome.ts` (onglets / panneaux / graphe).
 */

export const theme = {
  // Couleurs de base (primary = chrome, secondary = colonnes latérales, panel = zone centrale)
  background: {
    primary: '#121214',
    secondary: '#1a1a1f',
    tertiary: '#25252c',
    panel: '#212126',
    panelHeader: '#2a2a32',
  },
  // Couleurs de bordure
  border: {
    primary: '#3d3d46',
    secondary: '#4a4a54',
    focus: '#646cff',
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
      background: '#2e2e34',
      color: 'rgba(255, 255, 255, 0.87)',
      border: '#3d3d46',
      hover: {
        background: '#3a3a3a',
        border: '#646cff',
      },
    },
    primary: {
      background: '#007bff',
      color: '#ffffff',
      hover: {
        background: '#0056b3',
      },
    },
    secondary: {
      background: '#36363e',
      color: 'rgba(255, 255, 255, 0.87)',
      border: '#4a4a54',
    },
    selected: {
      background: '#1a3a5a',
      color: '#ffffff',
      border: '#007bff',
    },
  },
  // Couleurs d'input
  input: {
    background: '#26262c',
    border: '#3d3d46',
    color: 'rgba(255, 255, 255, 0.87)',
    focus: {
      border: '#646cff',
      outline: 'rgba(100, 108, 255, 0.3)',
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
