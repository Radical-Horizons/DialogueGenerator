---
description: >-
  Auth guest-first frontend — initialize hors ProtectedRoute, isLoading, /login.
  Apply when editing authStore, LoginForm, App routes, auth E2E, or DISABLE_AUTH UX.
paths:
  - "frontend/src/store/authStore.ts"
  - "frontend/src/components/auth/**"
  - "frontend/src/App.tsx"
  - "e2e/auth*.ts"
---
# Auth guest-first (frontend)

- **Boot** : `isLoading` démarre à `true` jusqu’au premier `initialize()`. Toute route hors `ProtectedRoute` (surtout `/login`) **doit** appeler `initialize()` (App et/ou `LoginForm`) — sinon le bouton reste sur « Connexion... ».
- **Guest-first** : sans JWT valide, `initialize` → refresh cookie puis `loginAsGuest`. Pas de mock admin Vite / bypass DEV UI.
- **`/login`** : accessible en guest (ne pas rediriger les `role === 'guest'` vers `/`). Writer/admin déjà authentifiés → redirect `/`.
- **Logs** : ne pas POSTer `/api/v1/logs/frontend` sans `access_token` (endpoint JWT → 401 bruit prod).
- **E2E vs prod** : Playwright force souvent `DISABLE_AUTH=true` pour les seeds ; le backend **honore quand même** un Bearer JWT valide (guest / login) pour que cold `/login` reste testable. Sans token → mock admin.
- **Preuve** : Vitest `LoginForm.boot.test.tsx` + `App.auth-boot.test.tsx` ; E2E `npm run test:e2e:auth` (cold `/login` → « Se connecter » enabled). Changement auth → cette commande avant merge.