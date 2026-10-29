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
## Invité = lecture seule (règle produit)

Le mode invité existe pour **montrer** l'application à quelqu'un sans lui créer de
compte. Un invité **ne doit rien écrire sur le serveur** : ni créer, ni modifier, ni
supprimer, ni déclencher une génération. Toute la lecture lui reste ouverte.

**Obligation** : chaque handler qui mute un état serveur appelle `require_non_guest(current_user)`
(`api/dependencies.py`) en **première instruction**, avant toute autre logique.

```python
def create_template(..., current_user: ... = Depends(get_current_user)):
    """Crée un template. Réservé aux comptes."""
    require_non_guest(current_user)
    ...
```

⚠️ **Ne pas conditionner la garde au contenu de la requête.** La première version
n'appliquait le statut privé que si le client omettait `visibility` — un invité qui
posait `"visibility": "shared"` explicitement publiait donc à toute l'équipe. Une garde
qui dépend de ce que déclare un acteur anonyme ne garde rien. Le refus se décide sur le
**rôle**, jamais sur le corps.

⚠️ **La validation Pydantic passe avant le handler.** Un corps malformé répond 422 sans
jamais atteindre `require_non_guest`. Ce n'est pas une faille (rien n'est écrit), mais un
test qui vérifie le refus doit envoyer un corps **valide**, sinon il constate un 422 et
croit avoir testé la garde.

**Preuve** : `tests/api/test_guest_read_only.py` — paramétré sur la liste des mutations,
plus un test qui vérifie que la lecture reste ouverte. Une route d'écriture ajoutée sans
garde-fou fait échouer la suite.

**Périmètre couvert à ce jour** : `api/routers/templates.py` et `api/routers/author_profiles.py`.
Le reste de l'API (documents, graphe, presets, flags, sync GDD) compte encore des routes
d'écriture sans cette garde — antérieures à cette règle, à traiter séparément.
