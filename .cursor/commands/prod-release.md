# Passe en prod — release semver + canvas versions

Charge le skill **`.cursor/skills/prod-release/SKILL.md`** et exécute la checklist complète.

## Déclencheurs

- « pousse en prod », « deploy prod », « release », « bump version », « alimenter le canvas versions »

## Ordre impératif

1. `scripts/list-commits-since-prod.ps1` — matière release = commits depuis dernier tag `vX.Y.Z`
2. Décision **majeur / mineur / patch** (dev) — [`references/semver-decision.md`](../skills/prod-release/references/semver-decision.md)
3. CI T3 si `main`
4. `npm run version:bump:*` + `npm run verify:app-version`
5. Canvas `app-versions.canvas.tsx` — [`references/canvas-version-entry.md`](../skills/prod-release/references/canvas-version-entry.md)
6. Commit + push `main` + `npm run deploy` + tag `vX.Y.Z`

Rule : `.cursor/rules/deployment.mdc` · `.cursor/rules/ci_before_push.mdc`
