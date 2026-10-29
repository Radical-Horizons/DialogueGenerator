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
| PR vers `dev` | **T2** — `npm run test:premerge` vert **avant** d'ouvrir la PR, plus typecheck si le frontend bouge et la preuve UI si le changement est visible. La CI rejoue T2 et ajoute les e2e. |
| Merge direct vers `dev`, sans PR | **T2** — idem : aucune CI ne tourne sur un push `dev`, c'est la seule gate |
| PR ou push vers `main` | **T3** complet — voir `.claude/rules/ci_before_push.md` |

### Pourquoi T2 avant une PR vers `dev`

Mesures du 2026-09-30 sur le poste de dev Windows, `npm run test:premerge` :

| Étape | Durée |
|---|---|
| pytest `not slow` (~2 500 tests) | 3 min 58 |
| ESLint | quelques secondes |
| Vitest (287 fichiers, 1 700 tests) | 2 min 56 |
| **Total** | **7 min 06** |

Sept minutes, c'est le prix d'une PR qui arrive verte. La CI de PR (`ci.yml`, ~4 min,
cinq jobs dont les deux suites e2e absentes de `test:premerge`) reste le **second**
filet, pas le premier : une CI rouge coûte un aller-retour complet — lecture du log,
correctif, push, nouveau run.

⚠️ Du 29/08 au 30/09, cette règle rendait T2 **facultatif** avant PR, sur la foi d'un
T2 local à « **1 h 32** ». C'était **un seul run**, le 2026-08-13, pris pendant qu'un
bug de logging quadratique (`DateRotatingFileHandler`, corrigé le 20/08) faisait exploser
la durée — recopié le 29/08 comme une mesure fraîche, alors que trois runs du 20/08
donnaient déjà 4 à 6 min. Un chiffre qui justifie une règle se date, se source, et se
remesure avant d'être cité.

Seule dérogation : un diff **sans aucune surface de test** — uniquement `.claude/**`,
`CLAUDE.md`, `AGENTS.md`, `docs/**` ou `_bmad-output/**`. Aucun test ne peut casser sur
ces fichiers. Dès qu'un seul fichier sort de cette liste, T2 redevient obligatoire.

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
