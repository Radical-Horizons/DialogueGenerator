# Semver produit et tags git

Convention canonique du dépôt. Règle agent : `.cursor/rules/app_versioning.mdc` · procédure prod : `/prod-release`.

## Règles

| Événement | Bump | Tag |
|-----------|------|-----|
| Baseline prod | `1.0.0` majeure | `v1.0.0` |
| **1 merge PR epic** sur `main` (ordre chronologique) | +1 mineure | `vX.Y.0` sur le commit de merge |
| Commits **directs sur `main`** deployés en prod | patch | `vX.Y.Z` sur le commit déployé |

Le numéro d'epic (Epic 17, Epic 5…) **n'est pas** le numéro de version.

Sources synchronisées : `package.json` (racine) → `npm run version:sync` → `frontend/package.json`, `api/app_version.py`.

## Échelle des tags (état actuel)

| Tag | Commit | Événement |
|-----|--------|-----------|
| `v1.0.0` | `fe9c3374` | Baseline prod |
| `v1.1.0` | `1e7c100b` | PR #5 — Epic 1 Génération |
| `v1.2.0` | `bccc8fcb` | PR #25 — Epic 2 Graphe |
| `v1.3.0` | `81a00d59` | PR #27 — Epic 3 Contexte |
| `v1.4.0` | `f6cc4fd0` | PR #33 — Epic 4 Validation QA |
| `v1.5.0` | `03729b00` | PR #39 — Epic 17 Responsive/PWA |
| `v1.6.0` | `a73255ce` | PR #43 — Epic 9 Variables |
| `v1.7.0` | `2c5a1ed8` | PR #46 — Epic 5 Export Unity |
| `v1.7.1` | `2dcf3a24` | Patches main + alignement semver/docs |

Prochaine epic mergée → **1.8.0** (`v1.8.0`). Patches inter-epic → **1.7.2**, etc.

Cartographie détaillée (à mettre à jour à chaque epic) : `.cursor/skills/prod-release/references/epic-pr-map.md`.

## Tags legacy (ne pas utiliser pour semver)

| Tag | Rôle |
|-----|------|
| `1.0` | Ancien tag baseline — même commit que `v1.0.0` |
| `v1.1` | Deploy ponctuel (infra nginx/CORS), **pas** une mineure semver |

Pour « commits depuis prod » : `npm run release:commits-since-prod` (dernier `v*.*.*`).

## Commandes

```powershell
git tag -l "v*" --sort=v:refname
npm run release:commits-since-prod
npm run verify:app-version
git push origin vX.Y.Z          # après deploy OK
```

## Rétrospective epic

Chaque document `epic-N-retro-*.md` inclut une section **Version livrée** (semver + tag + PR). Voir `_bmad/bmm/workflows/4-implementation/retrospective/instructions.md` (étape alignement version).
