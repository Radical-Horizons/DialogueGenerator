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

L'artifact a été extrait du code au commit `dev@e54da4b06`. Quand le code et l'artifact divergent,
**le code gagne** ; mettre l'artifact à jour ensuite.

## Choix

**Design system maison**, sans bibliothèque de composants externe, en styles inline React typés.
Les raisons de janvier tiennent toujours : brownfield, contrôle fin des surfaces spécialisées
(graphe React Flow, colonne de génération), équipe réduite.

## Ce qu'il faut savoir avant de dessiner ou coder un écran

- Un seul thème, sombre, un seul fond (`bg-app` = `#17171b`) ; les colonnes se séparent par des filets.
- Un seul bouton plein `#4f7fff` par écran ; le bleu ne sert qu'à la sélection, la jauge de budget et l'action primaire.
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

## Écarts restants

- Liens de choix et issues de test colorés par nature ; la maquette 2e voulait des liens neutres.
- Emoji restants là où des sélecteurs e2e ou des tests les ciblent (« ✨ Générer », `PresetValidationModal`), et dans les menus contextuels du graphe.
- `DialogueCostBreakdown` : `📊`, `✅/❌`, couleurs `#22c55e` / `#f59e0b` / `#ef4444`.
- Montants au format `$10.00` au lieu de « 10,00 $ ».
- 72 littéraux hexadécimaux restent dans les TSX (contre 112 avant), surtout dans des modales et formulaires hors refonte.
