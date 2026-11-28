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

# RESOLVED 2026-11-12 — état des jobs persisté en JSON atomique
#   (data/batch_jobs/*.json, InMemoryBatchJobManager(storage_path=…)) à chaque
#   transition et à chaque item terminé (on_item = point de reprise par
#   parent/document) ; au démarrage, un job queued/running devient
#   ``interrupted`` sans relance automatique (aucune dépense LLM implicite) ;
#   le polling renvoie ``interrupted`` + rapport partiel (id inconnu = 404,
#   autre propriétaire = 404) ; reprise via ``resume_job_id`` ou en repostant
#   le même lot : seuls les parents restants sont générés et comptés par le
#   cost gate, 409 si le job tourne encore ; front : polling tolérant aux
#   pannes passagères, modale « Lot interrompu » + bouton « Reprendre », le
#   rapport fusionné n'est appliqué qu'une fois (pas de nœud en double).
#   JSON plutôt que SQLite : états courts (TTL 1 h), imbriqués, sans requête,
#   même procédé que les autres états locaux. Tests :
#   tests/api/test_batch_jobs_restart.py, batchNodeGenerationJobStore.test.ts.
# - source_spec: spec-8-9 … Persistance/reprise des jobs batch (FR87 + FR88)
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
  evidence: Livré en patch 2026-08-16 — `template_id` / `template_name` annotés à generate/regenerate, exposés dans GET generation-logs et le panneau Logs.

- source_spec: `_bmad-output/implementation-artifacts/spec-6-5-configurer-templates-anti-context-dropping-subtilite-lore-vs-explicite-fr59.md`
  summary: Overlay `tolerance: null` retombe sur le seuil du fichier 4.10 via le merge options existant.
  evidence: Revue 6.5 — `_context_dropping_options_to_data` ne distingue pas « null explicite » d’« omit » ; la spec demande de réutiliser ce merge.

- source_spec: `_bmad-output/implementation-artifacts/spec-6-5-configurer-templates-anti-context-dropping-subtilite-lore-vs-explicite-fr59.md`
  summary: Toast GraphEditor du warning post-detect non couvert par un test de montage GraphEditor.
  evidence: Revue 6.5 — le store et generationSlice sont testés ; monter GraphEditor pour l’effet toast est hors budget T1.

- source_spec: `_bmad-output/implementation-artifacts/spec-6-8-partager-templates-avec-membres-équipe-fr62.md`
  summary: Un writer désactivé avec un JWT encore valide continue de lire les templates partagés (list_template_ids ne joint pas users.is_active).
  evidence: Revue 6.8 — grant refuse is_active=0, mais can_read ignore ce flag ; la spec ne dit la cible active qu’à l’invite.

- source_spec: `_bmad-output/implementation-artifacts/spec-6-8-partager-templates-avec-membres-équipe-fr62.md`
  summary: POST /ab-test résout encore les UUID custom sans ACL 6.8 (guest peut lancer un A/B sur le live d’un autre writer).
  evidence: Revue 6.8 — brancher require_readable casse les tests 6.7 (guest A/B sur templates d’un autre compte, 400 N invalide avant 404 UUID). Ask First : scoping 6.6/6.7 par user. Never : ne pas casser 6.7.

- source_spec: `_bmad-output/implementation-artifacts/spec-6-9-suggérer-templates-basés-sur-scénario-dialogue-fr63.md`
  summary: Pagination GDD page 1 / alias de noms — un PNJ hors de la première page n’a pas sa fiche dans `contextStore.characters` donc pas de `rencontre_initiale`.
  evidence: Revue 6.9 — 3B = fiches déjà dans le store ; le trou est préexistant ContextSelector (`setElementLists`), pas un bug du scorer.
- source_spec: `_bmad-output/implementation-artifacts/spec-fix-event-loop-blocking-context-endpoints.md`
  summary: `GddNotionSyncService._sync_progress` (dict d'état muté par `_sync_progress_update`) est maintenant écrit depuis des threads workers (`_apply_staging_despite_errors`, l'écriture par source, `_promote_and_finalize`, tous déportés en v3) pendant que `read_sync_progress()` continue de le lire depuis la boucle event via le polling de statut — aucune synchronisation ajoutée alors que la docstring de la méthode suppose un seul thread.
  evidence: Revue à 3 lentilles (edge-case-hunter) sur la spec v3. Risque borné : lecture partiellement incohérente d'un dict de progression affiché en UI, pas de donnée durable corrompue. Correctif proposé : `threading.Lock` autour de `_sync_progress_update`/`read_sync_progress`.
- source_spec: `_bmad-output/implementation-artifacts/spec-fix-event-loop-blocking-context-endpoints.md`
  summary: Sur les ~17-18 sites `asyncio.to_thread` de la spec v3, seuls 2 (`estimate_context_tokens`, `gdd-content-fingerprint`) ont un test dédié qui mesure réellement le non-blocage (requête légère concurrente à un mock bloquant). Les autres sont couverts par des tests fonctionnels ordinaires qui passeraient identiquement si le `to_thread` disparaissait par erreur dans un futur refactor.
  evidence: Revue à 3 lentilles (verification-gap) sur la spec v3, cross-check exhaustif des 17-18 sites contre les tests existants.
- source_spec: `_bmad-output/implementation-artifacts/spec-fix-event-loop-blocking-context-endpoints.md`
  summary: `tests/test_context_builder_concurrency.py::test_build_context_json_falls_back_without_lock_on_contention` simule l'écriture concurrente via `with builder._reload_lock:` directement plutôt que par un vrai `load_gdd_files()` (patché pour bloquer sur un `threading.Event`) — le repli sans verrou n'est donc jamais prouvé contre la mutation multi-étapes réelle que `load_gdd_files()` documente.
  evidence: Revue à 3 lentilles (verification-gap) sur la spec v3.
- source_spec: `_bmad-output/implementation-artifacts/spec-fix-event-loop-blocking-context-endpoints.md`
  summary: `api/routers/context_build.py::precomputed_entity_tokens` appelle `lookup_precomputed_entity_tokens` (chemin `_build_context_item`, pas `build_context_json`/`load_gdd_files`) en synchrone direct, non déporté — hors périmètre déclaré de la spec v3 (qui n'audite que les deux méthodes `ContextBuilder` nommées) mais un cache-miss froid après sync GDD pourrait bloquer la boucle event de façon comparable.
  evidence: Revue à 3 lentilles (adversarial) sur la spec v3.
- source_spec: `_bmad-output/implementation-artifacts/spec-fix-event-loop-blocking-context-endpoints.md`
  summary: `api/routers/presets.py` (3 endpoints `def` non-async) et `api/container.py:get_context_builder` restent sûrs uniquement parce que Starlette auto-threadpoole les handlers non-async — mécanisme implicite jamais testé/documenté comme contrat. Un futur passage accidentel en `async def` réintroduirait un appel bloquant direct sans qu'aucun test ne le détecte.
  evidence: Revue à 3 lentilles (adversarial) sur la spec v3. Correctif proposé : test de régression asserting ces endpoints restent `def`, ou lint AST dédié.
- source_spec: `_bmad-output/implementation-artifacts/spec-fix-event-loop-blocking-context-endpoints.md`
  summary: `services/dialogue_generation_service.py::_build_context_summary` appelle encore `build_context_json` en synchrone direct — code mort en production (aucun appelant réel, seulement 4 tests unitaires), non déporté ni supprimé.
  evidence: Revue à 3 lentilles (adversarial) sur la spec v3. À trancher : supprimer (code mort) ou déporter si un futur appelant est prévu.

- source_spec: `_bmad-output/planning-artifacts/epics/epic-06.md`
  summary: Rendre atomique l'écriture des profils d'auteur, et aligner la gestion d'erreurs de leur routeur sur celui des templates.
  evidence: `AuthorProfileService._save()` fait un `write_text` direct là où `TemplateService` passe par un fichier temporaire puis `replace()`. Une interruption laisse un JSON tronqué. `update_author_profile` et `delete_author_profile` n'ont pas les `except OSError`/`PermissionError` de leurs équivalents templates.
- source_spec: `_bmad-output/planning-artifacts/epics/epic-06.md`
  summary: Sortir `_FLAG_NOMS_CACHE` du niveau module et l'invalider après une resync GDD.
  evidence: `services/template_suggestion_service.py` cache la liste des flags dans un global chargé une fois par process. Une sync Notion ne le rafraîchit pas : le scoring « rencontre initiale » travaille sur une liste potentiellement obsolète jusqu'au redémarrage. Contraire à la règle DI du dépôt (pas de singleton global).
- source_spec: `_bmad-output/planning-artifacts/epics/epic-06.md`
  summary: Retirer les schémas Pydantic orphelins du marketplace et faire remonter les erreurs des routeurs templates/profils via `api/exceptions.py`.
  evidence: Neuf classes de `api/schemas/template.py` (partage nominatif, marketplace) n'ont plus d'appelant ; `VALID_SOURCES` accepte encore `"marketplace"`. Les deux routeurs lèvent des `HTTPException` brutes, donc leurs 500 ne remontent pas à Sentry et perdent leur code structuré — ce qui a retardé la détection de deux bloquants.
- source_spec: `_bmad-output/implementation-artifacts/spec-ai-conversation-noeud-dialogue.md`
  summary: Relier à leur dialogue les nœuds générés avant que celui-ci ait un nom de fichier (START de « Générer », brouillon non sauvegardé), pour qu'on puisse discuter avec l'IA qui les a produits.
  evidence: Le front n'envoie `dialogue_id` que si `dialogueMetadata.filename` existe (`frontend/src/store/slices/generationSlice.ts:248`) et « Générer » crée START avant que le dialogue existe : aucun record n'est annoté, la conversation renvoie 404 `generation_trace_not_found`. À traiter avec le front (renvoyer les `call_id` par nœud et les rattacher à la première sauvegarde).
- source_spec: `_bmad-output/implementation-artifacts/spec-ai-conversation-noeud-dialogue.md`
  summary: Sous `DISABLE_AUTH=true`, l'admin factice `{"id": "1"}` n'existe pas dans `users` : créer une conversation IA (comme une collection) lève une `IntegrityError` de clé étrangère, donc un 500.
  evidence: `ai_conversations.owner_id` et `collections.owner_id` référencent `users(id)` avec `foreign_keys=ON` ; `get_current_user` renvoie l'id `"1"` sans jeton quand l'auth est désactivée (`api/routers/auth.py:143-149`). Dev uniquement, défaut applicatif `DISABLE_AUTH=false`.
- source_spec: none
  summary: Story 20.1, second volet — conversion `parse`/`serialize` (blocs didascalie/réplique avec positions `start`/`end`, `*` non fermé gardé en texte) qui remplace `splitDialogueLine` dans `DialogueLineText` et l'estimation de hauteur de `dagreLayout.ts`, avec l'aller-retour `serialize(parse(x)) === x` sur les fixtures et le script local.
  evidence: Découpée le 2026-11-26 à la demande de l'auteur : la story exige que le golden d'export soit committé seul, depuis le code actuel, avant tout changement ; le golden (premier volet) part dans sa propre PR et protège ce second volet.
  status: done (`spec-20-1b-parse-serialize-blocs.md`) — `frontend/src/utils/dialogueLineBlocks.ts` (`parseDialogueLine` / `serializeDialogueBlocks`) remplace `splitDialogueLine` ; aller-retour en CI (`dialogueLineRoundTrip.test.ts`) et sur les dialogues réels (`node scripts/dialogue-roundtrip-local.cjs`).
- source_spec: `_bmad-output/implementation-artifacts/spec-20-1a-golden-export-unity.md`
  summary: Export bloqué pour trois des cinq fixtures — forgeron, Plis d'ossements et Nef centrale ont des ids de nœud que le schéma Unity refuse (`NODE_…_CHOICE_N`, uuid nu) : `validate-schema` répond `is_valid: false`, donc « Exporter » s'arrête sur « export bloqué » dans tous les modes (le hook valide avant de choisir sa branche), et `save-and-write` répond 422 `VALIDATION_ERROR` (golden `python-graphe/*.error.txt`). Seul le lot (`skip_validation=True`) les exporte. À corriger dans une PR à part, avant 20.8, jamais dans 20.8.
  evidence: Schéma `docs/resources/dialogue-format.schema.json` : `id` ∈ {`END`, `START`, `^(node|manual)-[a-zA-Z0-9_-]+$`} ; `useUnityExport.ts:67-82` appelle `validateSchema` avant les branches invité / `documentId` / `save-and-write` ; contrôle du 2026-11-26 : `POST /graph/validate-schema` sur les trois corps `front-payload` renvoie une erreur `champ 'id'` chacun.
  status: done (PR `fix/export-unity-golden-ecarts`) — le schéma accepte les ids `NODE_…` de l'ancien générateur (story 0.5.5, plus produits), sans réécrire aucun id ; forgeron et Plis s'exportent. Nef centrale : refus voulu (artefact de l'ancien stockage `data/interactions/`, dialogue entier en chaîne dans `line`), golden inchangé.
- source_spec: `_bmad-output/implementation-artifacts/spec-20-1a-golden-export-unity.md`
  summary: Export `save-and-write` (« Exporter » d'un dialogue sans `documentId`) — toutes les issues d'un choix testé (une à quatre) sont perdues et le choix part vers `END`. Visible sur Voknir (6 choix, export accepté) ; sur le forgeron (3 choix) et les Plis d'ossements (4 choix, dont 2 à une seule issue) l'export est d'abord bloqué par les ids hors schéma (entrée précédente) et le défaut réapparaîtra dès que ces ids passeront. Le défaut est dans le corps envoyé par le front, pas dans le rendu Python ; `validate-schema` reçoit le même corps. À corriger dans une PR à part, avant 20.8, jamais dans 20.8.
  evidence: `buildGraphApiPayload` (`frontend/src/utils/buildGraphApiPayload.ts:51`) recopie `id`, `source`, `target`, `type`, `label`, `data` des arêtes mais pas `sourceHandle` (golden `front-payload`) ; `GraphConversionService._rebuild_connections` (`services/graph_conversion_service.py`, seconde passe) n'attribue `test*Node` qu'aux arêtes issues d'un TestNode qui portent un `sourceHandle`. Contrôle fait le 2026-11-26 : en reposant `sourceHandle` sur les arêtes `test-node-…` du corps Voknir, `graph_to_unity_json_content` rend bien les quatre issues.
  status: done (PR `fix/export-unity-golden-ecarts`) — `buildGraphApiPayload` recopie `sourceHandle` ; `python-graphe` rend les issues comme le lot (test `buildGraphApiPayload.test.ts`).
- source_spec: `_bmad-output/implementation-artifacts/spec-20-1a-golden-export-unity.md`
  summary: Choix à la fois testé et ciblé (`test` + `targetNode`) — trois sorties pour le même choix : le lot garde la cible, `front-canonique` la retire, `save-and-write` (`python-graphe`) la remplace par `END` (6 choix sur Voknir, 4 sur L'offre sous les braises, dont la cible valait déjà `END` ; ces deux exports sont acceptés). À trancher : la cible d'un choix testé a-t-elle un sens pour Unity ? À corriger dans une PR à part, avant 20.8, jamais dans 20.8.
  evidence: Front : `documentToGraph` ne crée l'arête de cible que pour un choix sans test (`frontend/src/utils/documentToGraph.ts:204`) et `graphToDocument` supprime `targetNode` dès que `test` est posé (`:349`). Python graphe : `graph_to_unity_json` retire `targetNode` puis `_rebuild_connections` ignore l'arête vers le TestNode ; `_clean_choice` (`services/unity_export_normalizer.py:125`) pose `END`. Lot : `preserve_source_fields=True` (`services/batch_export_service.py:119`) garde la cible.
  status: done (PR `fix/export-unity-golden-ecarts`, jugé voulu) — les 4 issues routent un choix testé ; sa `targetNode` n'est que le champ requis par le schéma (`END`). Le lot garde la cible d'une source jamais rééditée (`preserve_source_fields`) ; « Exporter » sauvegarde d'abord, donc sert `END`. Le chemin `front-canonique` n'est plus téléchargé.
- source_spec: `_bmad-output/implementation-artifacts/spec-20-1a-golden-export-unity.md`
  summary: Normalisation Unity appliquée par les chemins Python seulement — `front-canonique` (et l'invité) exportent sans `normalize_unity_export_document` : flags bruts (`MetGrish` contre `METGRISH` côté lot), `influenceDelta`/`respectDelta` à `null` (26 sur le forgeron, 15 sur les Plis), `condition: ""`, choix vides `__idx_N` conservés avec `targetNode: "END"` ; à l'inverse le normaliseur pose `targetNode: "END"` sur les choix testés (43 sur le forgeron, 21 sur les Plis, par le lot), que le front laisse sans cible. Un même document donne donc deux fichiers Unity différents selon le chemin ; sur le forgeron et les Plis, « Exporter » est de toute façon bloqué par les ids hors schéma et l'écart se voit par l'export par lot. À corriger dans une PR à part, avant 20.8, jamais dans 20.8.
  evidence: `exportToUnity` (`frontend/src/store/slices/persistenceSlice.ts:701`) = `graphToDocument` + retrait de `status`, sans autre nettoyage ; Python : `normalize_unity_export_document` appelé par `graph_to_unity_json` (`services/graph_conversion_service.py:375`) et par `write_unity_dialogue_to_file` (`services/unity_dialogue_export_service.py:217`). Comparer `expected/front-canonique/` et `expected/python-lot/` du forgeron.
  status: done (PR `fix/export-unity-golden-ecarts`) — « Exporter » d'un dialogue enregistré (menu et aperçu) sauvegarde par révision puis sert `GET /dialogues/{id}/preview-export`, identique octet pour octet au lot (golden `python-apercu`). `exportToUnity` reste la projection que l'autosave persiste. Invité : copie du document tel que stocké, voulu (pas d'accès à `preview-export`).
- source_spec: `_bmad-output/implementation-artifacts/spec-20-1a-golden-export-unity.md`
  summary: Le normaliseur de flags efface les lettres accentuées au lieu de les translittérer — `Grish_Allié_et_Accord_Forgé` devient `GRISH_ALLI_ET_ACCORD_FORG`, `RéparationImparfaite` devient `R_PARATIONIMPARFAITE` (forgeron, export par lot ; `save-and-write` refuse ce dialogue avant, ids hors schéma). Deux flags qui ne diffèrent que par un accent fusionneraient. À corriger dans une PR à part, avant 20.8, jamais dans 20.8.
  evidence: `_normalize_unity_flag_token` (`services/unity_export_normalizer.py:48`) remplace tout `[^A-Za-z0-9_]+` par `_` sans `unicodedata.normalize("NFKD")` préalable.
  status: done (PR `fix/export-unity-golden-ecarts`) — NFKD avant le remplacement : `REPARATIONIMPARFAITE`, `GRISH_ALLIE_ET_ACCORD_FORGE`. Un flag déjà exporté sous l'ancienne forme change de nom à la prochaine exportation.
- source_spec: `_bmad-output/implementation-artifacts/spec-20-1a-golden-export-unity.md`
  summary: Un choix vide `__idx_N` est retiré par les chemins Python même quand il porte un `test` et des `traitRequirements` — le nœud `manual-e23d…` du forgeron (5 choix testés sans texte ni cible) sort sans `choices` par l'export par lot (`save-and-write` refuse ce dialogue avant, ids hors schéma). Le front les garde. À corriger dans une PR à part, avant 20.8, jamais dans 20.8.
  evidence: `_is_placeholder_choice` (`services/unity_export_normalizer.py:83`) ne regarde que `choiceId`, `text` et `targetNode`, ni `test`, ni `traitRequirements`, ni `test*Node`.
  status: done (PR `fix/export-unity-golden-ecarts`, jugé voulu) — sans texte ni cible, ces choix feraient des boutons vides dans Unity ; la Santé signale déjà le nœud (« contenu vide »).
- source_spec: `_bmad-output/implementation-artifacts/spec-20-1a-golden-export-unity.md`
  summary: Métadonnées hors nœuds et métadonnées éditeur traitées différemment selon le chemin — le lot garde `title`, `status`, `contextGddHash`, `lastGenerationInstructions`, `gddContextSelectionsSnapshot` ; `front-canonique` ne retire que `status` et perd le `title` du document (Voknir) ; `save-and-write` retire toutes les métadonnées éditeur (L'offre sous les braises, export accepté). À aligner sur une seule liste dans une PR à part, avant 20.4 (qui ajoute `scene`), jamais dans 20.4.
  evidence: `graphToDocument` renvoie `{ schemaVersion: '1.1.0', nodes }` (`frontend/src/utils/documentToGraph.ts:425`) ; `graph_to_unity_json` retire cinq champs éditeur (`services/graph_conversion_service.py:353`) ; lot : `preserve_source_fields=True` (`services/batch_export_service.py:119`).
  note: (PR `fix/export-unity-golden-ecarts`) l'aperçu servi par « Exporter » garde, comme le lot, `title` et les métadonnées éditeur ; reste `python-graphe` qui les retire. Toujours à aligner avant 20.4.
- source_spec: `_bmad-output/implementation-artifacts/spec-20-1a-golden-export-unity.md`
  summary: Golden du chemin lot avec la validation activée (défaut de `POST /dialogues/batch-export`), pas seulement `skip_validation=True`.
  evidence: `api/schemas/dialogue.py:606-609` (défaut `False`) et `services/batch_export_service.py:109` ; un validateur durci refuserait des dialogues réels sans que `python-lot` ne change. Gèlerait des `.error.txt` : à faire avec la PR qui règle les écarts entre chemins.
  status: done (PR `fix/export-unity-golden-ecarts`) — chemin `python-lot-valide` ; Nef centrale figée en refus, les quatre autres identiques à `python-lot`.
- source_spec: `_bmad-output/implementation-artifacts/spec-20-1a-golden-export-unity.md`
  summary: Étendre le contrôle local des dialogues d'`Assets/Dialogue/` aux chemins front (`front-canonique`, `front-invite`, `front-payload`), que 20.8 et 20.4 réécrivent.
  evidence: `scripts/golden-export-local.py` ne passe que par `python-lot` ; les chemins front ne sont contrôlés que sur 5 fixtures. À reprendre avec le script local du volet 2 de 20.1 (`parse`/`serialize`).
- source_spec: `_bmad-output/implementation-artifacts/spec-20-1a-golden-export-unity.md`
  summary: Ajouter au golden, avant 20.8, une fixture écrite sous le modèle actuel (réponses uniques, test = 4 issues) avec au moins une issue à `END`.
  evidence: Sur les 5 fixtures, 13 choix testés seulement portent des issues, dont 6 sur Voknir (import Notion hors modèle) ; aucune issue ne vaut `END`. C'est précisément ce que 20.8 risque de perdre.
- source_spec: `_bmad-output/implementation-artifacts/spec-20-1a-golden-export-unity.md`
  summary: (non vérifié, medium si vrai) « Exporter depuis l'aperçu » d'un dialogue déjà enregistré enverrait `document_id` à `save-and-write`, qui répond 409 `canonical_revision_required`.
  evidence: `frontend/src/hooks/useUnityExportPreview.ts:102-106` et `:193` n'ont pas la branche `documentId` de `useUnityExport.ts:98-110` ; route `api/routers/graph_io.py:277-283`. À trancher en lançant l'aperçu sur un dialogue persisté.
  status: done (PR `fix/export-unity-golden-ecarts`) — reproduit dans l'app (409 `canonical_revision_required` affiché brut) ; l'aperçu passe par `exportPersistedUnityDocument` comme « Export Unity » (test `useUnityExportPreview.test.ts`).

- source_spec: `_bmad-output/implementation-artifacts/spec-20-2-preuve-performance-cartes-360.md`
  summary: Propager la décision de la story 20.2 à `.claude/rules/ui_refonte_scene.md`, à A9 de `docs/architecture/refonte-scene-architecture.md` et au plan de tests de l'epic 20, une fois confirmée par l'auteur.
  evidence: Ces trois documents décrivent encore les cartes de 360 px comme attendues ; la règle est injectée dans chaque build de l'epic 20.
  status: sans objet — la reprise de 20.2 conclut au plan A (360 px), ce que ces documents décrivent déjà.

- source_spec: `_bmad-output/implementation-artifacts/spec-20-2-preuve-performance-cartes-360.md`
  summary: La story 20.7 doit retirer ou reprendre le prototype 20.2 (carte 360 px, drapeaux localStorage, clés `nodesLR`, voies courtes `patchLineOnly` et glisser).
  evidence: Code livré derrière un drapeau sans interface ; les voies courtes doublent la synchronisation document et layout, et des `nodesLR` peuvent exister dans des layouts enregistrés. La reprise de 20.2 y ajoute, sous le même marqueur, les positions du glisser hors du store (`graphViewStore.dragPositions`), le journal et la validation différés (`utils/quietWork.ts`), la copie d'annulation (`utils/cloneJson.ts`) et la réutilisation des nœuds du canvas (`utils/reuseUnchanged.ts`).

- source_spec: `_bmad-output/implementation-artifacts/spec-20-2-preuve-performance-cartes-360.md`
  summary: Le journal IndexedDB du graphe (ADR-006) n'est relu par aucun code de production ; chaque modification y lit puis réécrit tout le graphe.
  evidence: `readDocument` de `frontend/src/utils/graphJournal.ts` n'est appelé que par son test ; au profil de 20.2, ces écritures pesaient 28 à 50 ms de fil principal par modification à 500 répliques (hors prototype, inchangé).

- source_spec: `_bmad-output/implementation-artifacts/spec-20-2-preuve-performance-cartes-360.md`
  summary: (non vérifié) Le harnais de perf échoue par intermittence à l'ouverture du premier passage (« Graphe non affiché en 90 s »).
  evidence: 2 échecs sur 4 essais du passage « avant 1 » (build de référence), puis 1 sur le passage « après 1 » du build mesuré ; jamais aux passages 2 à 5. La page reste sur la liste des dialogues, sans canvas. Reste à établir si c'est le harnais (serveur froid) ou l'ouverture par `/graph-editor/{id}`.

- source_spec: `_bmad-output/implementation-artifacts/spec-20-2-preuve-performance-cartes-360.md`
  summary: Pendant un glisser, le prototype tient les positions hors de `useGraphStore` ; la story 20.7 doit confirmer ou annuler cet écart à ADR-007.
  evidence: `graphViewStore.dragPositions`, appliquées par `GraphCanvas` seul et écrites au lâcher par `moveNodes` ; l'écart n'est consigné que dans la spec de la story 20.2.

- source_spec: `_bmad-output/implementation-artifacts/spec-20-3-tokens-en-variables-css-theme-nuit.md`
  summary: Couleurs encore en dur, à passer en tokens avec la story 20.16 (thème Papier) ; tant qu'elles le restent, un second jeu de valeurs sous `:root[data-theme="…"]` ne les change pas.
  evidence: Au 2026-11-28, 394 littéraux (`#…`, `rgb(`) hors tests et hors `tokenValues.ts` dans 97 fichiers de `frontend/src` : 8 feuilles CSS (172, surtout `usage/*.css`, `ExportLogsPanel.css`, `index.css`), 85 composants (166), `theme.ts` (50, dont le fond de l'app `#17171b`, repris aussi par `index.css` et `App.css`) et 3 autres fichiers (6, dont les 4 couleurs des issues de test, `TEST_RESULT_EDGE_COLORS` dans `utils/graphEdgeBuilders.ts`). Redéfinir `--dg-surface-base` ne change donc pas le fond des écrans 1c et 2e. Hors de ce compte, les concaténations d'alpha sur `theme.ts` (`ContextSelectionBudgetBar`, `GenerationPanelControls`) casseraient avec des `var()`.

- source_spec: `_bmad-output/implementation-artifacts/spec-20-3-tokens-en-variables-css-theme-nuit.md`
  summary: L'export PNG/SVG du graphe n'embarque pas les polices de l'app en production, sauf quand une `<style>` d'un composant est montée par hasard.
  evidence: `html-to-image` 1.11.13 (`embed-webfonts.js`, `getCSSRules`) ne peut pas lire la feuille Google Fonts (autre origine) et insère les `@font-face` dans la première feuille en ligne, sinon dans `styleSheets[0]`, où l'insertion échoue : l'image sort en Georgia et police système. Mesuré sur le build de production en rendant la feuille des tokens visible (9 787 pixels d'écart, polices de l'app). 20.3 garde le comportement (feuille adoptée). Correctif probable : passer `fontEmbedCSS` calculé par l'app, ou héberger les polices.

- source_spec: `_bmad-output/implementation-artifacts/spec-20-3-tokens-en-variables-css-theme-nuit.md`
  summary: Des documents désignent encore `redesignTokens.ts` comme siège des valeurs ; depuis 20.3 elles sont dans `theme/tokenValues.ts`.
  evidence: `epic-18.md` (ajouter les tokens de focus « dans `redesignTokens.ts` » créerait une valeur non publiée), `design-system-foundation.md` (ligne 21), `.claude/rules/ui_redesign_2026.md`, `docs/design/refonte-scene/README.md` § 10. Différé : la correction touche une règle d'agent.
