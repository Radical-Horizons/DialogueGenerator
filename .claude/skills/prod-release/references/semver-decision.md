# Décider majeur / mineur / patch

## Convention DialogueGenerator (prioritaire)

| Flux | Bump | Exemple |
|------|------|---------|
| Baseline prod initiale | **majeure** | `1.0.0` |
| **1 PR epic** mergée sur `main` | **mineure** (+1 : 1.1 → 1.2 → … → 1.7 → **1.8**) | PR #46 → `1.7.0` |
| Commits **directs sur `main`** hors PR epic | **patch** | post–Epic 5 → `1.7.1` |

Le numéro d'epic (Epic 17, Epic 5…) **ne fixe pas** la semver : seul l'**ordre de merge** compte.

Cartographie PR → semver : [`epic-pr-map.md`](epic-pr-map.md).

---

## Majeure (`npm run version:bump:major`)

- Rupture API, export Unity incompatible, migration documents non automatique
- Refonte architecture (rare)

## Mineure (`npm run version:bump:minor`)

- **Chaque merge PR epic** — une seule mineure par PR, pas par numéro d'epic

## Patch (`npm run version:bump:patch`)

- Commits sur `main` entre deux merges epic, déployés au fil de l'eau
- Le préfixe `feat(` ne change pas la règle si hors PR epic

## Heuristiques

| Signal | Bump |
|--------|------|
| Merge PR `Epic/…` | mineure |
| Commit direct sur `main` | patch |
| `BREAKING` / rupture Unity | majeure |
