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
  summary: Liens invités par dialogue (`share_links`, token URL) — **hors intérêt produit** (rétro Epic 7, 2026-07-20). Ne pas replanifier ; l’invité retenu est uniquement la session app-wide lecture seule.
  evidence: Décision Project Lead en rétrospective ; FR68 epic-07 historique obsolète.
  status: cancelled
- source_spec: `_bmad-output/implementation-artifacts/spec-7-5-invites-lecture-seule-sans-compte-fr68.md`
  summary: Appliquer `require_non_guest` de façon systématique à tous les POST métier restants (config write, presets, GDD sync, quality LLM) plutôt qu’aux seuls chemins génération/mutation document.
  evidence: La revue 7.5 a durci generate-node, streaming jobs, unity-dialogue et save-and-write ; d’autres routes authentifiées restent appelables par un JWT guest sans écrire de documents.

- source_spec: `_bmad-output/implementation-artifacts/spec-7-7-voir-qui-a-acces-a-chaque-dialogue-fr70.md`
  summary: Découper les requêtes `IN (...)` de comptage de shares au-delà de la limite de paramètres SQLite.
  evidence: Revue 7.7 — une bibliothèque très large pourrait faire échouer le listing Unity ; hors MVP (3–5 users).
- source_spec: `_bmad-output/implementation-artifacts/spec-7-7-voir-qui-a-acces-a-chaque-dialogue-fr70.md`
  summary: Rafraîchir `share_count` / badges liste après invite ou révocation depuis le panneau ou la modal.
  evidence: Revue 7.7 — le panneau se met à jour localement mais la liste conserve l'ancien compte jusqu'au prochain fetch.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-7-voir-qui-a-acces-a-chaque-dialogue-fr70.md`
  summary: Piège de focus / restauration focus pour DialoguePermissionsPanel (et alignement SharingModal).
  evidence: Revue 7.7 — `aria-modal` seul ; même dette que la modal Partager 7.6.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-7-voir-qui-a-acces-a-chaque-dialogue-fr70.md`
  summary: Étendre la grille responsive toolbar UnityDialogueEditor pour Permissions + Partager en layout narrow.
  evidence: Revue 7.7 — zones CSS historiques à 4 actions ; boutons supplémentaires peuvent créer des lignes implicites.

- source_spec: `_bmad-output/implementation-artifacts/spec-7-8-audit-logs-actions-utilisateurs-fr71.md`
  summary: À la suppression d'un dialogue, émettre aussi des `dialogue.share.revoked` pour les co-éditeurs orphelins (CASCADE SQLite).
  evidence: Revue 7.8 — `delete_document` journalise seulement `dialogue.deleted` ; les lignes `dialogue_shares` disparaissent sans entrée revoke.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-8-audit-logs-actions-utilisateurs-fr71.md`
  summary: Réduire le bruit d'audit des `dialogue.saved` (autosaves / writes fréquents) via actions distinctes create vs update ou sampling.
  evidence: Revue 7.8 — chaque write réussie produit une ligne ; acceptable MVP mais noie les événements sécurité.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-8-audit-logs-actions-utilisateurs-fr71.md`
  summary: Durcir l'append-only `audit_logs` (triggers SQLite / droits) au-delà de l'absence d'API mutante.
  evidence: Revue 7.8 — la convention repository n'empêche pas un DELETE SQL direct.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-8-audit-logs-actions-utilisateurs-fr71.md`
  summary: Snapshot transactionnel COUNT+SELECT pour pagination audit sous écritures concurrentes.
  evidence: Revue 7.8 — total et page peuvent diverger brièvement ; hors charge MVP 3–5 users.

- source_spec: `_bmad-output/implementation-artifacts/spec-7-9-preferences-utilisateur-synchronisees-serveur.md`
  summary: Course TOCTOU multi-onglets sur la migrate localStorage → serveur (GET puis PUT des clés absentes).
  evidence: Revue 7.9 — un second client peut peupler le serveur entre GET et PUT migrate ; acceptable best-effort MVP.

- source_spec: `_bmad-output/implementation-artifacts/spec-guest-first-auth-entry.md`
  summary: Retirer le short-circuit axios refresh token sous `import.meta.env.DEV` dans `frontend/src/api/client.ts`.
  evidence: Préexistant ; exposé par guest-first + DISABLE_AUTH=false — refresh JWT mid-session toujours skippé en Vite DEV.
- source_spec: `_bmad-output/implementation-artifacts/spec-guest-first-auth-entry.md`
  summary: Exercer le parcours guest-first en Playwright (DISABLE_AUTH=false + storageState) au lieu de forcer true dans webServer.env.
  evidence: Exception Ask First volontaire ; l'entrée guest + Connexion n'est pas couverte E2E aujourd'hui.

- source_spec: `_bmad-output/implementation-artifacts/spec-silent-unity-model-migration.md`
  summary: Ajouter un test d'intégration boot draft gpt-5.4 + store sol sans bandeau.
  evidence: Revue Quick Dev — seuls des unitaires isolés couvrent detect/store ; le parcours loadDraft+sync n'est pas exercé bout-en-bout.
- source_spec: `_bmad-output/implementation-artifacts/spec-silent-unity-model-migration.md`
  summary: Couvrir tous les littéraux LEGACY_MODEL_ID_MAP (pas seulement gpt-5.4) dans les tests.
  evidence: Revue — la map a 7 entrées ; un seul littéral est asserté.

- source_spec: `_bmad-output/implementation-artifacts/spec-openrouter-aion-models.md`
  summary: Rollback transactionnel complet create/patch/delete entre llm_config et llm_pricing (pricing OSError après delete catalogue).
  evidence: Edge Case Hunter — états partiels possibles hors chemin create déjà rollbacké ; rare en single-process file I/O.
- source_spec: `_bmad-output/implementation-artifacts/spec-openrouter-aion-models.md`
  summary: Validation stricte du provider localStorage et message explicite si bascule modèle Unity silencieuse.
  evidence: Edge Case Hunter — pattern de fallback déjà utilisé pour GPT-5.6 ; hors scope MVP OpenRouter.

- source_spec: none
  summary: CLI benchmark (run, reprise, re-jugement, export de rapport) sur les mêmes services/endpoints que l'API.
  evidence: Découpage de l'intent « mode Benchmark » (spec EQ-Bench) — dépend du noyau backend+API traité en premier.
- source_spec: none
  summary: UI benchmark — 3 écrans (configuration avec estimation de coût, suivi de run, rapport) + comparateurs existants en vue détaillée.
  evidence: Découpage de l'intent « mode Benchmark » — dépend du noyau backend+API et de ses endpoints asynchrones.
- source_spec: none
  summary: Capture depuis l'usage réel — bouton « ajouter au jeu de test » sur une génération dans l'app.
  evidence: Découpage de l'intent « mode Benchmark » — nécessite le modèle de données des suites livré par le noyau.

- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-core-engine.md`
  summary: Jugement benchmark (rubrique + pairwise, grille de critères en donnée, contrôles anti-biais, re-jugement sans régénération) — `services/benchmark_judge_service.py`, `services/benchmark_criteria_store.py`.
  evidence: Spec noyau (3392 tokens) au-dessus du plafond 1600 — découpage en specs séparées ; dépend du moteur de run et de ses `BenchmarkGenerationRecord`.
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-core-engine.md`
  summary: Classement (solveur Elo/Bradley-Terry avec incertitude) et rapport benchmark (agrégats, mesures déterministes, export) — `services/benchmark_ranking_service.py`, `services/benchmark_report_service.py`, endpoints `/report`, `/rejudge`.
  evidence: Spec noyau (3392 tokens) au-dessus du plafond 1600 — découpage en specs séparées ; dépend des verdicts du jugement.

- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-core-engine.md`
  summary: Porte `flags` du benchmark sémantiquement fausse — `analyze_dialogue_flag_references` cherche les déclarations dans `dialogueFlags` à la racine du document, absent d'un fragment généré.
  evidence: Revue adversariale, reproduit à l'exécution — une génération portant une `visibilityConditions` valide ressortirait `invalid`. Inerte aujourd'hui (le schéma exposé au LLM n'a aucun champ de condition), bloquante à tort dès que les conditions seront générables.
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-core-engine.md`
  summary: Coût non comptabilisé quand une génération échoue après le retour du LLM (l'orchestrateur n'émet `metadata` que sur le chemin nominal).
  evidence: Edge-case hunter — l'appel est facturé mais le record porte 0 USD ; le cumul du run sous-estime la dépense réelle. Correction au niveau de l'orchestrateur, hors périmètre de cette spec.
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-core-engine.md`
  summary: Figer une copie de la suite dans le répertoire du run pour qu'une édition concurrente ne rende pas la reprise impossible.
  evidence: Edge-case hunter — un `PUT` ou `DELETE` sur la suite pendant un run coûteux rend ses résultats partiels définitivement non reprenables (409/404).
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-core-engine.md`
  summary: `save_suite` fait un read-modify-write non verrouillé sur la version ; deux écritures concurrentes perdent une mise à jour.
  evidence: Edge-case hunter — deux contenus différents peuvent porter le même numéro de version. Faible probabilité (usage admin), mais perte définitive.
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-core-engine.md`
  summary: Collision d'identifiants de suite insensible à la casse sous Windows (`Suite-A` écrase `suite-a`).
  evidence: Edge-case hunter — le garde-fou du routeur compare les identifiants en respectant la casse et ne voit pas la collision.
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-core-engine.md`
  summary: Un échec d'écriture disque d'un record fait basculer tout le run en `failed` au lieu d'isoler la cellule.
  evidence: Edge-case hunter — `write_json_atomic` peut lever (disque plein, verrou antivirus) ; une seule cellule non écrivable abandonne toutes les suivantes.
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-core-engine.md`
  summary: Porte de langue — une sortie courte (< 40 caractères) est acceptée sans examen, y compris en anglais.
  evidence: Edge-case hunter — « Hello there, what do you want? » passe via le détecteur `too_short`. Abaisser le seuil produirait des faux positifs : arbitrage à instruire.
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-core-engine.md`
  summary: `require_admin` fabrique un admin factice quand `DISABLE_AUTH=true` en développement — il garde désormais des endpoints qui dépensent du budget LLM réel.
  evidence: Revue adversariale — préexistant, mais l'enjeu change : sur un poste servant sur `0.0.0.0:4243`, n'importe quoi sur le réseau local peut lancer un run facturé.
