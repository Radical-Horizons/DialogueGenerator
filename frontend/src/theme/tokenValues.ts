/**
 * Valeurs des tokens de la refonte, thème Nuit — source unique, publiée sur `:root` par
 * `publishTokens.ts`. Les composants les lisent par `redesignTokens.ts`.
 *
 * Réf. design : handoff `Refonte UI DialogueGenerator` (écrans 1c, 2a–2e).
 */
export const nightTokens = {
  /** Bleu unique de l'écran : sélection de fiche/nœud, jauge de budget, action primaire — rien d'autre. */
  accent: {
    base: '#4f7fff',
    light: '#a9c3ff',
    /**
     * Texte d'un état en cours (« OPTION 2 SUR 4 — EN ÉCRITURE », statut de génération),
     * liens. 8,4:1 sur le fond.
     */
    text: '#8fb0ff',
    /**
     * Remplissage du bouton primaire. `base` sous un libellé blanc ne tenait que 3,6:1 ;
     * un cran plus profond passe l'AA (4,75:1) sans changer de teinte. Les marques
     * (sélection, jauge, filet d'onglet) restent sur `base`.
     */
    fill: '#3d6ae8',
    fillHover: '#3560d8',
    selectedBg: 'rgba(79, 127, 255, 0.08)',
    selectedBgStrong: 'rgba(79, 127, 255, 0.05)',
    ring: 'rgba(79, 127, 255, 0.18)',
  },

  /** Filets remplaçant cartes/ombres sur les rangées de liste. */
  hairline: {
    standard: 'rgba(255, 255, 255, 0.06)',
    strong: 'rgba(255, 255, 255, 0.09)',
    rowHover: 'rgba(255, 255, 255, 0.03)',
  },

  surface: {
    base: '#17171b',
    panel: '#1c1c22',
    node: '#1f1f26',
    nodeHeader: '#2a2a33',
    /** Fond du canvas du graphe, seul endroit plus sombre que le fond de l'app. */
    canvas: '#101013',
    /** Voile de la minimap hors de la zone visible : `canvas` à 50 %. */
    canvasMask: '#10101380',
  },

  control: {
    /** Contour des boutons secondaires : leur libellé suffit à les identifier. */
    border: '#2e2e36',
    /**
     * Contour des champs de saisie. Un champ n'a pas de libellé interne : son cadre doit
     * tenir 3:1 contre le fond (WCAG 1.4.11), ce que `border` (1,3:1) ne faisait pas.
     */
    inputBorder: '#6a6a78',
  },

  /** Bordures des nœuds du graphe (écran 2e) : neutre par défaut, renforcée si validé. */
  nodeBorder: {
    default: '#3d3d46',
    strong: '#4a4a54',
  },

  /** Ombre portée des nœuds mis en avant (validé / sélectionné) — valeur maquette 2e. */
  nodeShadow: '0 2px 10px rgba(0, 0, 0, 0.4)',

  /** Valeurs relevées telles quelles dans la maquette 1c (bloc `#1c` du handoff HTML). */
  text: {
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
    /** Répliques en serif (colonne de lecture, inspecteur) : teinte légèrement chaude. */
    dialogue: '#f0efe9',
  },

  /**
   * Liens du graphe (écran 2e) — trait neutre des choix et des suites.
   *
   * La maquette donne `rgba(255,255,255,0.2)`, soit **1,83:1** sur le canvas `#101013`.
   * Un lien porte du sens (il dit où mène une réplique) : WCAG 1.4.11 lui demande 3:1.
   * Remonté au premier alpha conforme : 0,34 compose `#616163` sur le canvas, **3,07:1**
   * (0,33 donne 2,98:1). Le chemin sortant du nœud sélectionné reste en `accent.base`.
   */
  graphEdge: {
    neutral: 'rgba(255, 255, 255, 0.34)',
  },

  /** Échelle unique d'espacement. Rien entre ces valeurs. */
  spacing: {
    xs: 5,
    sm: 9,
    md: 14,
    lg: 20,
    xl: 34,
  },

  radius: {
    control: 6,
    node: 8,
    chip: 99,
    frame: 10,
  },

  /**
   * Flèches de dépliage (« Réglages du modèle », « Outils du contexte », sections de prompt,
   * « Filtres », menus non-`<select>`).
   *
   * Deux familles de glyphes cohabitent et ne se mesurent **pas** pareil à `font-size` égale :
   * `▴ ▾ ▸` (U+25B4/BE/B8, variantes *small*) ne posent que ~3 px d'encre à 10 px, contre ~6 px
   * pour `▲ ▼ ▶`. Chaque appelant avait improvisé sa valeur entre 7,5 et 11 px — d'où des flèches
   * illisibles, surtout dans la famille *small*. Une taille par famille, pas au jugé.
   */
  disclosureArrow: {
    /** Glyphes *small* `▴ ▾ ▸` — il leur faut ~1,3× la taille des pleins pour la même encre. */
    small: '20px',
    /** Glyphes pleins `▲ ▼ ▶`. */
    solid: '16px',
  },

  /**
   * Piles de police du prototype. Décision retenue : fallback système (pas de self-host) —
   * mêmes rôles (serif titres/répliques, sans interface, mono chiffres/étiquettes) sans fichier
   * de police ajouté au repo. À remplacer par Instrument Serif / Instrument Sans / IBM Plex Mono
   * si le self-hosting est validé plus tard.
   */
  font: {
    serif: '"Instrument Serif", Georgia, "Times New Roman", serif',
    sans: '"Instrument Sans", system-ui, Avenir, Helvetica, Arial, sans-serif',
    mono: '"IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
  },

  /** Colonne de lecture centrale (écran 1c / 2a / 2b). 760px en mode écriture, 600px à 1024px. */
  readingColumn: {
    default: 660,
    /**
     * Marges latérales de la colonne de lecture, hors mode écriture.
     *
     * Les colonnes du Dashboard sont en pourcentages : une largeur de lecture **fixe**
     * laisse donc le vide grandir avec l'écran (88 px de marge à 1440, 218 px à 1890,
     * 412 px à 2560). C'est la marge qu'il faut borner — la colonne absorbe le reste.
     */
    sideGutter: 'clamp(20px, 8%, 120px)',
    writingMode: 760,
    tablet: 600,
  },

  /** Rail replié (contexte GDD ou inspecteur graphe une fois la génération faite). */
  railWidth: 56,
} as const
