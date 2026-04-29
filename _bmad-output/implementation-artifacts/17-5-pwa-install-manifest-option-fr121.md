# Story 17.5: PWA — installabilité et manifest (option V1.5+) (FR121)

Status: done

<!-- Note: Validation optionnelle — validate-create-story avant dev-story si besoin. -->

## Story

As a **utilisateur qui revient souvent sur mobile**,
I want **pouvoir installer l’app comme PWA (icône écran d’accueil)**,
so that **le lancement est rapide et familier**.

## Acceptance Criteria

1. **Manifest et metadata PWA minimaux**  
   - **Given** un navigateur compatible (Chrome/Edge Android, Chrome desktop)  
   - **When** j’ouvre l’app  
   - **Then** un **Web App Manifest** valide est exposé (ex. `link rel="manifest"`) avec les champs requis (name/short_name, icons, start_url, display, theme_color/background_color)  
   - **And** les icônes PWA minimales existent et sont servies (au moins 192×192 et 512×512)  

2. **Installabilité (critères “minimum”)**  
   - **Given** un navigateur qui exige un service worker pour l’installabilité  
   - **When** les conditions PWA minimales sont remplies (manifest + SW si requis)  
   - **Then** l’installation est **possible** (ou, si contrainte navigateur, le gap est **documenté** et visible dans la story)  

3. **Scope “offline” explicitement hors MVP**  
   - **Given** cette story 17.5  
   - **When** j’installe l’app  
   - **Then** aucune promesse “offline-first” n’est introduite : on vise **install + shell**, pas un cache complet des API/data.

**References:** FR121, NFR-P5, Epic 17.

## Tasks / Subtasks

- [x] **Task 1 : Exposer un manifest PWA + icônes minimales, sans casser le shell** (AC: #1)  
  - [x] 🔴 Test échoue : le build/serve expose **pas** de manifest valide (ex. absence de `link[rel="manifest"]` dans `index.html` ou fichier manifest manquant / JSON invalide) **et/ou** les icônes minimales (192/512) sont absentes.  
  - [x] 🟢 Implémenter l’ajout du manifest + icônes et le wiring dans le frontend (voir Dev Notes).  
  - [x] 🔵 Refactor : rendre la config PWA “lisible et localisée” (une seule source de vérité pour nom/version/icons), et nettoyer toute duplication entre HTML, manifest, et config Vite.

- [x] **Task 2 : Rendre l’app installable sur navigateurs qui l’exigent (SW si requis)** (AC: #2, #3)  
  - [x] 🔴 Test échoue : sur un environnement de test contrôlé (Playwright ou check automatisé), l’app ne remplit pas les critères d’installabilité (pas de SW en prod build alors que requis ; warnings évidents Lighthouse/PWA).  
  - [x] 🟢 Implémenter l’approche SW la plus simple et maintenable pour Vite/React (voir Dev Notes), en gardant **offline** hors scope.  
  - [x] 🔵 Refactor : clarifier les toggles/dev-prod (en dev on évite les pièges SW) et rendre les tests PWA non-flaky (assertions minimales, pas de dépendance aux prompts UI).

## Dev Notes

- **Architecture guardrails**  
  - Conserver l’architecture existante : frontend Vite/React (`frontend/`). Pas de changement backend nécessaire pour “installabilité”.  
  - Ne pas toucher au comportement local-dev “frictionless” (auth mock, etc.) : cette story vise seulement l’emballage PWA.  

- **What to reuse (éviter réinvention)**  
  - `frontend/index.html` existe déjà et contient des décisions mobile (safe-area + `interactive-widget`), à **préserver**.  
  - Le pipeline build est Vite (pas CRA) : la solution PWA doit être compatible Vite 4.  

- **Approche recommandée (sans sur-prescription)**  
  - Option préférée : plugin PWA Vite (SW généré / Workbox) avec configuration minimale.  
  - Le SW ne doit pas introduire un offline complet : au mieux cache “shell” minimal (assets statiques), et laisser `/api` en réseau (ou stratégie conservative documentée).  
  - En dev, éviter les effets de cache (désactiver/register conditionnel ou config dédiée) pour ne pas perturber le workflow Epic 17.  

- **Quality bar / tests**  
  - Lint strict : `npm --prefix frontend run lint` doit rester à 0 warning.  
  - Vitest : au moins un test automatisé qui valide la présence et la validité du manifest (lecture fichier + assertions de champs + icons).  
  - Playwright (si stable dans le repo) : un smoke test “PWA artifacts served” (manifest accessible + SW register en production build/preview). Garder le test minimal (pas de “prompt d’installation”).  
  - **Important :** ce spec **ne doit pas** tourner contre `vite dev` (`devOptions.enabled=false` du plugin PWA → pas de SW). Utiliser **`npm run test:e2e:pwa`** (`playwright.pwa.config.ts`, build + `preview` :4173). La config principale `playwright.config.ts` **ignore** `pwa-installability.spec.ts` pour que `npm run test:e2e` / `test:e2e:verify` restent verts.

- **Conventions / contenu**  
  - Nom, short_name, couleurs : rester cohérent avec le branding existant “DialogueGenerator”.  
  - `start_url` et `scope` doivent rester compatibles avec l’hébergement actuel (si base path change un jour, la story doit anticiper via config centralisée).  

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-17.md` — Story 17.5]  
- [Source: `_bmad-output/implementation-artifacts/17-4-clavier-logiciel-safe-areas-renfort-mobile-fr118-120.md` — décisions `index.html` / mobile guardrails]  
- [Source: `frontend/vite.config.ts` — stack Vite/React, proxy API]

## Dev Agent Record

### Agent Model Used

Amelia (Dev) — dev-story

### Debug Log References

### Completion Notes List

- Ajout PWA “minimum” : `manifest.webmanifest` + `link rel="manifest"` dans `frontend/index.html`.
- Icônes : ajout d’icônes **SVG** déclarées en 192x192 et 512x512 (pas de PNG pré-existant dans le repo).
- Installabilité : intégration `vite-plugin-pwa` (SW généré en build), avec `devOptions.enabled=false` (évite les effets de cache en dev) et stratégie conservative (`/api` en `NetworkOnly`).
- Preuves : `npm --prefix frontend run lint` + Vitest ciblé sur tests PWA.
- 🔵 Refactor Task 2 : supprimer la duplication du manifest entre `vite.config.ts` et `public/manifest.webmanifest`  
  - Avant : un objet `manifest: { ... }` en dur dans `vite.config.ts`  
  - Après : `const pwaManifest = JSON.parse(readFileSync(...manifest.webmanifest...))` puis `manifest: pwaManifest`
 - Fix HIGH : compat “install icons” via **PNG** (générés automatiquement) + `purpose: maskable` dans le manifest.
 - Fix MEDIUM : `prebuild` génère les PNG requis avant `vite build` (pas de binaires committés) ; `npm --prefix frontend run test:ci` vert.
- **2026-04-29** : alignement Playwright PWA / `vite dev` — `testIgnore` + `npm run test:e2e:pwa` ; garde-fou `page.evaluate` dans le spec.

### File List

- `_bmad-output/implementation-artifacts/17-5-pwa-install-manifest-option-fr121.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `frontend/index.html`
- `frontend/public/manifest.webmanifest`
- `frontend/public/icons/icon-192.svg`
- `frontend/public/icons/icon-512.svg`
- `frontend/vite.config.ts`
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/.gitignore`
- `frontend/scripts/generate-pwa-icons.mjs`
- `frontend/src/__tests__/pwa.manifest.test.ts`
- `frontend/src/__tests__/pwa.indexHtml.test.ts`
- `frontend/src/__tests__/pwa.vitePwaConfig.test.ts`
- `frontend/src/utils/pwaIcons.ts`
- `e2e/pwa-installability.spec.ts` — smoke SW + manifest ; `evaluate` défensif si aucune registration
- `playwright.config.ts` — `testIgnore` inclut `pwa-installability.spec.ts` (ne pas exécuter ce spec sur `vite dev` :3000)
- `playwright.pwa.config.ts`
- `package.json` (racine) — script `npm run test:e2e:pwa`

### Review Follow-ups (AI)

- [x] [AI-Review][MEDIUM] Ajouter un smoke test “prod build” (Playwright ou script CI) qui vérifie que le SW est effectivement servi après `vite build`/`vite preview` (sans tester le prompt d’installation).  
- [x] [AI-Review][MEDIUM] Triage `npm --prefix frontend audit` (les vulnérabilités signalées lors de l’installation) : corriger si non-breaking, sinon documenter une stratégie (pin/upgrade) dans la story ou un ticket dédié.

### Notes audit (post-fix)

- `npm --prefix frontend audit fix` appliqué (non-breaking) ; `npm --prefix frontend run lint` + `npm --prefix frontend run test:ci` OK.
- Vulnérabilités restantes nécessitent `--force` (breaking) : notamment upgrade majeur Vite (pour `esbuild`) et downgrade `vite-plugin-pwa` (pour `serialize-javascript`). Décision à prendre séparément si on veut “0 vulnérabilité”.

## Change Log

- 2026-04-10 : Ajout manifest + wiring `index.html`, ajout icônes, intégration `vite-plugin-pwa` (SW en build, pas d’offline-first), tests Vitest + lint.
- **2026-04-29 (code-review PWA)** : le spec `pwa-installability` ne doit pas tourner sur `vite dev` (pas de SW) — `testIgnore` dans `playwright.config.ts` ; script racine `test:e2e:pwa` ; défense dans `page.evaluate` ; `Dev Notes` Quality bar ; section **Senior Developer Review** ci-dessous.
- **2026-04-29 (clôture)** : statut story et `sprint-status.yaml` → **`done`** (acceptation PO / équipe).

## Senior Developer Review (AI) — repasse 2026-04-29

**Reviewer:** Amelia · **Destinataire:** Véronique · **Statut story:** `done` (clôture 2026-04-29)

### Synthèse AC

| AC | Verdict | Preuve |
|----|-----------|--------|
| AC #1 | **IMPLEMENTED** | `manifest.webmanifest`, `index.html`, tests `pwa.*.test.ts`, PNG `prebuild` |
| AC #2 | **IMPLEMENTED** | `vite-plugin-pwa` + `npm run test:e2e:pwa` → SW enregistré après build+preview |
| AC #3 | **IMPLEMENTED** | Hors offline-first ; `NetworkOnly` `/api/` |

### Findings

**🔴 CRITICAL (corrigé) :** exécution du smoke PWA via **`playwright.config.ts` + `vite dev`** → pas de SW → échec. **Fix :** ignorer le spec dans la config « dev » ; route dédiée `test:e2e:pwa`.  
**🟡 MEDIUM :** 0 après fix.  
**🟢 LOW :** ajouter `test:e2e:pwa` au pipeline CI si on veut une preuve SW à chaque PR ; vulnérabilités audit `--force` déjà tracées.

**Décision :** **Approuvé (réserves LOW)**.  
**Clôture 2026-04-29 :** statut story **`done`** + `sprint-status.yaml` synchronisé.

