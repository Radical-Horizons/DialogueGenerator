---
name: prod-release
description: >-
  Passe en production DialogueGenerator : gate CI T3, bump semver (maj/min/patch
  au jugé du dev), tag vX.Y.Z, deploy npm run deploy, alimentation du canvas
  versions (diff commits depuis dernier tag prod). Use when the user asks to
  push/deploy to production, release, bump version, or update the versions canvas.
paths:
  - "package.json"
  - "frontend/package.json"
  - "api/app_version.py"
  - "scripts/list-commits-since-prod.ps1"
  - "scripts/sync-app-version.js"
---

# Prod release — deploy + version + canvas

**Principe** : une **version prod** = tag `vX.Y.Z` sur le commit déployé. Contenu = commits depuis le tag précédent.

**Convention repo** : **1 PR epic = 1 mineure** (1.1, 1.2, … — ordre de merge, pas le numéro d'epic). **main** direct = patch. Cartographie : [`references/epic-pr-map.md`](references/epic-pr-map.md).

Rule versioning : [`.cursor/rules/app_versioning.mdc`](../../rules/app_versioning.mdc) · Rule déploiement : [`.cursor/rules/deployment.mdc`](../../rules/deployment.mdc)

## Checklist (copier et cocher)

```
- [ ] 1. Identifier dernier tag prod + commits depuis
- [ ] 2. Décider bump majeur / mineur / patch (jugement dev)
- [ ] 3. Rédiger highlights canvas (synthèse des commits)
- [ ] 4. Gate CI T3 si push main
- [ ] 5. Bump semver + verify + commit
- [ ] 6. Mettre à jour canvas VERSIONS
- [ ] 7. Push main + npm run deploy
- [ ] 8. Health prod + tag git vX.Y.Z + push tag
```

---

## 1 — Dernier passage prod et contenu de la release

**Référence prod** : tag annoté **`vX.Y.Z`** posé sur `main` **après** deploy OK (convention à partir de maintenant). Les anciens tags (`1.0`, `v1.1` deploy-only) ne comptent pas comme semver prod si ambigus — utiliser le dernier `v*.*.*` ou `package.json` + historique deploy.

```powershell
# Depuis la racine du dépôt
powershell -ExecutionPolicy Bypass -File scripts/list-commits-since-prod.ps1
powershell -ExecutionPolicy Bypass -File scripts/list-commits-since-prod.ps1 -Json
powershell -ExecutionPolicy Bypass -File scripts/list-commits-since-prod.ps1 -SinceTag v1.2.0
```

Lire **chaque** sujet de commit ; regrouper par thème. Pour les epics passées, lister les merges PR (`git log --merges --grep="Epic"`). Cartographie : [`references/epic-pr-map.md`](references/epic-pr-map.md).

Comptage manuel si besoin :

```powershell
git tag -l "v*" --sort=-v:refname
git rev-list --count v1.2.0..HEAD
git log v1.2.0..HEAD --oneline
```

---

## 2 — Choisir majeur, mineur ou patch

**Décision humaine obligatoire** — ne pas deviner depuis un seul commit.

Guide détaillé : [`references/semver-decision.md`](references/semver-decision.md)

| Niveau | Commande |
|--------|----------|
| Correctif | `npm run version:bump:patch` |
| Fonctionnalité rétro-compatible | `npm run version:bump:minor` |
| Rupture / migration lourde | `npm run version:bump:major` |

Puis :

```powershell
npm run verify:app-version
```

Sync : racine `package.json` → `frontend/package.json` + `api/app_version.py`.

---

## 3 — Alimenter le canvas versions

Canvas : **`canvases/app-versions.canvas.tsx`** (dossier projet Cursor, pas dans le dépôt git).

Gabarit et champs : [`references/canvas-version-entry.md`](references/canvas-version-entry.md)

Actions :

1. Ajouter en **tête** de `VERSIONS` l’entrée de la release (semver, `bump`, date, `commitCount`, `commitRef`, `highlights`).
2. Retirer ou vider l’entrée `unreleased` / `*-dev`.
3. Mettre `status: "current"` sur la version = `package.json` ; les précédentes en `"released"`.
4. Vérifier que le canvas compile (pas d’erreurs TypeScript dans l’IDE).

**Qualité des highlights** : phrases courtes orientées **utilisateur / intégrateur Unity**, pas jargon commit seul.

---

## 4 — Gate CI (push `main`)

Obligatoire avant push/deploy sur `main` — [`.cursor/rules/ci_before_push.mdc`](../../rules/ci_before_push.mdc) :

1. `npm run test:backend:full`
2. `cd frontend && set VITEST_FULL=1&& npx vitest run --max-workers=2`
3. `npm run test:e2e:pwa`

Alternative : `npm run test:ci:local` si documenté et vert.

---

## 5 — Commit release (sur `main`)

Message suggéré :

```
Release vX.Y.Z: <titre court>

<bump>: <major|minor|patch> — <une phrase justification>
Deploy prod demo.auto-diffusion.net
```

Inclure si modifiés : `package.json`, `frontend/package.json`, `api/app_version.py`, `package-lock.json` si bump npm l’a touché.

Le canvas vit hors git — pas dans ce commit sauf si l’équipe le versionne ailleurs plus tard.

---

## 6 — Deploy prod

Prérequis : `.env` local OK → `npm run deploy:check`

```powershell
npm run deploy
```

Variantes : `deploy:skip-build`, `deploy:skip-restart` — voir `deployment.mdc`.

Health après deploy :

```powershell
Invoke-WebRequest -Uri "https://demo.auto-diffusion.net/health" | ConvertFrom-Json
# version attendue ≈ APP_VERSION / package.json
```

---

## 7 — Tag prod (après health OK)

```powershell
git tag -a vX.Y.Z -m "Production deploy vX.Y.Z"
git push origin vX.Y.Z
```

Le tag marque le **dernier passage prod** pour la prochaine release (étape 1).

---

## 8 — Prochain cycle

Dès qu’il y a des commits sur `main` non déployés, remettre une entrée `unreleased` en tête du canvas (semver `-dev` prévue, `commitCount` à jour) pour préparer la prochaine prod.

---

## Erreurs fréquentes

| Problème | Action |
|----------|--------|
| `package.json` ≠ prod health version | redeploy après bump + verify |
| Aucun tag `v*.*.*` | compter depuis `main` au premier deploy semver ou tagger rétroactivement |
| Canvas introuvable | glob `**/canvases/app-versions.canvas.tsx` sous `.cursor/projects/` |
| Deploy sans bump | interdit si des commits user-facing depuis dernière prod — bump + canvas d’abord |

## Preuve agent

Rapporter : tag depuis, nombre de commits, bump choisi + justification, version finale, résultat T3, code health prod, tag poussé.
