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
  status: done
  resolution: "Livré par `spec-benchmark-admin-ui.md` — onglet Benchmark de /admin. Le comparateur détaillé de duels (raisonnements des deux sens) reste hors périmètre."
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-admin-ui.md`
  summary: Déclencher les passes de jugement (rubrique et duels) depuis l'UI benchmark, au lieu de curl.
  evidence: Le lot UI couvre générer/suivre/lire ; noter reste un appel REST, ce qui coupe la boucle en deux pour l'utilisateur.
  status: done
  resolution: "Section « Noter ce run » livrée le 2026-08-09 — le différé était une erreur de découpage : « générer et ne pas noter n'a aucun intérêt » (utilisateur).
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-admin-ui.md`
  summary: Comparateur détaillé de duels — raisonnements des deux sens côte à côte pour un cas donné.
  evidence: Le rapport agrège les duels en bilan G/N/P ; l'audit d'un duel précis passe encore par `GET /runs/{id}/pairwise`.
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

- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-judging.md`
  summary: Jambe pairwise du jugement — comparaison de deux générations d'un même cas, jugée dans les deux sens sous étiquettes opaques tournantes, avec troncature commune annoncée au juge et agrégation des deux verdicts.
  evidence: Spec jugement à 3245 tokens (plafond 1600) — découpée ; la jambe pairwise se greffe sur la grille, le prompt de juge et la passe reprenable livrés par la rubrique, sans les modifier. Son consommateur (le classement Elo/Bradley-Terry) est lui-même déjà différé.

- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-judging.md`
  summary: Rétention des versions de grille de critères — `save_grid` écrase le fichier, et une grille supprimée puis recréée repart en version 1, si bien que `(grid_id, version)` n'identifie pas une définition dans le temps.
  evidence: Revue adversariale + edge-case hunter. Conséquence neutralisée à court terme par le `criteria_snapshot` figé dans chaque verdict, mais l'identité de grille reste ambiguë pour toute comparaison inter-runs.
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-judging.md`
  summary: Contrôle de concurrence optimiste sur l'écriture des grilles et des suites (`If-Match` / `expected_version`) — deux éditions concurrentes perdent silencieusement la première.
  evidence: Revue adversariale — read-modify-write non verrouillé dans `save_grid` et `save_suite`. Faible probabilité en usage admin mono-utilisateur, perte définitive si elle survient.
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-judging.md`
  summary: Normalisation tolérante des identifiants de critères renvoyés par le juge (casse, espaces, accents) avant appariement strict.
  evidence: Edge-case hunter — un juge qui répond `Voice_Fidelity` fait échouer chaque verdict en `judge_error` ; la passe entière est payée sans produire de mesure. Arbitrage à instruire : tolérer risque de masquer une vraie dérive.
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-judging.md`
  summary: Disjoncteur sur erreurs de juge consécutives — interrompre la passe après N échecs d'affilée au lieu de payer la totalité.
  evidence: Edge-case hunter — un juge en panne de format consomme le budget entier ; le statut `failed` final signale le problème mais après dépense complète.
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-judging.md`
  summary: `read_json_file` n'attrape pas `UnicodeDecodeError` — un fichier non décodable fait remonter l'exception jusqu'à la finalisation ou l'API.
  evidence: Edge-case hunter — `services/gdd_notion_atomic_io.py` ne couvre que `JSONDecodeError` et `OSError`. Touche aussi le moteur de run et la sync GDD : correctif transverse, hors périmètre de cette spec.
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-judging.md`
  summary: Le diagnostic du juge emprunte `diagnose_models`, qui impose la whitelist de génération Unity — sans rapport avec le schéma d'un juge, et qui contraint le juge à être aussi un candidat.
  evidence: Edge-case hunter — un juge parfaitement valable hors whitelist est refusé ; un diagnostic dédié (client réel + non-Dummy, sans filtre structured output Unity) serait plus juste.

- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-pairwise.md`
  summary: Coût imputé à un sens de lecture en échec lu sur les compteurs du client partagé, encore porteurs des valeurs du dernier appel réussi.
  evidence: Revue adversariale — un duel dont le sens direct réussit et l'inverse échoue est facturé deux fois le premier appel. Le correctif propre demande de mémoriser les compteurs avant chaque appel, ou que le client retourne son coût.
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-pairwise.md`
  summary: `_duel_is_usable` et `_verdict_is_usable` ne vérifient pas que le fichier correspond bien à la paire dont le chemin a été calculé (cas, répétition, modèles).
  evidence: Revue adversariale — toute divergence future entre nommage et appariement serait acceptée en silence, et le classement agrégerait des comparaisons qui n'ont jamais eu lieu.
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-pairwise.md`
  summary: Distinguer « accord partiel » (un sens tranche, l'autre dit égalité) de « désaccord de position » (les deux sens désignent des modèles opposés).
  evidence: Edge-case hunter — les deux sont aujourd'hui comptés `direction_disagreement`, ce qui gonfle la métrique de biais avec de simples hésitations du juge.
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-pairwise.md`
  summary: Passe rubrique et passe pairwise peuvent tourner simultanément sur le même run, chacune avec son plafond — dépense doublée sous la même identité de facturation.
  evidence: Revue adversariale + edge-case hunter — deux singletons, deux `CooperativePassControl`. Correctif : verrou et plafond portés par le run, pas par la passe.
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-pairwise.md`
  summary: `start_pass` et `GET /pairwise` lisent tous les duels en synchrone dans le handler HTTP ; à 3000 duels, la boucle d'événements est bloquée.
  evidence: Edge-case hunter — pagination appliquée après chargement complet, et `_duel_is_usable` par paire dans la coroutine du endpoint. Correctif : pagination à la source, ou `asyncio.to_thread`.
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-pairwise.md`
  summary: Aucune borne sur le nombre de duels (cas × C(modèles,2) × répétitions, deux appels chacun) ni échantillonnage possible.
  evidence: Edge-case hunter — 8 modèles × 40 cas × K=3 donnent 6720 appels séquentiels. Le budget est le seul frein, et il est saisi à la main. Correspond au point « Ask First » de la spec, resté non tranché.
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-pairwise.md`
  summary: La troncature coupe au caractère un JSON ré-indenté inséré dans un fence ```json — le texte tronqué est syntaxiquement invalide, l'autre non.
  evidence: Revue adversariale + edge-case hunter — sur un critère de forme, le juge pénalise une malformation produite par l'outil. Correctif : tronquer au nœud complet et re-sérialiser.
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-pairwise.md`
  summary: L'appariement ne compare pas les `prompt_hash` des deux générations, alors que le champ existe et que la garantie « même prompt » repose sur une déduction (même cas + même répétition).
  evidence: Edge-case hunter — la donnée qui permettrait de vérifier l'invariant est à portée de main et n'est pas lue.
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-pairwise.md`
  summary: État de passe jamais persisté en cours de route — un arrêt brutal laisse `_pass.json` figé sur `running`, `duels_completed: 0`.
  evidence: Revue adversariale + edge-case hunter — vaut aussi pour la passe rubrique. Correctif : persister toutes les N unités, et requalifier un `running` orphelin au démarrage.

- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-seed-suite.md`
  summary: Fiches Connaissances comme véritable unité de contexte des cas de benchmark, injectées **filtrées par le niveau de connaissance des personnages présents**.
  evidence: Base Notion « Connaissances Alteir » — 506 entrées, trois descriptions graduées (Perçu ~200 car. / Identifié ~280 / Compris ~550, ~300 tokens pièce), champ `Injection DG par défaut`, `Slug` alimentant les clés runtime `etat:{slug_perso}:{slug_concept}`. Non synchronisées localement à ce jour. **Le système sert à guider, pas à piéger** : si tous les personnages présents sont au niveau Perçu, le modèle ne reçoit que le niveau Perçu. Prérequis : import Notion de la base, puis remplacement du contexte « fiche personnage complète » par une sélection de Connaissances filtrée.
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-seed-suite.md`
  summary: Arbitrer la divergence entre le nombre d'options annoncé par le GDD (2 à 10) et le plafond du schéma d'export Unity (8).
  evidence: `data/GDD_categories/systemes_de_jeu/Dialogues_*.json` annonce 2 à 10 options par nœud ; `docs/resources/dialogue-format.schema.json` plafonne `choices` à 8 (4 en `cutsceneMode`). Les attentes des cas de benchmark sont calées sur 8 — le schéma est ce qui recale effectivement une génération. À trancher : relever le schéma, ou corriger la fiche GDD.
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-seed-suite.md`
  summary: Résoudre les lieux parents depuis les relations Notion plutôt qu'à la main.
  evidence: Les fiches lieu stockent leurs relations en UUID Notion non résolus sur disque (`Communautés présentes`, `Espèces présentes`…). Les lieux parents des cas de benchmark ont été renseignés manuellement ; l'Atelier des Matrices Ossifiées et le Tunnel vertébral n'en ont aucun faute d'information fiable.

- source_spec: `_bmad-output/implementation-artifacts/spec-dialogue-fragment-single-call.md`
  summary: CLI de benchmark — une commande qui enchaîne générations, notation rubrique, duels et rapport.
  evidence: Le mode benchmark n'a ni UI ni CLI : il ne s'utilise qu'en REST (`docs/benchmark/runbook.md`). La spécification fonctionnelle d'origine exige que tout ce qui est faisable en UI le soit en CLI. C'est aujourd'hui le principal frein à un usage autonome par l'utilisateur.
- source_spec: `_bmad-output/implementation-artifacts/spec-dialogue-fragment-single-call.md`
  summary: Streaming du mode fragment.
  evidence: `fragment_mode` force la voie non-streamée — le streaming natif est câblé sur le modèle mono-nœud (normalisation, `enrich_with_ids`). Choix délibéré pour exclure toute régression sur le chemin de production ; le fragment ne bénéficie donc d'aucun retour de progression pendant la génération.
- source_spec: `_bmad-output/implementation-artifacts/spec-dialogue-fragment-single-call.md`
  summary: `UnityDialogueChoiceContent` expose `testSuccessNode` / `testFailureNode` / `testCriticalSuccessNode` / `testCriticalFailureNode` au LLM.
  evidence: `.claude/rules/unity_dialogue_generation.md` interdit d'exposer ces champs techniques au modèle. Écart préexistant, relevé pendant l'implémentation du fragment (qui, lui, ne les reprend pas). Corriger l'existant touche la génération mono-nœud de production.
- source_spec: `_bmad-output/implementation-artifacts/spec-dialogue-fragment-single-call.md`
  summary: Trois clients LLM aiguillent sur le nom de classe du modèle de réponse.
  evidence: `core/llm/llm_client.py`, `core/llm/openai/response_parser.py`, `core/llm/mistral_client.py`, `core/llm/openrouter_client.py` comparent `response_model.__name__` à `"UnityDialogueGenerationResponse"`. Tout nouveau modèle de réponse doit être ajouté à la main dans `DummyLLMClient`, sans quoi le développement sans clé API casse silencieusement. Un registre explicite vaudrait mieux qu'une chaîne de `elif`.
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-admin-ui.md`
  summary: Pondérer la moyenne rubrique par le nombre de verdicts de chaque critère, pas seulement par son poids de grille.
  evidence: Revue — `_weighted_mean` moyenne des moyennes ; un critère noté 1 fois pèse autant qu'un critère noté 50 fois. Décision de protocole, pas correctif.
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-admin-ui.md`
  summary: Signaler la couverture de rubrique quand un juge n'a noté qu'une partie des critères (moyenne renormalisée en silence).
  evidence: Revue — `weight_total` ne somme que les critères notés ; 60 % du poids peut manquer sans que le rapport le dise.
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-admin-ui.md`
  summary: Afficher `error.details` par champ sur les 422 du panneau benchmark, comme le prescrit `.claude/rules/api_validation_errors.md`.
  evidence: Revue — `apiErrorMessage` retombe sur un message générique ; dette transverse au frontend, pas propre à ce lot.
- source_spec: none
  summary: "`labs-mistral-small-creative` n'existe pas au catalogue Mistral : corriger l'identifiant du modèle (probablement `mistral-small-latest`) dans `config/llm_config.json`, `app_config.json`, le défaut de `core/llm/mistral_client.py` et la chaîne de repli."
  evidence: "Catalogue de l'API Mistral listé le 2026-08-08 avec la clé du projet : 53 modèles, aucun ne porte ce nom (les Labs sont `labs-leanstral-1-5*`). Un run benchmark avec ce modèle produirait des `config_error`, pas des mesures. Le tarif a été renseigné pour débloquer l'estimation ; l'identifiant reste faux. Touche aussi `e2e/multi-provider-llm.spec.ts` et plusieurs tests — relève du skill `/llm-model-update`."
  status: done
  resolution: "Remplacé par `mistralai/mistral-medium-3-5` (OpenRouter) le 2026-08-08, avec entrée dans LEGACY_MODEL_ID_MAP côté Python et TypeScript."
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-admin-ui.md`
  summary: "Capturer la raison d'arrêt du modèle (`finish_reason`) pour distinguer une troncature d'un échec d'écriture."
  evidence: "Relevé le 2026-08-09 : aucun client ne lisait `finish_reason`, donc une génération coupée par le plafond de complétion était indiscernable d'une mauvaise réponse. Cinq échecs du run `20260808T214145-0b3b2f22` restaient inexplicables — dont deux fragments d'un seul panneau aux `leadsTo` orphelins."
  status: done
  resolution: "`core/llm/finish_reason.py` normalise Chat Completions et Responses API ; les quatre clients exposent `last_finish_reason`, l'orchestrateur le porte y compris sur le chemin d'erreur, `BenchmarkGenerationRecord.finish_reason` le persiste et le rapport le compte en `truncated` avec alerte en tête d'écran. Corrigé au passage : le client OpenAI remettait coût et tokens à zéro dès que le parsing échouait — origine des « 0 token, 0 $ »."
- source_spec: `_bmad-output/implementation-artifacts/spec-benchmark-admin-ui.md`
  summary: Relever la raison d'arrêt sur les chemins **streamés** de Mistral et OpenRouter.
  evidence: Les deux accumulent les deltas sans lire le `finish_reason` du dernier chunk ; `last_finish_reason` y reste donc `None`. Sans effet sur le benchmark, qui force la voie non-streamée (`fragment_mode`), mais l'information manque au streaming de production.
- source_spec: none
  summary: "Trancher le sort d'`aion-2.0` au catalogue : 0/3 générations exploitables au banc du 2026-08-08, ~30 s par appel."
  evidence: "Décision volontairement reportée : ce run tournait sous un plafond de complétion de 2000 tokens et un schéma qui refusait un fragment d'un seul panneau. Retirer un modèle sur cette mesure reproduirait l'erreur qu'on vient de corriger. À rejuger sur un run refait, où `finish_reason` dira si le modèle a été coupé ou s'il ne sait pas produire la structure."
