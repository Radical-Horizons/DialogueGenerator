# DialogueGenerator — extensions rétrospective (ré-appliquer après quick-update BMAD)

Ces blocs sont intégrés dans `.agents/skills/bmad-retrospective/SKILL.md`.
Source canonique pour re-merge si une mise à jour BMAD écrase le skill.

## Critical (avant Step 1)

```xml
<critical>MANDATORY USER CHECKPOINT (Step 1.5): Even when #yolo / YOLO mode is active for this retrospective, Step 1.5 is NEVER skippable. Do not simulate {user_name}'s test results; do not proceed to Step 2 until {user_name} sends a real reply confirming manual tests or an explicit waived/skip with reason.</critical>
```

## Step 1.5 (après Step 1, avant Step 2)

Voir contenu dans SKILL.md — checkpoint manuel UI obligatoire (français).

## Step 11b (après Step 11, avant Step 12)

Alignement semver : `.cursor/skills/prod-release/references/epic-pr-map.md`, `.cursor/rules/app_versioning.mdc`, tag git, `npm run verify:app-version`, canvas `canvases/app-versions.canvas.tsx`.

## Step 12 — section document

Ajouter à la liste du document rétro :

- **Version livrée** (semver, tag git `vX.Y.Z`, PR merge, lien `epic-pr-map.md` / `docs/releases/semver-and-tags.md`)
