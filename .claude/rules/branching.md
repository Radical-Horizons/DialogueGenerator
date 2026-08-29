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
| PR vers `dev` | **T0/T1** — ciblé sur le diff, plus lint/typecheck si le frontend bouge et la preuve UI si le changement est visible. **T2 recommandé mais facultatif.** |
| Merge direct vers `dev`, sans PR | **T2** — `npm run test:premerge` : aucune CI ne tourne sur un push `dev` |
| PR ou push vers `main` | **T3** complet — voir `.claude/rules/ci_before_push.md` |

### Pourquoi T2 n'est plus exigé pour une PR vers `dev`

`ci.yml` se déclenche sur `pull_request: branches: [main, dev]` et lance **cinq jobs en
parallèle** : lint + typecheck, pytest T2 (`not slow`), Vitest T2, PWA e2e, auth e2e.
Elle couvre donc **davantage** que `npm run test:premerge`, qui ne lance aucune des deux
suites e2e.

Les mesures d'août 2026 sur ce dépôt :

| | Backend pytest (même tier `not slow`) | Bout en bout |
|---|---|---|
| CI GitHub | **~2 min** | **~4 min**, 5 jobs parallèles |
| Poste de dev Windows | **1 h 32** | 1 h 32, en série |

Rejouer T2 en local avant une PR, c'est donc immobiliser la machine une heure et demie
pour refaire, en moins bien, ce que la CI fait en quatre minutes. **Ouvrir la PR est la
façon la moins chère de faire tourner la gate.**

T2 en local garde son intérêt hors ligne, sur un diff très large, ou quand on veut la
certitude avant de pousser — d'où « recommandé ».

⚠️ **L'exception qui compte** : un **merge direct dans `dev` sans PR** ne déclenche
**rien** (`push: branches: [main]` seulement). Dans ce cas la gate locale T2 n'est plus
facultative : c'est la seule qui existe.

Seule dérogation à ce T2 : un diff **sans aucune surface de test** — uniquement
`.claude/**`, `CLAUDE.md`, `AGENTS.md`, `docs/**` ou `_bmad-output/**`. Aucun test ne
peut casser sur ces fichiers, et rejouer 1 h 32 de pytest pour un markdown contredirait
la raison même de cette section. Dès qu'un seul fichier sort de cette liste, T2 rede-
vient obligatoire.

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
