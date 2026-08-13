---
description: Workflow — commandes essentielles, tests, déploiement, venv
---
- **Agentivité vs garde-fous techniques** : les limites ci-dessous (ex. Vitest sans filtre) sont des contraintes **techniques** (temps, workers, fiabilité du terminal Windows) — pas une consigne de « réduire les coûts ». Si l’utilisateur demande explicitement la suite complète, l’exécuter. Voir `.claude/rules/agentivity.md`.

- **Environnement virtuel Python** :
  - Le projet utilise un venv (`.venv/`) pour isoler les dépendances Python
  - Tous les scripts npm utilisent automatiquement le venv (pas d'activation manuelle nécessaire)
  - Installation : `npm run setup` (créer venv + installer dépendances)
  - Vérification : `npm run verify:venv` (vérifier que le venv est correctement configuré)
  - Activation manuelle (si besoin) : `.\scripts\activate-venv.ps1` ou `.\.venv\Scripts\Activate.ps1`

- **Preuve UI (changements visibles ou flux utilisateur)** :
  - Seuls pytest / Vitest / lint **ne constituent pas** une preuve suffisante quand il s’agit de ce que l’utilisateur voit ou manipule dans l’app.
  - **Preuve attendue** : démarrer l’app (`npm run dev`), ouvrir le navigateur sur l’UI (ex. `http://localhost:3000`), et **vérifier** le comportement ou l’affichage concerné ; de préférence via le MCP navigateur Cursor (`cursor-ide-browser`) lorsqu’il est disponible.
  - Ne pas présenter « preuve complète » sur une feature UI sans cette étape (sauf impossibilité technique explicite, à mentionner).
  - **Captures proactives (sans qu'on demande)** : envoyer 2-4 captures d'écran de l'app (`SendUserFile`, statut proactif) sans attendre la demande dans deux cas précis — (1) à la clôture de la **dernière US d'une epic**, (2) une fois les correctifs d'une **revue de code externe de PR** (humaine, CI, ou ultrareview) appliqués et re-vérifiés. Si le panneau Browser ne compose pas les frames ("Browser pane is not displayed"), basculer sur un fallback headless Playwright (déjà en devDependency de ce repo, `npx playwright`) depuis la racine du projet, sortie dans `tmp/` (gitignored) — ne pas redemander à l'utilisateur d'agir avant d'avoir épuisé cette alternative. Protocole complet : skill `milestone-screenshots`.

- **Niveaux de test T0–T3** (détail + tableau : **`.claude/commands/test-tiers.md`**). Résumé : **T0** fumée (`npm run test:backend:smoke`, Vitest `--bail=1`, `npm run test:e2e:smoke`) ; **T1** fichiers / `-k` / liste de specs Playwright ; **T2** `npm run test:premerge` ou équivalent (backend `not slow`, lint, Vitest défaut) ; **T3** `npm test`, `VITEST_FULL=1`, suite E2E complète — sur **demande explicite** ou équivalent CI sur `main`. Les agents privilégient **T0/T1** après un petit diff ; **T3** si l’utilisateur impose la suite complète (voir `.claude/rules/agentivity.md`).

- **Obligation agents (mode Agent — exécution réelle des tests)** :
  - Après toute modification de code, correctif ou fin de tâche d’implémentation, l’agent **exécute** les tests pertinents dans le terminal intégré (pytest ciblé, Vitest ciblé, lint si TS/TSX), et **ne conclut pas** « terminé », « vert », « OK » ou « prêt à merger » **sans** sortie de commande montrant le passage (résumé pass/fail ou extrait d’échec à corriger).
  - **Correction de tests (demande utilisateur — CI incluse)** : dès que l’utilisateur demande de corriger, réparer, stabiliser ou faire passer un test (pytest, Vitest, Playwright, spec E2E, job GitHub Actions), l’agent **doit relancer le(s) test(s) concerné(s) après la correction** et **prouver** le passage (sortie terminal pass/fail). Interdit de conclure « corrigé » sans cette exécution — y compris pour un échec CI reproduit localement (`pytest` ciblé, `vitest run <fichier>`, `npm run test:e2e:pwa`, etc.).
  - **Interdit** : se limiter à « vous pouvez lancer `pytest`… » à la place de l’exécution, sauf blocage technique avéré (sandbox, pas d’accès shell) — dans ce cas le signaler explicitement.
  - Backend : T0/T2/T3 → `npm run test:backend:smoke` / `test:backend:fast` / `test:backend:full` ([`scripts/pytest-tier.cjs`](scripts/pytest-tier.cjs)) ; T1 ou complet → `node scripts/getPythonPath.js -m pytest <fichiers ou -k>` ou `npm test`.
  - Frontend : **`cd frontend`** puis `npx vitest run src/chemin/Fichier.test.ts --reporter=dot` (alias `@/`). La suite Vitest complète sans filtre reste interdite pour l’agent sauf demande explicite (voir section Vitest ci-dessous).

- **Commandes essentielles (donner en une ligne)** :
  - Installation initiale : `npm run setup` (créer venv + installer toutes les dépendances)
  - Développement : `npm run dev` (lance backend sur 4243 + frontend sur 3000 automatiquement, utilise venv)
  - Démarrage plus rapide (dev) : `npm run dev:fast` ou `npm run dev -- --fast` (saute validate_all_configs + nettoyage logs au startup API ; GDD toujours chargé ; ignoré en production)
  - Développement avec nettoyage cache : `npm run dev:clean` (nettoie cache Vite avant démarrage, utile si changements non visibles)
  - Vérification processus/ports : `npm run dev:check` (détecte processus zombies, ports bloqués, lockfile stale. Ajouter `--clean` pour nettoyage automatique)
  - Statut services : `npm run dev:status` (affiche statut backend/frontend en tableau formaté)
  - Arrêt services : `npm run dev:stop` (arrête proprement tous les services)
  - Tests : `npm test` ou `pytest tests/` (utilise automatiquement le venv)
  - Build production : `npm run deploy:build`
  - Vérification déploiement : `npm run deploy:check`

- **Quand du code a changé** :
  - **Backend Python** : itération → `npm run test:backend:fast` ou ciblé ; fumée → `npm run test:backend:smoke` ; complet → `npm test` / `npm run test:backend:full`
    - Tests API : `npm run test:api` ou `pytest tests/api/` (utilise TestClient FastAPI, pas besoin de serveur)
    - Tests unitaires : `pytest tests/ -k "not api"`
  - **Frontend React** : pré-merge léger (T2) → `npm run test:premerge` ou `npm --prefix frontend run lint` + `npm --prefix frontend test` ; exigeant (build) → `npm run test:frontend` (build + lint + Vitest via [`scripts/test-frontend.ps1`](scripts/test-frontend.ps1))
    - Build check détecte erreurs TypeScript
    - Lint check détecte erreurs de code
    - Tests Vitest vérifient les composants
    - Suite Vitest **rapide** (agents, itérations) : `npm run test:frontend:vitest` → `tmp/vitest-report.json` ; suite **complète** (CI / T3) : `frontend` `npm run test:full` ou `npm run test:frontend:vitest:full`. Éviter `| Select-Object` sur la sortie Vitest ; en arrière-plan si besoin, lire le JSON de rapport une fois généré
  - **Interface web (PRINCIPALE)** : `npm run dev` (démarre tout sur localhost:3000, utilise venv automatiquement)

- **Tests** :
  - Commande standard : `npm test` (utilise automatiquement le venv pour pytest)
  - Alternative : `pytest tests/` (si venv activé) ou `.\scripts\run_tests.ps1` (utilise venv automatiquement)
  - Tests API : utiliser `TestClient` de FastAPI, pas de serveur réel
  - Mocks : `pytest-mock` pour services externes (LLM, fichiers GDD)
  - Configuration : `pytest.ini` définit les options (asyncio_mode, testpaths, etc.)
  - **E2E (Playwright)** : fumée → `npm run test:e2e:smoke` (`@smoke` sur les specs listées dans `.claude/commands/test-tiers.md`) ; complet → `npm run test:e2e` ou `npm run test:e2e:verify`. L'environnement nécessaire pour les E2E est disponible (`.env` avec `OPENAI_API_KEY`, budget, modèle gpt-5.6-luna). Voir `docs/troubleshooting/e2e-llm.md` pour preflight et dépannage. Post-mortem : `docs/troubleshooting/post-mortem-e2e-llm.md`.

- **Vitest — protocole agents (source de vérité)** : détail unique ici ; `CLAUDE.md` ne fait que résumer. `frontend_testing.md` couvre RTL, Playwright et anti-patterns — pas une deuxième copie du protocole d’exécution.
  - **Ne pas** lancer la suite Vitest complète depuis l’agent (workers ouverts). La CI ou une demande explicite utilisateur.
  - **Ciblage** : `cd frontend && npx vitest run src/__tests__/Fichier.test.ts --reporter=dot` (typiquement moins d’une minute).
  - **Après edits** : `cd frontend && npm run test:quick` (`vitest --changed`) ou `npm run test:bail`.
  - **Sanity optionnel** : `cd frontend && npx vitest run --bail=1 --reporter=dot`.
  - **Interdits agent** : `vitest run` sans filtre, `npm test` côté frontend comme suite complète, `npm run test:full` sans demande explicite.
  - **CI / humain** : `cd frontend && npm run test:ci` puis `node scripts/vitest-summary.js` (ou `npm run test:frontend:vitest:full` à la racine selon scripts du repo).

- **Frontend tests — Windows (éviter le pipe buffering PowerShell)** :
  - **❌ NE PAS** faire : `npx vitest run 2>&1 | Select-Object -Last 15` — PowerShell bufférise tout stdout, le résumé n'apparaît jamais dans le terminal.
  - **✅ Méthode courte (scope)** : `cd frontend && npx vitest run src/mon/dossier/ > ..\tmp\vitest-out.txt 2>&1` puis lire `tmp\vitest-out.txt`
  - **✅ Méthode complète avec résumé** :
    1. `cd frontend && npm run test:ci` (écrit `tmp/vitest-results.json`)
    2. `node scripts/vitest-summary.js` (affiche le résumé pass/fail depuis le JSON)

- **Version produit (semver)** : règle **`.claude/rules/app_versioning.md`** — PR epic = mineure, main direct = patch ; tags `vX.Y.Z` · `docs/releases/semver-and-tags.md` · rétro BMAD = section **Version livrée**. Procédure prod + canvas : `/prod-release`.

- **Avant commit** : **T2** recommandé — `npm run test:premerge` +, si changements critiques ou release, **`npm run test:frontend`** (build inclus) et/ou **`npm test`** (pytest complet). **T3** avant merge vers `main` si la CI complète n’a pas encore tourné sur la branche.

- **Avant `git push` vers `main`** (obligatoire agents) : suite CI T3 complète — voir **`.claude/rules/ci_before_push.md`**. Interdit de pousser sur `main` sans les trois jobs verts (backend full, Vitest `VITEST_FULL=1`, PWA). La commande `/commit` avec push suit la même gate.

- **Déploiement** : prod de référence = **VPS OVH** (`docs/deployment/PRODUCTION.md`, URL publique `demo.auto-diffusion.net`). `npm run deploy:build` / `npm run deploy:check` ; déploiement typique `npm run deploy`. Sur le serveur : `ENVIRONMENT=production`, `PUBLIC_ORIGIN` (ou `CORS_ORIGINS`), secrets JWT/OpenAI, etc. **Détail et pièges** : `.claude/rules/deployment.md`.

- **Diagnostic développement** :
  - Si ports bloqués ou processus zombies : `npm run dev:check` (vérifie ports 3000/4243, processus liés au projet, lockfile)
  - Nettoyage automatique : `npm run dev:check --clean` (arrête processus zombies, supprime lockfile stale)
  - Voir statut : `npm run dev:status` (tableau formaté avec health checks)
  - Vérifier venv : `npm run verify:venv` (vérifie que le venv et les dépendances sont OK)
  - Script de vérification : `scripts/dev-check.js` (détecte automatiquement processus liés au projet vs autres)

- **Problèmes courants** :
  - "Python non trouvé" ou "module non trouvé" : Exécuter `npm run setup` pour créer/réparer le venv
  - Dépendances manquantes : `npm run verify:venv` puis `npm run setup` si nécessaire
  - Venv corrompu : Supprimer `.venv/` puis `npm run setup`

