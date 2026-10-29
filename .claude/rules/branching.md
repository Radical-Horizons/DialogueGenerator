---
description: "Flux de branches — une seule branche longue, `main` (protégée) ; tout passe par une PR vers `main`"
---
# Flux de branches

## La règle en une ligne

**Toute PR cible `main`.** Il n'y a plus de branche `dev` (abandonnée le 2026-10-29,
décision de l'utilisateur : simplifier le process).

## Les deux niveaux

| Branche | Rôle | Qui y écrit |
|---|---|---|
| `main` | Intégration. **Protégée** : on n'y pousse pas directement. | Uniquement des PR |
| `<sujet>` / `epic/<n>-<slug>` | Un chantier ou une epic, **partant de `main`** | Les commits de la session |

**Ce qui tourne en production, c'est le dernier tag `vX.Y.Z`**, pas `main`. Fusionner une
PR ne déploie rien ; le déploiement est une action à part, à la demande de l'utilisateur
(`/prod-release`). `git log <dernier tag>..origin/main` donne ce qui attend la prod.

## Obligations agent

- Une branche de travail part de `main` à jour : `git fetch origin && git switch -c <sujet> origin/main`.
- `gh pr create --base main --head <branche>`.
- Le grain de branche est le **chantier ou l'epic**, pas la sous-tâche.
- Le dépôt a `delete_branch_on_merge` : la branche de travail disparaît de GitHub à la
  fusion. C'est voulu ; ne pas réutiliser son nom pour la suite.
- Une branche qui vit longtemps diverge et rend la revue illusoire (`refonte-ui-2026` a
  compté 54 commits d'avance) : fusionner par tranches livrables.

## Gate de tests

| Moment | Attendu |
|---|---|
| Avant d'ouvrir une PR | **T2** — `npm run test:premerge` vert, plus typecheck si le frontend bouge et la preuve UI si le changement est visible |
| Avant de fusionner | CI de la PR **verte** (`ci.yml` : T2 + e2e auth + PWA) |
| Après la fusion | `ci.yml` rejoue **T3** sur le push `main` |
| Avant un déploiement | **T3** local complet — `.claude/rules/ci_before_push.md` et `/prod-release` |

Seule dérogation au T2 local : un diff **sans aucune surface de test** — uniquement
`.claude/**`, `CLAUDE.md`, `AGENTS.md`, `docs/**` ou `_bmad-output/**`.

### Pourquoi T2 avant d'ouvrir la PR

Mesures du 2026-09-30 sur le poste Windows, `npm run test:premerge` : pytest `not slow`
3 min 58, ESLint quelques secondes, Vitest 2 min 56 — **7 min 06**. C'est le prix d'une
PR qui arrive verte ; la CI reste le second filet, pas le premier.

## Vérifier avant de pousser

```bash
git rev-parse --abbrev-ref HEAD          # pas main
git rev-list --count origin/main..HEAD   # ce que la PR apportera
```
