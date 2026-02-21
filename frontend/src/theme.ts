/**
 * Constantes de thème pour l'application (mode sombre).
 */

export const theme = {
  // Couleurs de base
  background: {
    primary: '#1a1a1a',
    secondary: '#242424',
    tertiary: '#2d2d2d',
    panel: '#2a2a2a',
    panelHeader: '#333333',
  },
  // Couleurs de bordure
  border: {
    primary: '#505050',
    secondary: '#5a5a5a',
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
      background: '#333333',
      color: 'rgba(255, 255, 255, 0.87)',
      border: '#404040',
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
      background: '#404040',
      color: 'rgba(255, 255, 255, 0.87)',
      border: '#505050',
    },
    selected: {
      background: '#1a3a5a',
      color: '#ffffff',
      border: '#007bff',
    },
  },
  // Couleurs d'input
  input: {
    background: '#2a2a2a',
    border: '#404040',
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
    },
    selected: {
      background: '#1a3a5a',
      color: '#74c0fc',
    },
    hover: {
      background: '#333333',
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
} as const
