# Handoff — Refonte UI DialogueGenerator

## Vue d'ensemble

Refonte de l'interface de `Radical-Horizons/DialogueGenerator` (frontend React + Vite + Zustand + ReactFlow, styles inline via `frontend/src/theme.ts`). Objectif : réduire la densité et l'aspect « outil interne » sans changer les fonctionnalités, en gardant **la palette actuelle du repo**.

Trois chantiers :

1. **Page de génération** (accueil) — hiérarchie, colonne de lecture, réglages LLM résumés.
2. **États de génération** — pendant l'appel, après l'appel, mode écriture, tablette.
3. **Éditeur de graphe** — barre d'outils unique et inspecteur à onglets à la place de 7 panneaux flottants.

## À propos des fichiers de design

Les fichiers `.dc.html` de ce dossier (copiés dans le dépôt sous `docs/design/refonte-ui-2026/`) sont des **références de design réalisées en HTML** : des prototypes qui montrent l'aspect et le comportement visés. **Ce n'est pas du code de production à copier.** Le travail consiste à **recréer ces écrans dans le codebase existant** (React 18 + TypeScript, styles inline + `theme.ts`, ReactFlow, Zustand), avec ses patterns établis — pas à introduire une nouvelle stack, ni Tailwind, ni CSS modules.

Pour ouvrir les prototypes : ouvrir le `.dc.html` directement dans un navigateur (le fichier `support.js` doit rester à côté).

## Fidélité

**Haute fidélité.** Couleurs, tailles de police, espacements, largeurs de colonnes et libellés sont définitifs et doivent être repris tels quels. Les seules libertés : les données factices (noms de personnages, chiffres de tokens) et le placement exact des nœuds dans le canvas ReactFlow.

Exception : les polices. Les prototypes utilisent Instrument Serif / Instrument Sans / IBM Plex Mono. Voir « Typographie » ci-dessous pour la décision à prendre.

---

## Écrans

### A. Page de génération — état repos (`1c` dans `Accueil DialogueGenerator - explorations.dc.html`)

**Fichiers repo concernés**
`components/layout/Dashboard.tsx`, `components/generation/GenerationPanel.tsx`, `GenerationPanelControls.tsx`, `GenerationPanelHeader.tsx`, `components/context/ContextSelector.tsx`, `ContextList.tsx`, `components/generation/EstimatedPromptPanel.tsx`, `TokenBudgetBar.tsx`, `ContextSelectionBudgetBar.tsx`, `components/layout/Header.tsx`.

**Layout** — trois colonnes, hauteur pleine, header 52 px.

| Zone | Largeur | Contenu |
| --- | --- | --- |
| Header | 100 % × 52 px | logo, 3 onglets de navigation, ⌘K, réglages, avatar 27 px |
| Colonne gauche | 274 px | contexte GDD : chips sélectionnés, jauge de budget, recherche, onglets de catégorie, liste de fiches |
| Colonne centrale | flex, contenu max 660 px centré | scène, titre, tons, brief, résumé des réglages LLM, bouton Générer |
| Colonne droite | 268 px | « Ce qui part au modèle » (lignes label/tokens + total), dernier résultat |

**Changements par rapport à l'existant**

- Les onglets de catégorie de fiches (`ContextSelector`) : `white-space: nowrap`, gap 13 px, plus d'emoji, compteur affiché uniquement sur l'onglet actif (le reste au survol).
- Les cartes de fiches deviennent des **rangées séparées par un filet** `1px solid rgba(255,255,255,0.06)` — plus de `borderRadius`, plus de `shadow.card`. Sélection = `background: rgba(79,127,255,0.08)` + `box-shadow: inset 2px 0 0 #4f7fff`.
- Tous les contrôles LLM de `GenerationPanelControls` (modèle, effort, budgets, nombre d'options) sortent du flux principal et se résument en **une ligne cliquable** : `gpt-5.6 · moyen · 32K/4K · ≤ 4 ▾`. Le détail s'ouvre dans `GenerationOptionsModal` (déjà existant) ou un `details` inline.
- Un seul bouton bleu visible : `Générer le premier nœud`, hauteur 46 px, radius 6 px, `#4f7fff`, avec le raccourci `CTRL+↵` en mono à droite du libellé, et sous lui une ligne mono `31 240 TOKENS · ≈ 0,18 $ · GPT-5.6`.
- Titre de scène : 33 px serif. Brief : 15,5 px / line-height 1,72, largeur 660 px max.

### B. Génération en cours (`2a`)

**Fichiers repo** `GenerationPanel.tsx`, `GenerationProgressModal.tsx` (à dissoudre), `ReasoningTraceViewer.tsx`, `ContextSelector.tsx`.

- **La modale de progression disparaît.** L'état de génération se joue dans l'écran, pas au-dessus.
- Colonne GDD : `opacity: 0.55`, `pointer-events: none`, libellé `VERROUILLÉ` en mono à la place du lien « vider ».
- Titre de scène réduit à 24 px ; brief replié en une ligne `brief · 106 tok · voir`.
- Zone centrale : `OPTION n SUR 4 — EN ÉCRITURE` + 4 traits de 16 × 2 px (remplis `#4f7fff`, vides `rgba(255,255,255,0.14)`), puis le texte qui arrive (locuteur mono, réplique serif 16 px, didascalie 14,5 px, réponses numérotées `01`/`02` en mono).
- Curseur de streaming : bloc 1,5 × 18 px `#4f7fff`, `animation: blink 1s steps(1,end) infinite`.
- Colonne droite : `ReasoningTraceViewer` en lignes horodatées (`00:01` mono 9,5 px + phrase 12,5 px), suivi de `ENVOYÉ / REÇU`.
- Pied : `Interrompre` (bouton secondaire, `ÉCHAP`) + `Garder ce qui est écrit`. Compteur = tokens **reçus** et coût **engagé**, pas une estimation.
- Header : point 6 px clignotant + `GÉNÉRATION · 00:06`.

### C. Résultat (`2b`)

**Fichiers repo** `GenerationPanel.tsx`, `UnityDialogueViewer.tsx`, `UnityDialogueEditor.tsx`, `DialogueFlagsPanel.tsx`, `ContextUsagePanel.tsx`, `estimation/EstimationBadge.tsx`.

- Colonne GDD réduite à un **rail de 56 px** : compteur `12` en bleu, filet, initiales des fiches en mono dans des carrés 26 px radius 6, chevron `›` en bas pour réouvrir.
- Les 4 options ne sont **pas** 4 cartes. L'option retenue est dépliée (filet gauche `2px solid #4f7fff`, fond `rgba(79,127,255,0.05)`), les 3 autres tiennent en une rangée : `OPTION n` (mono, colonne fixe 74 px) + première réplique serif 15 px + méta 12 px + bouton `Déplier`.
- Actions par option : `Garder` (seul bouton plein), `Éditer`, `Variante`. Hauteur 30 px.
- Colonne droite = diagnostic : ton tenu, longueur, mensonge possible, flags posés, répétition ; puis fiches réellement citées en chips, et la phrase actionnable `9 fiches envoyées n'ont pas servi — réduire le contexte` (lien vers `ContextOptimizeModal`).
- Pied de colonne droite : `Garder et continuer` + `écrit le nœud dans le graphe · scène 4.3`.

### D. Mode écriture (`2c`)

- Raccourci `⌘\` : replie les deux colonnes en rails (52 px), header réduit à 44 px, colonne de lecture à 760 px, brief à 17 px / line-height 1,78.
- Un seul pied : `287 MOTS · 31 240 TOKENS · ≈ 0,18 $` à gauche, résumé du modèle + `Générer` à droite.
- **À implémenter comme un état, pas une route** : même arbre DOM, largeurs des panneaux animées 160 ms `ease-out`.

### E. Tablette 1024 px (`2d`)

**Fichiers repo** `hooks/useViewportMode.ts`, `theme/responsiveChrome.ts`, `components/layout/NarrowOverlayDrawer.tsx`, `GenerationPanelNarrowContext.tsx`.

- Sous 1200 px : la colonne droite quitte le flux et devient une **barre repliée** au-dessus de la barre d'action (`▴ Ce qui part au modèle` + total `31 240`). Le total reste toujours visible.
- Colonne GDD : 212 px, plancher absolu. En dessous, elle passe en rail 52 px (comportement de `2c`).
- Barre d'action collée en bas : résumé du modèle, coût, bouton `Générer le premier nœud` 40 px.

### F. Éditeur de graphe (`2e`)

**Fichiers repo** `components/graph/GraphEditor.tsx`, `GraphEditorHeader.tsx`, `GraphToolbarStatusRow.tsx`, `GraphToolbarToolsRow.tsx`, `GraphToolbarTitleBlock.tsx`, `useGraphToolbarMenuItems.ts`, `GraphCanvas.tsx`, `nodes/DialogueNode.tsx`, `nodes/EndNode.tsx`, `nodes/TestNode.tsx`, `GraphValidationPanel.tsx`, `GraphQualityLlmPanel.tsx`, `GraphAiSlopPanel.tsx`, `GraphContextDroppingPanel.tsx`, `FlowSimulationPanel.tsx`, `SchemaValidationPanel.tsx`, `DialogueCostModal.tsx`, `theme/unityDialogueListShell.ts`.

**Le changement structurant** — les sept panneaux actuellement montés en overlay au-dessus du canvas deviennent **les onglets d'un inspecteur droit fixe de 300 px** :

| Onglet | Composant existant à réutiliser |
| --- | --- |
| `NŒUD` | nouveau (détail du nœud sélectionné) |
| `SANTÉ` | `GraphValidationPanel` + `SchemaValidationPanel` fusionnés, compteur dans l'onglet |
| `QUALITÉ` | `GraphQualityLlmPanel` + `GraphAiSlopPanel` |
| `COÛT` | contenu de `DialogueCostModal` |

`FlowSimulationPanel`, `GraphContextDroppingPanel` et `GameSystemsIntegrationPanel` restent des modales — ils sont ponctuels, pas consultatifs. Le canvas ne doit **jamais** être masqué par un panneau.

**Barre d'outils : trois rangées → une rangée de 46 px**
titre du dialogue (14 px, 600) + `18 NŒUDS · 23 LIENS` en mono · séparateur 1 px · undo/redo (28 px) · 4 entrées texte `Nœud` `Disposer` `Jouer` `Actions ▾` · flex · santé (point 6 px + `2 AVERTISSEMENTS` en mono) · `ENREGISTRÉ · 11:24`.
Les `Badge` à fond coloré (`GraphHealthBadge`) et le `SaveStatusIndicator` passent en point + libellé mono `10,5 px / letter-spacing 0.05em`.

**Canvas** — fond `#101013`, grille `radial-gradient(rgba(255,255,255,0.055) 1px, transparent 1px)` / `background-size: 22px 22px`. Liens : `stroke-width: 1.5`, `rgba(255,255,255,0.2)`, le chemin sortant du nœud sélectionné en `#4f7fff`. Contrôles de zoom en bas à gauche : `− 72 % + | AJUSTER`, cadre 1 px `#2e2e36`, fond `rgba(18,18,20,0.9)`.

**DialogueNode** — largeur 220, radius 8 (inchangé), `background #1a1a1f`, bordure selon l'état :

| État | Bordure | Fond d'en-tête | Libellé |
| --- | --- | --- | --- |
| validé | `#27AE60` (existant `state.accepted`) | `#25252c` | `VALIDÉ` en `#27AE60` |
| à valider | `#3d3d46` | `#25252c` | `À VALIDER` en `#F5A623` (existant `state.pending`) |
| contradiction lore | `#c084fc` | `#2a1f38` | `LORE` en `#e9d5ff` (existant `state.lore`) |
| sélectionné | `#4f7fff` + `box-shadow 0 0 0 3px rgba(79,127,255,0.18)` | `#1a3a5a` (existant `button.selected`) | `SÉLECTIONNÉ` en `#a9c3ff` |

Structure interne : en-tête 7/11 px = locuteur mono 9,5 px `letter-spacing .09em` + état ; corps 10/11 px = réplique **serif 12,5 px** (la seule ligne qu'on lit à distance) + rangée mono 9,5 px `3 RÉPONSES` / `2 FLAGS`.
`EndNode` : une seule rangée `FIN — RUPTURE` + carré, largeur 180. `TestNode` : en-tête `TEST — VOLONTÉ 4` + `RÉUSSITE →` / `ÉCHEC →`.

**Liste de dialogues (gauche, 280 px)** — garder `unityDialogueListColumnStyle` mais : `borderRight: 1px solid rgba(255,255,255,0.06)` (au lieu de `2px solid theme.border.secondary`), rangées séparées par filet, `nom` 13,5 px + méta mono 10,5 px `18 nœuds · 4 fins · modifié il y a 2 min`, sélection comme les fiches GDD.

---

## Interactions & comportement

- `CTRL+↵` générer · `ÉCHAP` interrompre · `⌘\` mode écriture · `⌘K` recherche · `⌘1/2/3` replier contexte / trace / réglages · `P` preview scénario (existant).
- Chaque raccourci est **écrit à côté de son action** en mono, jamais uniquement dans `KeyboardShortcutsHelp`.
- Transitions : `width` et `opacity` uniquement, `160ms ease-out`. Pas de transition sur les couleurs de fond des rangées de liste (survol immédiat).
- Survol d'une rangée de fiche / dialogue : `background rgba(255,255,255,0.03)`.
- Streaming : curseur clignotant `blink 1s steps(1,end) infinite`, point de statut header `1.1s`.
- Le coût est affiché trois fois dans le cycle, **toujours à la même place et en mono** : estimé avant, engagé pendant, réel après.
- Chaque panneau vide affiche une phrase disant ce qui s'y affichera (« Rien pour cette scène. Le dialogue généré s'ouvre ici, éditable, avec sa trace de raisonnement. »). Aucun panneau vide sans phrase.

## État (Zustand)

Rien de nouveau côté données. Trois flags d'UI à ajouter, à placer dans `graphViewStore` / un `uiLayoutStore` :

- `writingMode: boolean` — replie les deux colonnes (`⌘\`).
- `contextPanelCollapsed: boolean` / `inspectorCollapsed: boolean` — rails.
- `inspectorTab: 'node' | 'health' | 'quality' | 'cost'` — remplace `showValidationPanel`, `showQualityLlmPanel`, `showAiSlopPanel`, `showSchemaValidationPanel`, `showCostBreakdown` dans `useGraphToolbar`. **C'est la suppression de cinq booléens indépendants au profit d'un seul état** — c'est ce qui garantit qu'on ne peut plus empiler deux panneaux.
- L'état de génération existant (`isGenerating`, progression, trace) alimente `2a` sans changement ; il faut seulement le rendre dans l'écran au lieu de `GenerationProgressModal`.

## Design tokens

Palette : **celle du repo, inchangée** (`frontend/src/theme.ts`). Les prototypes utilisent ces valeurs :

| Rôle | Valeur | Correspondance repo |
| --- | --- | --- |
| Fond principal | `#121214` | `background.primary` |
| Fond panneau / barre | `#17171b` | proche de `background.secondary` (`#1a1a1f`) |
| Fond nœud | `#1a1a1f` | `background.secondary` |
| Fond en-tête nœud | `#25252c` | `background.tertiary` |
| Filet standard | `rgba(255,255,255,0.06)` | remplace `border.primary` sur les séparateurs internes |
| Filet appuyé | `rgba(255,255,255,0.09)` | séparateurs de section |
| Bordure de contrôle | `#2e2e36` | boutons secondaires |
| Accent | `#4f7fff` | remplace `#007bff` / `#646cff` |
| Accent clair (texte sur fond bleu translucide) | `#a9c3ff` | — |
| Sélection (fond) | `rgba(79,127,255,0.08)` | `state.selected` |
| Texte principal | `#f2f2f5` | `text.primary` |
| Texte de corps | `#dcdce4` | — |
| Texte secondaire | `#9a9aa4` | `text.secondary` |
| Texte tertiaire | `#7c7c86` | `text.tertiary` |
| Texte étiquette / mono | `#63636c` | — |
| Avertissement | `#ffd43b` | `state.warning.color` |
| Erreur | `#ff6b6b` | `state.error.color` |
| Validé | `#27AE60` | `state.accepted.border` |
| À valider | `#F5A623` | `state.pending.border` |
| Lore | `#c084fc` / `#e9d5ff` / `#2a1f38` | `state.lore` |

**Règle du bouton bleu unique** : `#4f7fff` ne sert qu'à trois choses — sélection de fiche/nœud, jauge de budget, action primaire. **Un seul bouton plein bleu par écran, sans exception.** Tous les autres boutons : bordure `#2e2e36`, fond transparent ou `#1a1a1f`.

**Échelle d'espacement** : 5 / 9 / 14 / 20 / 34 px. Rien entre.

**Rayons** : 6 px (contrôles, boutons), 8 px (nœuds), 99 px (chips), 10 px (cadre d'écran). Aucune ombre sauf `shadow.card` sur les nœuds et les menus.

**Typographie**

| Usage | Prototype | Décision à prendre |
| --- | --- | --- |
| Titres de scène, répliques générées | Instrument Serif | **à valider** : ajouter la police (Google Fonts / self-host) ou retomber sur `Georgia, serif` |
| Interface | Instrument Sans | peut rester la pile système actuelle sans perte notable |
| Chiffres, étiquettes capitales, raccourcis, ids | IBM Plex Mono | remplace `fontFamily: 'monospace'` — à self-host |

Règle absolue : **aucun chiffre en sans-serif.** Tokens, coûts, compteurs, horodatages, ids de nœuds → mono. C'est la moitié de l'effet de la refonte.

Échelle : 33/28/24 px serif (titres) · 17/16/15,5/14,5 px (corps et brief) · 13,5/13/12,5 px (interface) · 11/10,5/10/9,5 px mono (étiquettes, `letter-spacing` 0.05–0.12em, capitales).

## Assets

Aucun. Les emoji actuels (`🔍`, `📊`, `▼`) sont supprimés : la recherche est un libellé `⌘K`, l'état vide est une phrase, les chevrons sont des caractères `▾ ▴ ‹ ›`. Prévoir un jeu d'icônes 1 px si le rail de contexte doit devenir iconographique — les initiales de fiches (`VD`, `CP`) suffisent dans les prototypes.

## Ordre d'implémentation suggéré

1. Tokens : ajouter les filets, l'accent `#4f7fff`, la pile mono. Aucun changement visuel de structure. (1 PR, testable seule.)
2. Rangées de liste (fiches GDD + dialogues) : filets, sélection, mono. Touche `ContextList`, `UnityDialogueList`, `UnityDialogueItem`.
3. Colonne centrale de génération : titre serif, brief 660 px, réglages LLM résumés, bouton unique.
4. États de génération : dissoudre `GenerationProgressModal` dans l'écran.
5. Graphe : `inspectorTab` remplace les cinq booléens ; les panneaux passent en onglets. **Le plus gros PR — à faire seul.**
6. Barre d'outils du graphe : une rangée, badges en points.
7. `DialogueNode` / `EndNode` / `TestNode`.
8. Responsive : rails, tiroir bas à 1024 px, mode écriture.

## Fichiers de ce dossier

| Fichier | Contenu |
| --- | --- |
| `accueil-1c.dc.html` | Écran `1c` — page de génération au repos. **Cible d'implémentation.** Les explorations `1a` et `1b` ont été retirées : elles ne sont plus une cible. |
| `etats-2a-2e.dc.html` | `2a` génération · `2b` résultat · `2c` mode écriture · `2d` 1024 px · `2e` éditeur de graphe. Contient aussi un bloc « specs d'implémentation » résumé. |
| `support.js` | Runtime nécessaire pour ouvrir les deux fichiers dans un navigateur. |

**Lire le HTML avant de coder.** Les valeurs exactes (couleurs, tailles, paddings, largeurs) sont
dans les attributs `style` des blocs `#1c` et `2a`–`2e`. Approximer à partir de ce README fait
perdre du temps : le HTML est la source de vérité.

Aperçu local : `npm run design:refs` puis http://localhost:8972/accueil-1c.dc.html

## Points ouverts

- La vue « côte à côte » des 4 options (`2b`) reste à dessiner.
- Le tiroir bas de `2d` : glissant sur toute la hauteur, ou plafonné à 60 % ?
- Instrument Serif : à valider ou à remplacer par Georgia.
