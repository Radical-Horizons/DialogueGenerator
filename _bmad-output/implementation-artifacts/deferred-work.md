- source_spec: `_bmad-output/implementation-artifacts/spec-7-2-se-connecter-et-se-deconnecter.md`
  summary: Rendre `get_current_user_or_none` compatible avec les overrides imbriquÃ©s de dÃ©pendances FastAPI.
  evidence: La fonction appelle directement `get_current_user`, ce qui peut ignorer un override de test de cette dÃ©pendance; le comportement existait avant la story et n'est pas requis par le flux utilisateur 7.2.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-2-se-connecter-et-se-deconnecter.md`
  summary: Isoler les fixtures d'application et de container pour permettre une exÃ©cution pytest rÃ©ellement parallÃ¨le.
  evidence: `tests/conftest.py` partage `app.state.container` et les overrides globaux entre tests; cette dette de harness est prÃ©existante et les suites actuelles s'exÃ©cutent sÃ©quentiellement.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-2-se-connecter-et-se-deconnecter.md`
  summary: Garantir atomiquement qu'une dÃ©sactivation concurrente ne puisse pas se produire entre la vÃ©rification du compte et la signature d'un token.
  evidence: Login et refresh lisent l'Ã©tat actif puis signent le token sans verrou transactionnel; la dÃ©sactivation persistÃ©e appartient Ã  la story 7.3.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-3-administrateurs-gerent-les-utilisateurs.md`
  summary: Corriger les exemples historiques du contrat d'authentification qui utilisent encore `email` et omettent `expires_in`.
  evidence: L'Ã©cart entre `docs/api/api-contracts-api.md` et `api/schemas/auth.py` prÃ©cÃ©dait l'US 7.3 et ne concerne pas le parcours de gestion des utilisateurs.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-5-invites-lecture-seule-sans-compte-fr68.md`
  summary: Liens invitÃ©s par dialogue (`share_links`, token URL) â€” **hors intÃ©rÃªt produit** (rÃ©tro Epic 7, 2026-07-20). Ne pas replanifier ; lâ€™invitÃ© retenu est uniquement la session app-wide lecture seule.
  evidence: DÃ©cision Project Lead en rÃ©trospective ; FR68 epic-07 historique obsolÃ¨te.
  status: cancelled
- source_spec: `_bmad-output/implementation-artifacts/spec-7-5-invites-lecture-seule-sans-compte-fr68.md`
  summary: Appliquer `require_non_guest` de faÃ§on systÃ©matique Ã  tous les POST mÃ©tier restants (config write, presets, GDD sync, quality LLM) plutÃ´t quâ€™aux seuls chemins gÃ©nÃ©ration/mutation document.
  evidence: La revue 7.5 a durci generate-node, streaming jobs, unity-dialogue et save-and-write ; dâ€™autres routes authentifiÃ©es restent appelables par un JWT guest sans Ã©crire de documents.

- source_spec: `_bmad-output/implementation-artifacts/spec-7-7-voir-qui-a-acces-a-chaque-dialogue-fr70.md`
  summary: DÃ©couper les requÃªtes `IN (...)` de comptage de shares au-delÃ  de la limite de paramÃ¨tres SQLite.
  evidence: Revue 7.7 â€” une bibliothÃ¨que trÃ¨s large pourrait faire Ã©chouer le listing Unity ; hors MVP (3â€“5 users).
- source_spec: `_bmad-output/implementation-artifacts/spec-7-7-voir-qui-a-acces-a-chaque-dialogue-fr70.md`
  summary: RafraÃ®chir `share_count` / badges liste aprÃ¨s invite ou rÃ©vocation depuis le panneau ou la modal.
  evidence: Revue 7.7 â€” le panneau se met Ã  jour localement mais la liste conserve l'ancien compte jusqu'au prochain fetch.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-7-voir-qui-a-acces-a-chaque-dialogue-fr70.md`
  summary: PiÃ¨ge de focus / restauration focus pour DialoguePermissionsPanel (et alignement SharingModal).
  evidence: Revue 7.7 â€” `aria-modal` seul ; mÃªme dette que la modal Partager 7.6.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-7-voir-qui-a-acces-a-chaque-dialogue-fr70.md`
  summary: Ã‰tendre la grille responsive toolbar UnityDialogueEditor pour Permissions + Partager en layout narrow.
  evidence: Revue 7.7 â€” zones CSS historiques Ã  4 actions ; boutons supplÃ©mentaires peuvent crÃ©er des lignes implicites.

- source_spec: `_bmad-output/implementation-artifacts/spec-7-8-audit-logs-actions-utilisateurs-fr71.md`
  summary: Ã€ la suppression d'un dialogue, Ã©mettre aussi des `dialogue.share.revoked` pour les co-Ã©diteurs orphelins (CASCADE SQLite).
  evidence: Revue 7.8 â€” `delete_document` journalise seulement `dialogue.deleted` ; les lignes `dialogue_shares` disparaissent sans entrÃ©e revoke.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-8-audit-logs-actions-utilisateurs-fr71.md`
  summary: RÃ©duire le bruit d'audit des `dialogue.saved` (autosaves / writes frÃ©quents) via actions distinctes create vs update ou sampling.
  evidence: Revue 7.8 â€” chaque write rÃ©ussie produit une ligne ; acceptable MVP mais noie les Ã©vÃ©nements sÃ©curitÃ©.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-8-audit-logs-actions-utilisateurs-fr71.md`
  summary: Durcir l'append-only `audit_logs` (triggers SQLite / droits) au-delÃ  de l'absence d'API mutante.
  evidence: Revue 7.8 â€” la convention repository n'empÃªche pas un DELETE SQL direct.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-8-audit-logs-actions-utilisateurs-fr71.md`
  summary: Snapshot transactionnel COUNT+SELECT pour pagination audit sous Ã©critures concurrentes.
  evidence: Revue 7.8 â€” total et page peuvent diverger briÃ¨vement ; hors charge MVP 3â€“5 users.

- source_spec: `_bmad-output/implementation-artifacts/spec-7-9-preferences-utilisateur-synchronisees-serveur.md`
  summary: Course TOCTOU multi-onglets sur la migrate localStorage â†’ serveur (GET puis PUT des clÃ©s absentes).
  evidence: Revue 7.9 â€” un second client peut peupler le serveur entre GET et PUT migrate ; acceptable best-effort MVP.

- source_spec: `_bmad-output/implementation-artifacts/spec-guest-first-auth-entry.md`
  summary: Retirer le short-circuit axios refresh token sous `import.meta.env.DEV` dans `frontend/src/api/client.ts`.
  evidence: PrÃ©existant ; exposÃ© par guest-first + DISABLE_AUTH=false â€” refresh JWT mid-session toujours skippÃ© en Vite DEV.
- source_spec: `_bmad-output/implementation-artifacts/spec-guest-first-auth-entry.md`
  summary: Exercer le parcours guest-first en Playwright (DISABLE_AUTH=false + storageState) au lieu de forcer true dans webServer.env.
  evidence: Exception Ask First volontaire ; l'entrÃ©e guest + Connexion n'est pas couverte E2E aujourd'hui.

- source_spec: `_bmad-output/implementation-artifacts/spec-silent-unity-model-migration.md`
  summary: Ajouter un test d'intÃ©gration boot draft gpt-5.4 + store sol sans bandeau.
  evidence: Revue Quick Dev â€” seuls des unitaires isolÃ©s couvrent detect/store ; le parcours loadDraft+sync n'est pas exercÃ© bout-en-bout.
- source_spec: `_bmad-output/implementation-artifacts/spec-silent-unity-model-migration.md`
  summary: Couvrir tous les littÃ©raux LEGACY_MODEL_ID_MAP (pas seulement gpt-5.4) dans les tests.
  evidence: Revue â€” la map a 7 entrÃ©es ; un seul littÃ©ral est assertÃ©.

- source_spec: `_bmad-output/implementation-artifacts/spec-openrouter-aion-models.md`
  summary: Rollback transactionnel complet create/patch/delete entre llm_config et llm_pricing (pricing OSError aprÃ¨s delete catalogue).
  evidence: Edge Case Hunter â€” Ã©tats partiels possibles hors chemin create dÃ©jÃ  rollbackÃ© ; rare en single-process file I/O.
- source_spec: `_bmad-output/implementation-artifacts/spec-openrouter-aion-models.md`
  summary: Validation stricte du provider localStorage et message explicite si bascule modÃ¨le Unity silencieuse.
  evidence: Edge Case Hunter â€” pattern de fallback dÃ©jÃ  utilisÃ© pour GPT-5.6 ; hors scope MVP OpenRouter.

- source_spec: `_bmad-output/implementation-artifacts/spec-8-2-rechercher-dialogues-fr81.md`
  summary: Recherche de dialogues insensible aux accents (Â« uresair Â» â†’ Â« UresaÃ¯r Â») en normalisant les diacritiques cÃ´tÃ© filtre.
  evidence: Revues adversarial + edge-case â€” pour un jeu FR Ã  noms accentuÃ©s, l'utilisateur tape sans accents ; la spec 8.2 ne couvre que l'insensibilitÃ© Ã  la casse. Valeur rÃ©elle, mais au-delÃ  du pÃ©rimÃ¨tre MVP figÃ©.
- source_spec: `_bmad-output/implementation-artifacts/spec-8-2-rechercher-dialogues-fr81.md`
  summary: Afficher un extrait surlignÃ© de la rÃ©plique quand un dialogue matche uniquement via son contenu (search_text), pas via nom/personnage.
  evidence: Revue adversarial â€” un rÃ©sultat de recherche par rÃ©plique s'affiche sans indice visible de la raison du match ; lisibilitÃ© de la recherche, proche du panneau mÃ©tadonnÃ©es 8.7.

- source_spec: `_bmad-output/implementation-artifacts/spec-8-3-filtrer-dialogues-date-auteur-fr82.md`
  summary: ModÃ©liser et exposer un statut Ã©ditorial de dialogue (ValidÃ© / En cours / Brouillon) pour le filtre FR82.
  evidence: Story 8.3 MVP â€” aucune source persistÃ©e (ni dialogues_index, ni JSON Unity, ni API) ; tags nÅ“ud et validationMode ne conviennent pas. NÃ©cessite schÃ©ma + UI d'Ã©dition avant le filtre statut.

- source_spec: `_bmad-output/implementation-artifacts/spec-8-5-creer-collections-dossiers-dialogues-fr84.md`
  summary: Bornes / lots pour document_ids (limite paramètres SQLite) et transaction unique validation+insert membership.
  evidence: Revues adversarial + edge-case — volumes MVP faibles ; IntegrityError concurrent non traduit.
- source_spec: `_bmad-output/implementation-artifacts/spec-8-5-creer-collections-dossiers-dialogues-fr84.md`
  summary: Éviter N+1 list_document_ids et séquencer listCollections (génération de requête) sous refresh concurrent.
  evidence: Revue adversarial — perf / race UI hors MVP 8.5.
- source_spec: `_bmad-output/implementation-artifacts/spec-8-5-creer-collections-dossiers-dialogues-fr84.md`
  summary: Couverture RTL complète des AC UI (ajout batch?filtre, 2 badges+clic, rename/delete toast) et refresh collections après delete dialogue.
  evidence: Verification-gap — couvert API + hook + manager create ; parcours liste intégrés reportés.

- source_spec: `_bmad-output/implementation-artifacts/spec-8-6-indexer-dialogues-recherche-rapide-fr85.md`
  summary: Rebuild FTS shadow/swap + backfill auto corpus existant.
  evidence: Revues 8.6 — clear_all pendant rebuild vide l'index ; pas de reindex auto au startup pour peupler un corpus jamais indexé.
# RESOLVED 2026-08-11 — reset statut running stale au boot
# - source_spec: spec-8-6 … crash laissait rebuild_status='running' en base (CAS durable),
#   bloquant tout futur POST /reindex en 409 permanent jusqu'à intervention manuelle.
#   Fix : services/repositories/sqlite/bootstrap.py::_reset_stale_dialogue_search_rebuild,
#   appelé depuis initialize_database() juste après les migrations. Tests :
#   tests/services/repositories/sqlite/test_bootstrap.py.
- source_spec: `_bmad-output/implementation-artifacts/spec-8-6-indexer-dialogues-recherche-rapide-fr85.md`
  summary: Sur-fetch RBAC multi-pages et lock multi-workers reindex ; enrichir réponse search de métadonnées légères.
  evidence: LIMIT FTS avant filtre accès ; garde app.state mono-processus.

- source_spec: `_bmad-output/implementation-artifacts/spec-8-7-afficher-metadonnees-dialogue-fr86.md`
  summary: Afficher un statut éditorial (Validé / En cours / Brouillon) dans le panneau métadonnées FR86.
  evidence: Décision A1 ? aucun champ persisté ; déjà différé en 8.3 pour le filtre. Nécessite schéma + UI d?édition avant affichage.
- source_spec: `_bmad-output/implementation-artifacts/spec-8-7-afficher-metadonnees-dialogue-fr86.md`
  summary: Historique détaillé des modifications d?un dialogue dans le panneau métadonnées.
  evidence: AC epic renvoie à Story 10.5 ; MVP 8.7 se limite à last_modified_by + username.

- source_spec: `_bmad-output/implementation-artifacts/spec-8-7-afficher-metadonnees-dialogue-fr86.md`
  summary: Requete couts LLM ciblee par document_ids (eviter get_all_dialogues_costs a chaque listing).
  evidence: Revue 8.7 — filtrage wanted apres scan global ; corpus usage_*.json toujours lu en entier.
- source_spec: `_bmad-output/implementation-artifacts/spec-8-7-afficher-metadonnees-dialogue-fr86.md`
  summary: Distinguer JSON illisible (422) dun dialogue inaccessible (404) sur GET metadata.
  evidence: Edge-case — _read_document leve NotFound ; listing garde l item avec node_count None.
- source_spec: `_bmad-output/implementation-artifacts/spec-8-7-afficher-metadonnees-dialogue-fr86.md`
  summary: Clarifier en UI cout/noeud document vs avg cout/generation du breakdown 1.12.
  evidence: Adversarial — deux semantiques cote a cote ; FR86 calcule sur count_nodes JSON.

# RESOLVED 2026-08-04 — store app-level ``batchValidationJobStore`` + toastManager
# - source_spec: `_bmad-output/implementation-artifacts/spec-8-8-valider-batch-dialogues-fr87.md`
#   summary: Persister le polling job batch-validate hors page bibliotheque pour toast de fin apres navigation.
#   evidence: Revue 8.8 — hook monte dans UnityDialogueList ; demontage coupe le poll.
# RESOLVED 2026-08-04 — guest JWT ``sid`` + job_owner_key(`guest:{sid}`) ; tests IDOR
# - source_spec: spec-8-8 … Owner job guest base sur session UUID
# RESOLVED 2026-08-11 — revue PR #68 avant merge (voir aussi RESOLVED 8-6 ci-dessus) :
#   cost gate ×N recalculé server-side sur N réel (api/routers/graph_generation.py
#   ::_check_batch_budget_or_raise) au lieu du header client X-Batch-Parent-Count ;
#   double-soumission UI corrigée (submittingRef + disabled bouton) dans
#   useBatchGenerateFromNodes.ts/useBatchDialogueValidation.ts ; cleanup périodique
#   des jobs batch expirés (api/services/in_memory_batch_job_manager.py, base
#   commune factorisée entre BatchValidationJobManager et
#   BatchNodeGenerationJobManager — résout aussi la duplication job-manager
#   signalée en revue).

- source_spec: `_bmad-output/implementation-artifacts/spec-8-9-generer-batch-noeuds-depart-fr88.md`
  summary: Persistance/reprise des jobs batch (validation FR87 + génération FR88) — actuellement en mémoire process pur.
  evidence: |
    Revue sécurité PR #68 (2026-08-11) — un redémarrage serveur en cours de job
    (validation ou génération) fait disparaître silencieusement l'entrée : le
    client qui poll reçoit un 404 nu, sans distinction avec un job inexistant,
    et sans indication qu'un lot de 10-500 items a été interrompu à mi-parcours.
    Sans risque de perte de données pour la validation (idempotente, lecture
    seule), mais la génération mute l'état du graphe par parent sans
    checkpoint de ce qui a déjà réussi — un retry naïf après crash peut
    dupliquer des nœuds déjà générés pour les parents traités avant le crash.
    Nécessite un store durable (SQLite) + reprise/reconciliation au niveau
    service, hors scope d'un correctif ciblé pré-merge.
- source_spec: `_bmad-output/implementation-artifacts/spec-8-1-lister-tous-les-dialogues-fr80.md`
  summary: Extraire `list_unity_dialogues` (api/routers/unity_dialogues.py) vers un service de listing dédié.
  evidence: |
    Revue backend PR #68 (2026-08-11) — le handler fait le glob fichier, le
    parsing JSON par item, le cache owner_username et l'orchestration
    tri/pagination directement dans le router (~230 lignes), contrairement à
    la convention `backend_api.md` ("Routers = routes uniquement"). Fonctionnel
    et testé (voir `tests/api/test_unity_dialogues_list_counts.py`), mais un
    refactor vers `dialogue_metadata_service.py` (ou un nouveau
    `dialogue_listing_service.py`) est plus sûr en isolation, avec sa propre
    passe de tests, qu'inséré dans un correctif de revue déjà large.
- source_spec: `_bmad-output/implementation-artifacts/spec-8-9-generer-batch-noeuds-depart-fr88.md`
  summary: Factoriser la boucle séquentielle "should_cancel → remplir le reste en cancelled" dupliquée entre `batch_node_generation_service.py::generate_batch` et `batch_validation_service.py::validate_batch`.
  evidence: Revue backend PR #68 (2026-08-11) — même pattern d'annulation/progression sur deux services aux items et rapports différents ; à factoriser avec précaution (pas de comportement partagé pour le moment, juste la structure de boucle).

- source_spec: `_bmad-output/implementation-artifacts/spec-refonte-ui-phases-4-8.md`
  summary: Éditeur de graphe — remplacer les 7 panneaux flottants (validation/schéma/quality-llm/ai-slop/coût) par un inspecteur à onglets fixe 300px piloté par un seul state `inspectorTab`, en gardant `FlowSimulationPanel`/`GraphContextDroppingPanel`/`GameSystemsIntegrationPanel` en modales.
  evidence: Split au checkpoint spec (2883 tokens, >1600) — le doc de design le qualifie lui-même de "plus gros PR — à faire seul" ; ≥15 fichiers de test référencent les 5 booléens actuels (`showValidationPanel` etc.) et devront être mis à jour.
  status: done (commit ef62e00af — inspecteur 300px `uiLayoutStore.inspectorTab`)
- source_spec: `_bmad-output/implementation-artifacts/spec-refonte-ui-phases-4-8.md`
  summary: Toolbar de l'éditeur de graphe — collapser 3 rangées (`GraphToolbarStatusRow` ×2 + `GraphToolbarToolsRow`) en une seule, badges couleur → point + libellé mono.
  evidence: Split au checkpoint spec — dépend structurellement du goal inspecteur (même zone, même PR logique côté doc de design).
  status: done (commit 3723d78d7 — rangée 46px, seuil dédié 980px, fix ResizeObserver StrictMode)
- source_spec: `_bmad-output/implementation-artifacts/spec-refonte-ui-phases-4-8.md`
  summary: Restyle visuel `DialogueNode`/`EndNode`/`TestNode` (bordures par état, typo mono/serif) via la fonction de précédence de validation déjà partagée (`getValidationHighlightKind`).
  evidence: Split au checkpoint spec — cohérent à traiter avec l'inspecteur de graphe (même famille de composants) plutôt que dans le même spec que le streaming inline.
  status: done (commit ae62d5008 — bordures neutres, pieds mono, plaques FIN/TEST)
- source_spec: `_bmad-output/implementation-artifacts/spec-refonte-ui-phases-4-8.md`
  summary: États responsive — mode écriture (`⌘\`/`ctrl+\`, deux colonnes en rail 52px), tiroir bas plafonné 60vh à ≤1024px (nouvelle variante `side: 'bottom'` sur `NarrowOverlayDrawer`), nouveau store `uiLayoutStore`.
  evidence: Split au checkpoint spec — touche à la fois l'écran de génération et l'éditeur de graphe ; mieux traité une fois les deux zones stabilisées visuellement.
  status: done — 2c complet (header minimal, rails 52px à puces, barre de pied unique) et 2d complet (barre basse `PromptBudgetBottomDrawer` entre 1024 et 1200px, colonne droite repliée pour éviter le doublon).

- source_spec: `docs/design/refonte-ui-2026/etats-2a-2e.dc.html` (bloc 2d)
  summary: À ≤1024px, transformer le panneau droit « Ce qui part au modèle » en barre repliable au-dessus de la barre d'action (variante `side: 'bottom'` de `NarrowOverlayDrawer`, plafond 60vh).
  evidence: Vérifié navigateur (août 2026) : à 1024px l'app garde déjà 3 colonnes conformes (GDD ~212px, colonne 600px, panneau droit avec TOTAL visible) — l'essentiel de 2d (« le total reste toujours visible ») est satisfait ; la barre basse est un raffinement, à faire avec les tests FR119/FR120 des drawers.
  status: done — livré le 2026-08-05, vérifié à 1100px (total visible replié, détail sous le plafond 60vh, colonne droite absente) et à 1400px (retour à la colonne).

- source_spec: `_bmad-output/implementation-artifacts/spec-refonte-ui-phases-4-8.md`
  summary: Écran 2b — le bouton « Variante » par option n'est PAS une fonctionnalité neuve : il correspond à la Story 1.10 (FR10, régénérer avec instructions ajustées), déjà implémentée via `RegenerateNodeModal`. À recâbler sur la nouvelle UI, pas à réécrire. Idem « Éditer » (Story 1.4, accepter/rejeter inline).
  evidence: Relevé dans `_bmad-output/planning-artifacts/epics/epic-01.md` (Story 1.7 duplication FR7, Story 1.10 régénération FR10). Seule la génération de N options SIMULTANÉES reste sans support backend (`GenerateUnityDialogueResponse` est one-shot) — c'est le seul point qui coûterait N appels LLM.
  status: done — décision utilisateur (2026-08-04) : appels multiples autorisés, parallèles, plafonnés. Implémenté frontend-only : `generationOptionsStore` (plafond `MAX_GENERATION_OPTIONS=4`, N-1 jobs `createGenerationJob` supplémentaires chacun avec son EventSource — le backend n'exécute un job que quand son stream est réclamé), comparaison `GenerationOptionsComparison` (Garder / Variante / Réessayer), sélecteur ×N dans la barre d'action, interruption qui annule aussi les jobs d'arrière-plan. Vérifié en live : 2 appels parallèles réels, 2 OPTIONS SUR 2 — À COMPARER, Garder pousse le résultat.


- source_spec: `docs/design/refonte-ui-2026/etats-2a-2e.dc.html` (bloc 2b)
  summary: **Proposition produit à évaluer — « comparer des variantes », pas seulement les afficher.** Trois briques, dans cet ordre de dépendance : (1) une variante par **modèle** au lieu de N tirages du même ; (2) **évaluation automatique** de chaque variante ; (3) disposition **côte à côte**. La 3 est de l'UI, mais elle n'a d'intérêt que si 1 et/ou 2 existent : lire en parallèle N sorties du même modèle avec les mêmes réglages n'apprend rien de plus que les lire l'une après l'autre.
  evidence: |
    Origine : lien « vue côte à côte » présent dans la maquette 2b, dont l'écran n'a
    jamais été dessiné — la maquette le liste elle-même en « À TRANCHER »
    (`etats-2a-2e.dc.html`, bloc de notes). Discussion utilisateur 2026-08-06 : la
    disposition seule n'est pas le sujet, la comparaison de modèles + l'évaluation
    auto le sont. Reconnu comme **conception applicative**, pas travail d'UI.

    Ce qui existe déjà et ne serait pas à réécrire :
    - Génération de N variantes en parallèle : `generationOptionsStore`
      (`MAX_GENERATION_OPTIONS=4`, un job + un EventSource par variante).
      **Limite** : toutes les variantes rejouent le même `lastRequest` — même
      modèle, mêmes réglages ; seul l'échantillonnage LLM les distingue.
    - Juge LLM **déjà implémenté** (Story 4.7 / FR42) : `LLMQualityJudgeService`,
      `POST /api/v1/graph/evaluate-dialogue-quality`, panneau `GraphQualityLlmPanel`
      (onglet QUALITÉ de l'inspecteur 2e). L'endpoint prend `nodes`/`edges` **et un
      `llm_model_identifier` optionnel** — il est sans état, donc utilisable sur une
      variante fraîchement générée sans travail backend.
    - Diagnostic déterministe par variante : `generationOptionDiagnostics`
      (longueur vs cible, réponses portant test/flag/coût, flags posés, fiches
      citées vs envoyées).

    Ce qui manque réellement : un `request` **par variante** au lieu d'un par lot
    (aujourd'hui `startRun(count, request)` en stocke un seul), le choix du modèle
    par variante côté UI, et le câblage variante → juge (+ affichage du score dans
    la colonne Diagnostic).

    À vérifier avant de planifier : l'utilisateur développe un **mode benchmark sur
    une autre branche** (mentionné le 2026-08-06). Recouvrement probable avec la
    brique 1 — ne pas concevoir en double, partir de ce qui y est déjà décidé.
  related: Epic 4 Story 4.7 (juge LLM, livré) · Epic 1 Story 1.10 (régénérer une
    variante, livré et recâblé sur le bouton « Variante » de 2b).
  status: proposal — à évaluer, non planifié. Ne pas traiter comme un écart
    d'implémentation de la refonte UI : la maquette ne définit pas cet écran.

- source_spec: `docs/design/refonte-ui-2026/etats-2a-2e.dc.html` (bloc 2b, colonne Diagnostic)
  summary: Lignes de diagnostic qualitatives (« ton demandé : tenu », « mensonge possible », « répétition détectée ») — voir la proposition ci-dessus, dont elles sont la brique 2.
  evidence: Les lignes calculables sont livrées (longueur vs cible, réponses mécaniques, flags, fiches citées / envoyées inutilement). Les jugements demandent une évaluation par modèle — le service existe (`LLMQualityJudgeService`), il n'est simplement pas branché sur les variantes de génération. Coût N× à arbitrer, et vocabulaire à trancher : « variante » est aujourd'hui le libellé d'une **action** (relancer une option seule), pas de l'objet.

- source_spec: `_bmad-output/implementation-artifacts/spec-audit-rendu-ui.md`
  summary: Le test de régression d'ancrage de la barre d'action lit `parent.style.overflow` — le style **inline**. Il deviendrait muet si le défilement passait un jour en classe CSS.
  evidence: Relevé en revue (angle verification-gap). Acceptable aujourd'hui car `GenerationPanel` style tout en inline, mais la garantie est liée à ce choix d'implémentation plutôt qu'au comportement. `getComputedStyle` serait plus robuste ; il retourne des valeurs peu fiables en jsdom, d'où le compromis actuel. À revoir si le panneau migre vers des classes.

- source_spec: none
  summary: Story 6.2 — Sauvegarder, éditer et supprimer les templates (FR56).
  evidence: Split de l'épic 6 au kickoff quick-dev — 6.1 pose la création ; l'édition et la suppression sont un livrable CRUD distinct.
- source_spec: none
  summary: Story 6.3 — Appliquer un template à la génération (FR57).
  evidence: Split de l'épic 6 — chargement snapshot + hydratation des champs de génération, indépendant de la création.
- source_spec: none
  summary: Story 6.4 — Fournir les templates pré-built Alteir (FR58).
  evidence: Split de l'épic 6 — catalogue lecture seule, dépend du modèle et de l'application (6.1/6.3).
- source_spec: none
  summary: Story 6.5 — Configurer l'anti-context-dropping (explicite vs subtil) (FR59).
  evidence: Split de l'épic 6 — règles de validation à la génération, distinctes de la sauvegarde d'un template custom.
- source_spec: none
  summary: Story 6.6 — Parcourir le marketplace de templates (V1.5+, FR60).
  evidence: Split de l'épic 6 — phase V1.5+, hors noyau V1.
- source_spec: none
  summary: Story 6.7 — A/B tester les templates et scorer la qualité (V2.5+, FR61).
  evidence: Split de l'épic 6 — phase V2.5+, hors noyau V1.
- source_spec: none
  summary: Story 6.8 — Partager les templates avec les membres de l'équipe (FR62).
  evidence: Split de l'épic 6 — s'appuie sur les identités Epic 7 ; hors scope de la création locale.
- source_spec: none
  summary: Story 6.9 — Suggérer des templates selon le scénario (FR63).
  evidence: Split de l'épic 6 — ranking contextuel, dépend de la liste et de l'application (6.1/6.3).

- source_spec: `_bmad-output/implementation-artifacts/spec-6-1-1-creer-templates-custom-generation-dialogue-fr55.md`
  summary: Story 6.1.2 — Filtrer les templates custom par nom, catégorie ou contexte GDD (FR55).
  evidence: Split token de 6.1 — la création + liste groupée est 6.1.1 ; le filtre est un livrable UI distinct (spec `spec-6-1-2-filtrer-templates-nom-categorie-contexte-fr55.md`).

- source_spec: `_bmad-output/implementation-artifacts/spec-6-1-1-creer-templates-custom-generation-dialogue-fr55.md`
  summary: Le nettoyage lazy des refs GDD obsolètes ne filtre que `characters` et `locations`, pas `region` / `subLocation` / `contextSelections` (même limite que les presets).
  evidence: Revue 6.1.1 (edge-case-hunter) — `template_service.py` copie le strip de `PresetService.create_preset` ; un ID obsolète hors ces deux listes reste dans le snapshot malgré les warnings. À traiter avec le même correctif presets, pas seulement templates.

## Deferred from: code review of spec-6-1-1 + spec-6-1-2 (2026-08-16)

- source_spec: `_bmad-output/implementation-artifacts/spec-6-1-1-creer-templates-custom-generation-dialogue-fr55.md`
  summary: Strip GDD lazy seulement `characters`/`locations` (pas region / subLocation / contextSelections) — confirmé en revue combinée 6.1.1+6.1.2 ; même limite presets.
  evidence: `services/template_service.py` ~L91 ; déjà au ledger après la revue 6.1.1.

- source_spec: `_bmad-output/implementation-artifacts/spec-6-3-appliquer-templates-a-generation-dialogue-fr57.md`
  summary: Enregistrer le `template_id` dans les logs de génération (Story 1.15 / AC épic 6.3).
  evidence: Choix 3A au kickoff 6.3 — un livrable distinct (pipeline génération + UI logs) ; 6.3 se limite à hydrater le formulaire.
