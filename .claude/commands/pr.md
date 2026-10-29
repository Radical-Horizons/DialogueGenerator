---
description: Ouvre une PR vers main, avec la gate locale T2 et l'auto-merge optionnel.
argument-hint: "[titre optionnel] [auto pour activer l'auto-merge]"
allowed-tools: Bash(git:*), Bash(gh:*), Bash(npm:*), Bash(npx:*)
---

Ouvrir une pull request **vers `main`**. Contexte utilisateur : $ARGUMENTS

## État courant

- Branche : !`git rev-parse --abbrev-ref HEAD`
- Statut : !`git status --short`
- Ce que la PR apportera : !`git rev-list --count origin/main..HEAD` commit(s)

## La règle qui justifie cette commande

Une seule branche longue, `main`, protégée : tout y entre par PR — voir
`.claude/rules/branching.md`. Fusionner ne déploie rien ; la prod suit le dernier tag
`vX.Y.Z` (`/prod-release`).

## Gate avant d'ouvrir

**T2 vert avant d'ouvrir** — `.claude/rules/branching.md`.

1. `npm run test:premerge` (pytest `not slow` + ESLint + Vitest, ~7 min). Rouge → corriger
   d'abord, ne pas ouvrir la PR en comptant sur la CI.
2. Si le diff touche `frontend/` : `npm --prefix frontend run typecheck` (absent de `test:premerge`).
3. Preuve UI si le changement est visible (`.claude/rules/workflow.md`).

Seule dérogation : diff limité à `.claude/**`, `CLAUDE.md`, `AGENTS.md`, `docs/**`,
`_bmad-output/**` — aucune surface de test.

## Étapes

1. Vérifier qu'on n'est **pas** sur `main`. Sinon : `git switch -c <sujet> origin/main`.
2. Commiter et pousser la branche : `git push -u origin HEAD`.
3. Ouvrir la PR :

   ```
   gh pr create --base main --head "$(git rev-parse --abbrev-ref HEAD)" --fill
   ```

4. Si l'utilisateur a demandé `auto` : `gh pr merge --auto --squash`.
   GitHub merge seul quand les checks passent.
5. Rendre l'URL de la PR.

## Ce que la CI couvre déjà

Sur une PR vers `main`, `ci.yml` lance **cinq jobs en parallèle** : lint + typecheck,
pytest T2 (`not slow`), Vitest T2, PWA e2e, auth e2e. Environ 4 min de bout en bout. Après
la fusion, le push `main` rejoue T3.

C'est le **second** filet : elle ajoute les deux suites e2e, absentes de `test:premerge`.
Une CI rouge sur une PR qui n'a pas passé T2 en local, c'est un aller-retour évitable.

## `data/` GDD

Le commentaire automatique `pr-diff-gdd-split` sépare « hors GDD » et GDD. Lire la
première colonne, ignorer la seconde. Un churn dans `data/` n'est jamais un motif de
blocage — `.claude/rules/git_commit.md`.
