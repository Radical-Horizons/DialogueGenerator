# Design System Foundation

> **Mise à jour 2026-09-27.** Le design system existe désormais et remplace le plan en trois phases
> rédigé en janvier 2026. Les valeurs de `visual-design-foundation.md` (fond `#1a1a1a`, accent
> `#007bff` / `#646cff`, police système, grille de 4 px) sont **antérieures à la refonte UI 2026** et
> ne doivent plus servir de référence.

## Où est le design system

| Source | Rôle |
| --- | --- |
| Artifact « DialogueGenerator » — <https://claude.ai/artifact/REQGGaEUwUPLt2tgStXdjv> | Référence navigable : brand book, 107 jetons (dont 64 couleurs) et 35 styles de texte avec leur usage, 16 composants avec aperçu et règles, écrans 1c–2e, correspondance avec le code. Privé : le partager depuis son menu Share pour un autre lecteur. |
| `frontend/src/theme.ts`, `frontend/src/theme/redesignTokens.ts` | **Source de vérité des valeurs** pour le code. Un écran importe ces jetons, il ne recopie jamais une valeur. |
| `docs/design/refonte-ui-2026/` | Maquettes HTML haute fidélité (1c, 2a–2e) et handoff. |
| `.claude/rules/ui_redesign_2026.md` | Invariants que les agents doivent respecter en codant l'UI. |

L'artifact a été extrait du code au commit `dev@e54da4b06` et tenu à jour jusqu'à `dev@122dc29a7` (version 6). Quand le code et l'artifact divergent,
**le code gagne** ; mettre l'artifact à jour ensuite.

## Choix

**Design system maison**, sans bibliothèque de composants externe, en styles inline React typés.
Les raisons de janvier tiennent toujours : brownfield, contrôle fin des surfaces spécialisées
(graphe React Flow, colonne de génération), équipe réduite.

## Ce qu'il faut savoir avant de dessiner ou coder un écran

- Un seul thème, sombre, un seul fond (`bg-app` = `#17171b`) ; les colonnes se séparent par des filets.
- Un seul bouton plein par écran, en `redesignAccent.fill` (`#3d6ae8`) ; l'accent `#4f7fff` ne sert qu'aux marques (sélection, jauge de budget, filet d'onglet).
- Trois familles : Instrument Serif (titres de scène, répliques), Instrument Sans (interface), IBM Plex Mono (tous les chiffres et étiquettes).
- Espacements 5 / 9 / 14 / 20 / 34 px ; rayons 6 / 8 / 10 / 99 px.
- Chaque panneau vide dit, en une phrase, ce qui s'y affichera.

Le détail, les usages de chaque jeton et les composants sont dans l'artifact.

## Intégration du 2026-09-27

Ce qui a été aligné sur le système (branche `ui/design-system-integration`) :

- `index.css` : police d'interface Instrument Sans (au lieu d'Inter, jamais chargée), liens `#8fb0ff`, champs sur `theme.input`, bouton par défaut = bouton secondaire (contour, fond transparent, rayon 6).
- Un seul bouton plein par écran : « Connexion » passe en secondaire dans l'en-tête ; les boutons pleins prennent `redesignAccent.fill`.
- Contrastes : libellé blanc du bouton primaire à 4,75:1 (`#3d6ae8`, un cran sous l'accent), cadre des champs à 3:1 (`#6a6a78`). **Lève l'arbitrage du 2026-08-06** (accent et bordures figés, voir `implementation-artifacts/spec-audit-rendu-ui.md`) ; réversible en deux jetons (`redesignAccent.fill`, `redesignControl.inputBorder`).
- Composants partagés migrés : `Toast`, `WarningBanner`, `ConfirmDialog`, `ActionBar`, `ContextSummaryChips`, `CommandPalette`, `SaveStatusIndicator`, `KeyboardShortcutsHelp`, `Tooltip`.
- Page `/usage` : colonnes à filets, chiffres en mono, statuts en point + libellé ; la page défile enfin au-delà de l'écran.
- Graphe : bleus hérités (`#4A90E2`) retirés des liens « suivant », poignées et minicarte ; état vide sans emoji.
- Icône d'application et favicon redessinés en `accent`, PNG versionnés.

## Reste à faire traité (2026-09-27, branche `ui/design-system-raf`)

- Liens du graphe neutres à 1,5 px (blanc à 34 %, 3,07:1 sur le canvas), liens sortants du nœud sélectionné en accent ; seules les quatre issues de test gardent leur couleur.
- Emoji retirés de l'interface ; gravités de validation en point + mot. Sélecteurs e2e « ✨ Générer » mis à jour.
- Montants au format français dans leur vraie devise (`utils/formatCurrency.ts`) : « 0,18 $ », « 0,0042 € », plus de « ¢ ». L'alerte de budget annonçait des euros pour un budget en dollars : corrigé.
- `DialogueCostBreakdown`, modale des métadonnées, journaux d'export, collections : alignés sur le système.
- Onglet COÛT de l'inspecteur : affichait 0 nœud (identifiant avec `.json`) ; corrigé.
- Couleurs en dur : 12 restantes dans les TSX, toutes nommées (palette des locuteurs, valeurs exactes de maquette).

## Points ouverts tranchés (2026-09-27, PR #75 et #76)

- **Minicarte du graphe** masquée par défaut (absente de la maquette, elle recouvrait les actions des nœuds) ; bouton `CARTE` dans la barre de zoom pour l'afficher.
- **2b — comparaison des options** : vue « côte à côte » en plus de la liste (`GenerationOptionsColumns`, maquette `docs/design/refonte-ui-2026/comparaison-2b.dc.html`). Colonnes alignées par rangée (réplique, didascalie, réponses, flags, fiches citées, longueur) ; la liste s'impose quand chaque option n'aurait plus 190 px. Le panneau droit suit l'option retenue tant qu'aucune n'est gardée et qu'il n'a pas été modifié.
- **Tiroir « ce qui part au modèle »** (2d) plafonné à 60 % de la hauteur.
- **Rails repliés** : la colonne centrale leur réserve leur largeur (52 px rail riche, 32 px pilule) partout où aucune marge ne les protège — comparaison, étroit, graphe, mode écriture (`railReserve.ts`).
- **Inspecteur 2e** : un nœud créé à la main s'ouvre directement en édition ; les autres restent en lecture d'abord.

## Écarts restants

- Icônes de template : emoji choisis par l'utilisateur (donnée, défaut `📋` côté API), gardés.
- La maquette 2e dessine le chemin bleu entrant dans le nœud sélectionné, le README de handoff dit « sortant » : le code suit le README.
- La maquette 2b remplit à la fois « Garder » (option retenue) et « Garder et continuer » : deux boutons pleins sur un écran, contre la règle du bouton unique. Le code suit la maquette ; à trancher si la règle doit primer.
