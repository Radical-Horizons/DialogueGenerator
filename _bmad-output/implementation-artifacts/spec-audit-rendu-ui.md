---
title: 'Corriger les défauts de rendu relevés à l’audit de l’interface'
type: 'bugfix'
created: '2026-08-06'
status: 'done'
review_loop_iteration: 0
baseline_commit: '435b36d74752cd91313f98debfcd894eebb58453'
context: ['{project-root}/.claude/rules/ui_redesign_2026.md', '{project-root}/.claude/rules/responsive_frontend.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un audit automatisé de l'interface sur 7 configurations (380 → 1890 px, écrans 1c / 2c / 2d / 2e / Édition) remonte des défauts mesurés, dont un **bloquant** : à 1024 px le tiroir « Ce qui part au modèle » recouvre le bouton primaire sur 35 px et intercepte le clic (`elementFromPoint` au centre du bouton renvoie le tiroir) — l'action principale de l'écran est inutilisable. S'y ajoutent quatre textes sous le seuil WCAG AA, dont le libellé du bouton primaire lui-même (3,61:1) et son rappel de raccourci (2,26:1), et des débordements de 6 px en mobile.

**Approach:** Corriger chaque défaut à sa cause plutôt qu'au symptôme : réserver la hauteur du tiroir dans la colonne au lieu de déplacer le bouton, et remplacer les littéraux de couleur par les tokens déjà conformes. Chaque correction est validée par la même mesure automatisée qui l'a détectée, rejouée sur les 7 configurations.

## Boundaries & Constraints

**Always:**
- Toute correction est vérifiée par une **mesure** (contraste calculé, `getBoundingClientRect`, `elementFromPoint`), jamais par appréciation d'une capture.
- Les valeurs de couleur passent par les tokens (`redesignText`, `redesignAccent`) — aucun littéral hexadécimal nouveau dans un composant.
- Les écarts à la maquette sont documentés en commentaire, avec la mesure qui les justifie.
- La suite Vitest complète reste verte ; `tsc` reste à sa baseline de 119 ; ESLint à 0.

**Ask First:**
- _(tranché au checkpoint 1, 2026-08-06)_ **L'accent `#4f7fff` ne bouge pas**, ni aucune autre couleur — seuls les **gris de texte** peuvent être éclaircis. Conséquence assumée : le couple blanc-sur-accent reste à 3,61:1 et le rappel de raccourci ne peut pas dépasser ce plafond, quelle que soit sa propre couleur. Toute nouvelle proposition de modification de teinte doit repasser par l'humain.

**Never:**
- Modifier une teinte autre que les gris de texte — accent, fonds et bordures sont figés.
- Supprimer une fonctionnalité ou une affordance pour faire disparaître un chevauchement.
- Corriger un chevauchement par `z-index` ou marge magique sans traiter la cause.
- Toucher aux écrans hors du périmètre audité, ni au backend.

## I/O & Edge-Case Matrix

| Scénario | État | Comportement attendu | Traitement d'erreur |
|---|---|---|---|
| Tiroir bas actif (1024–1200 px) | Tiroir « Ce qui part au modèle » replié, colonne pleine hauteur | Le bouton primaire reste entièrement visible et cliquable : `elementFromPoint` en son centre renvoie le bouton | N/A |
| Tiroir déplié | Tiroir ouvert à son plafond 60 vh | La colonne défile sous le tiroir ; aucun contrôle n'est masqué | N/A |
| Mobile 380 px | Rails latéraux affichés | Aucun élément interactif au-delà du bord droit ; les rails ne recouvrent pas le texte du brief | N/A |
| Bouton primaire, tous écrans | Actif ou désactivé | Rappel de raccourci porté au maximum lisible sur l'accent inchangé (plafond structurel 3,61:1) | N/A |
| Textes gris sur fond sombre | Chips de ton, libellés secondaires | ≥ 4,5:1 — atteignable sans toucher aux teintes non grises | N/A |

</frozen-after-approval>

## Code Map

- `frontend/src/components/layout/PromptBudgetBottomDrawer.tsx` -- tiroir bas de l'écran 2d ; c'est lui qui se superpose au bouton
- `frontend/src/components/layout/Dashboard.tsx` -- monte le tiroir (`showPromptBottomDrawer`) et la colonne centrale ; endroit où réserver la hauteur
- `frontend/src/components/generation/GenerationPanel.tsx` -- barre d'action primaire (`generation-primary-action`, `marginTop: auto`) ; chips de ton lignes 705-720
- `frontend/src/components/generation/GenerationPanelControls.tsx` -- second jeu de chips de ton (`#7c7c86` en dur, l.451-458)
- `frontend/src/theme.ts` -- `button.primary.background` (accent des boutons pleins)
- `frontend/src/theme/redesignTokens.ts` -- `redesignText.muted` / `.label`, déjà remontés au-dessus de AA
- `tmp/audit-rendu.mjs` -- auditeur : contraste, chevauchement, hors-écran, débordement, cibles tactiles

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/components/layout/Dashboard.tsx` -- réserver la hauteur du tiroir sous la colonne centrale quand `showPromptBottomDrawer` est actif -- le bouton, collé en bas par `marginTop: auto`, passe sinon sous un tiroir en position fixe
- [x] `frontend/src/components/layout/PromptBudgetBottomDrawer.tsx` -- exposer sa hauteur repliée (constante partagée) et contenir sa largeur dans le viewport -- il déborde de 6 px à droite à 1024 px
- [x] `frontend/src/components/generation/GenerationPanel.tsx` -- remonter le rappel de raccourci (`CTRL+↵`, 2,26:1) vers le maximum lisible sur l'accent, et remplacer le littéral `#7c7c86` des chips par `redesignText.muted` -- valeurs figées avant la mise à niveau des tokens
- [x] `frontend/src/components/generation/GenerationPanelControls.tsx` -- même substitution de littéral pour son jeu de chips -- 4,33:1 mesuré
- [x] `frontend/src/components/layout/Dashboard.tsx` -- empêcher les rails latéraux de se poser sur le contenu (mobile et 2e) -- ils recouvrent 56 px du brief et une case de sélection
- [x] `frontend/src/__tests__/` -- ajouter une régression sur le cas bloquant : tiroir actif ⇒ bouton primaire non recouvert -- le défaut vient d'une correction précédente (« bouton en bas »), il peut revenir

**Acceptance Criteria:**
- Étant donné l'auditeur rejoué sur les 7 configurations, quand toutes les tâches sont faites, alors il ne reste **aucun** défaut `bloquant` ni `majeur`, et les seuls écarts `AA` restants sont ceux du couple blanc-sur-accent — inaccessibles sans modifier une teinte, ce que la décision du checkpoint 1 interdit.
- Étant donné les textes gris sur fond sombre, quand l'auditeur est rejoué, alors aucun n'est sous 4,5:1.
- Étant donné un viewport de 1024 px, quand la page est chargée, alors `elementFromPoint` au centre du bouton primaire renvoie ce bouton.
- Étant donné un viewport de 380 px, quand la page est chargée, alors aucun élément interactif n'a de bord droit au-delà de la largeur du viewport.

## Design Notes

Le défaut bloquant est une **régression introduite dans cette session** : la barre d'action a été collée en bas de colonne (`marginTop: auto`) sans que la colonne réserve la place du tiroir, qui est en position fixe. Le corriger en remontant le bouton annulerait la demande produit ; la correction juste est de réserver la hauteur.

Le contraste du couple blanc-sur-accent est **plafonné par la teinte de fond** : sur `#4f7fff`, même du blanc pur ne donne que 3,61:1. Éclaircir le seul rappel de raccourci le fait donc passer de 2,26 à 3,61 au mieux — un gain réel de lisibilité, mais AA reste hors d'atteinte tant que l'accent ne bouge pas. C'est un arbitrage humain assumé, pas un oubli : ne pas le « corriger » lors d'une passe ultérieure sans repasser par l'humain.

## Verification

**Commands:**
- `node tmp/audit-rendu.mjs` -- attendu : zéro défaut `bloquant` / `majeur` / `AA` sur les 7 configurations
- `node tmp/verif-2d-tiroir.mjs` -- attendu : `boutonCliquable: true`, `recouvrementPx` ≤ 0
- `cd frontend && npx tsc --noEmit` -- attendu : 119 erreurs (baseline inchangée)
- `cd frontend && npm run lint` -- attendu : 0 problème
- `cd frontend && VITEST_FULL=1 npx vitest run --max-workers=2` -- attendu : 242 fichiers / 1420+ tests verts
