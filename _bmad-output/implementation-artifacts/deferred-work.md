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
  summary: Rebuild FTS shadow/swap + reset statut running stale au boot + backfill auto corpus existant.
  evidence: Revues 8.6 — clear_all pendant rebuild vide l'index ; crash laisse running ; pas de reindex au startup.
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

- source_spec: `_bmad-output/implementation-artifacts/spec-8-8-valider-batch-dialogues-fr87.md`
  summary: Persister le polling job batch-validate hors page bibliotheque pour toast de fin apres navigation.
  evidence: Revue 8.8 — hook monte dans UnityDialogueList ; demontage coupe le poll.
- source_spec: `_bmad-output/implementation-artifacts/spec-8-8-valider-batch-dialogues-fr87.md`
  summary: Owner job guest base sur session UUID (eviter partage entre guests).
  evidence: Edge-case — username guest partage ; read/cancel cross-session possible.
