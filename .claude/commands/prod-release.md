---
description: Passe en prod — gate CI T3, bump semver, tag vX.Y.Z, deploy et alimentation du canvas versions.
argument-hint: "[majeur|mineur|patch]"
---

Charge le skill **`prod-release`** (`.claude/skills/prod-release/SKILL.md`) et exécute la checklist complète.

Niveau demandé : $ARGUMENTS (si vide, décider au jugé après lecture des commits).

## Déclencheurs

« pousse en prod », « deploy prod », « release », « bump version », « alimenter le canvas versions ».

## Ordre impératif

1. `scripts/list-commits-since-prod.ps1` — matière release = commits depuis dernier tag `vX.Y.Z`
2. Décision **majeur / mineur / patch** (dev) — `.claude/skills/prod-release/references/semver-decision.md`
3. CI T3 si `main`
4. `npm run version:bump:*` + `npm run verify:app-version`
5. Canvas `app-versions.canvas.tsx` — `.claude/skills/prod-release/references/canvas-version-entry.md`
6. Commit + push `main` + `npm run deploy` + tag `vX.Y.Z` + `git push origin vX.Y.Z`

Échelle tags : `docs/releases/semver-and-tags.md` · rétro epic : section **Version livrée** (`.claude/rules/app_versioning.md`).

Règles : `.claude/rules/deployment.md` · `.claude/rules/ci_before_push.md`
