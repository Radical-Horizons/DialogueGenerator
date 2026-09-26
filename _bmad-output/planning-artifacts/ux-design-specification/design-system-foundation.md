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

## Écarts connus entre le code et le système

Recensés à l'extraction, pas encore corrigés :

- `frontend/src/index.css` garde des valeurs d'avant la refonte : police racine `Inter` (gabarit Vite), liens et focus des champs en `#646cff`, boutons `#333333` rayon 8 px, champs `#26262c`.
- Couleurs en dur hors jetons : `#4A90E2` (minicarte, liens « suivant »), `#101013` (canvas), `#8fb0ff`, `#f0efe9`.
- Composants partagés non migrés : `Toast`, `WarningBanner`, `ConfirmDialog`, `ActionBar`, `ContextSummaryChips` (rayon 4 px, couleurs Bootstrap).
- Liens du graphe colorés par nature, alors que la maquette 2e les voulait neutres.
- Favicon `vite.svg` ; icône d'application en dégradé cyan-violet hors palette.
- Contrastes sous AA gardés tels quels : texte blanc sur `#4f7fff` (3,61:1), contour `#2e2e36` sur le fond (1,33:1).
