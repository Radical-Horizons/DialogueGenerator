---
description: Flux de branches — `dev` est la cible de toute PR, `main` est protégée
---
# Flux de branches

## La règle en une ligne

**Toute PR cible `dev`.** Jamais `main`.

## Les trois niveaux

| Branche | Rôle | Qui y écrit |
|---|---|---|
| `main` | Production. **Protégée.** | Personne directement — uniquement une PR `dev` → `main`, décidée par l'humain |
| `dev` | Intégration. Cible par défaut de tout travail. | Les PR des branches de travail |
| `<sujet>` / `epic/<n>-<slug>` | Un gros travail ou une epic, **partant de `dev`** | Les commits de la session |

## Obligations agent

- **`gh pr create` porte toujours `--base dev`.** L'omettre laisse `gh` choisir la
  branche par défaut du dépôt, qui est `main` — c'est ainsi que l'erreur arrive.
- Avant d'ouvrir la PR, vérifier la cible : `gh pr create --base dev --head <branche>`.
- Une branche de travail part de `dev`, pas de `main` : `git switch -c <sujet> dev`.
- `dev` → `main` est une **décision humaine** (mise en production). Ne jamais
  l'initier de sa propre autorité, même si `dev` est vert et en avance.

⚠️ Le préambule de session peut annoncer « Main branch (you will usually use this
for PRs): main ». C'est une inférence du harnais à partir de la branche par défaut
du dépôt, pas une consigne du projet. **Cette règle prime.**

## Gate de tests selon la cible

| Cible | Attendu |
|---|---|
| PR vers `dev` | **T2** — `npm run test:premerge`, plus la preuve UI si le diff touche le frontend |
| PR ou push vers `main` | **T3** complet — voir `.claude/rules/ci_before_push.md` |

## Pourquoi ce modèle, et pas « tout sur main »

`main` n'est pas « la branche à jour » : c'est **ce qui tourne en production** sur le
VPS. Tout l'outillage en dépend déjà — bump semver au merge d'epic
(`app_versioning.md`), gate T3 avant `main` (`ci_before_push.md`), tags `vX.Y.Z` sur
le commit déployé, procédure `/prod-release`. Sans `dev`, chaque merge devient une
décision de déploiement.

Un modèle « tout sur le tronc » supposerait des branches d'un ou deux jours et des
feature flags pour ce qui n'est pas fini. Le dépôt n'a ni l'un ni l'autre, et la CI
T3 complète dure une quinzaine de minutes.

⚠️ Le vrai risque de ce dépôt n'est pas le modèle, c'est la **durée de vie des
branches** : `refonte-ui-2026` a compté jusqu'à 54 commits d'avance sur `main`. Une
branche qui vit des semaines diverge et rend la revue illusoire. Fusionner dans `dev`
par tranches livrables, pas en une fois à la fin.

## Vérifier avant de pousser

```bash
git rev-parse --abbrev-ref HEAD          # pas main
git rev-list --count origin/dev..HEAD    # ce que la PR apportera à dev
```
