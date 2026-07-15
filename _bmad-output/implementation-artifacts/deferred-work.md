- source_spec: `_bmad-output/implementation-artifacts/spec-7-2-se-connecter-et-se-deconnecter.md`
  summary: Rendre `get_current_user_or_none` compatible avec les overrides imbriqués de dépendances FastAPI.
  evidence: La fonction appelle directement `get_current_user`, ce qui peut ignorer un override de test de cette dépendance; le comportement existait avant la story et n'est pas requis par le flux utilisateur 7.2.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-2-se-connecter-et-se-deconnecter.md`
  summary: Isoler les fixtures d'application et de container pour permettre une exécution pytest réellement parallèle.
  evidence: `tests/conftest.py` partage `app.state.container` et les overrides globaux entre tests; cette dette de harness est préexistante et les suites actuelles s'exécutent séquentiellement.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-2-se-connecter-et-se-deconnecter.md`
  summary: Garantir atomiquement qu'une désactivation concurrente ne puisse pas se produire entre la vérification du compte et la signature d'un token.
  evidence: Login et refresh lisent l'état actif puis signent le token sans verrou transactionnel; la désactivation persistée appartient à la story 7.3.
