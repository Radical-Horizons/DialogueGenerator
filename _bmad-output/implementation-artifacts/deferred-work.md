- source_spec: `_bmad-output/implementation-artifacts/spec-7-2-se-connecter-et-se-deconnecter.md`
  summary: Rendre `get_current_user_or_none` compatible avec les overrides imbriqués de dépendances FastAPI.
  evidence: La fonction appelle directement `get_current_user`, ce qui peut ignorer un override de test de cette dépendance; le comportement existait avant la story et n'est pas requis par le flux utilisateur 7.2.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-2-se-connecter-et-se-deconnecter.md`
  summary: Isoler les fixtures d'application et de container pour permettre une exécution pytest réellement parallèle.
  evidence: `tests/conftest.py` partage `app.state.container` et les overrides globaux entre tests; cette dette de harness est préexistante et les suites actuelles s'exécutent séquentiellement.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-2-se-connecter-et-se-deconnecter.md`
  summary: Garantir atomiquement qu'une désactivation concurrente ne puisse pas se produire entre la vérification du compte et la signature d'un token.
  evidence: Login et refresh lisent l'état actif puis signent le token sans verrou transactionnel; la désactivation persistée appartient à la story 7.3.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-3-administrateurs-gerent-les-utilisateurs.md`
  summary: Corriger les exemples historiques du contrat d'authentification qui utilisent encore `email` et omettent `expires_in`.
  evidence: L'écart entre `docs/api/api-contracts-api.md` et `api/schemas/auth.py` précédait l'US 7.3 et ne concerne pas le parcours de gestion des utilisateurs.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-5-invites-lecture-seule-sans-compte-fr68.md`
  summary: Liens invités par dialogue (`share_links`, token URL, lecture d’un dialogue ciblé) — FR68 tel que rédigé dans epic-07.
  evidence: L’intent produit de la 7.5 a été recentré sur un mode invité applicatif (démo UI hors projet) ; le partage par lien n’est plus dans le scope de cette spec.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-5-invites-lecture-seule-sans-compte-fr68.md`
  summary: Appliquer `require_non_guest` de façon systématique à tous les POST métier restants (config write, presets, GDD sync, quality LLM) plutôt qu’aux seuls chemins génération/mutation document.
  evidence: La revue 7.5 a durci generate-node, streaming jobs, unity-dialogue et save-and-write ; d’autres routes authentifiées restent appelables par un JWT guest sans écrire de documents.
