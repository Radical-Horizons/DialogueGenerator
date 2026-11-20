---
title: 'Conversations IA — discuter avec l’IA qui a produit un nœud (back-end) + traçabilité nœud → appel LLM'
type: 'feature'
created: '2026-11-19'
status: 'done'
baseline_revision: 'a853c503ef9734d855a9d0e1abc1432dfe27cabf'
final_revision: '08ec06a91'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/docs/architecture/conversations-ia.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** On ne peut pas interroger l’IA qui a généré un nœud (« pourquoi ce choix ? »). Pire, le lien nœud → appel LLM est faux ou absent dès qu’une requête fait plusieurs appels (choix avec test = 4 appels, « tous les choix », jobs batch, expand-tree), et `FileLLMUsageRepository.update()` écrase **tous** les enregistrements d’un même `request_id` par celui qu’on met à jour (prompts, réponses et coûts perdus).

**Approach:** (1) Identifiant unique `call_id` par appel LLM, mise à jour par `call_id`, et capture de provenance par tâche asyncio (`ContextVar`) pour annoter chaque nœud avec l’appel qui l’a produit. (2) Demander par défaut le résumé de raisonnement lisible (`reasoning.summary="auto"`) aux modèles GPT-5.6/6.x. (3) Back-end générique de « conversations IA » persistées en SQLite, avec des sujets enfichables ; premier sujet `dialogue_node` : la conversation part d’un instantané de la génération (instructions, prompt exact, sortie exacte, résumé de réflexion) rejoué en texte, quel que soit le fournisseur.

## Boundaries & Constraints

**Always:** logique métier dans `services/`, routers minces, injection via `api/container.py` + `api/dependencies.py`. Annotations de types + docstrings PEP257. Tests sans réseau (faux clients LLM, `DummyLLMClient`). Contrôle d’accès au dialogue (`DocumentPersistenceService.require_access`) à **chaque** accès à une conversation `dialogue_node`, pas seulement à la création. Les conversations sont privées à leur propriétaire (autre utilisateur ⇒ 404, comme les collections). Invité ⇒ 403 sur toute écriture (`require_non_guest`). Le rejeu de la génération est textuel (voir Design Notes) : on ne renvoie jamais d’items `function_call`/`reasoning` OpenAI.

**Block If:** l’implémentation exige de modifier le schéma Pydantic exposé au LLM pour la génération (`UnityDialogueGenerationResponse`) ou le prompt de génération ; un test ne peut passer qu’avec un vrai appel facturé.

**Never:** aucun front-end ; pas de champ « justification » ajouté à la sortie de génération (décision produit laissée à l’utilisateur, cf. étude) ; pas de `previous_response_id` ni de rejeu d’items chiffrés ; pas de vrai appel LLM dans les tests ; ne pas toucher `data/GDD_categories/**` ; ne pas modifier `docs/architecture/conversations-ia.md` ni `scripts/llm_probes/` (écrits par le planificateur).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Création OK | writer propriétaire du dialogue D ; record réussi annoté (D, N) au format OpenAI Responses avec résumé de raisonnement | 201 ; `generation.output_text` = arguments de l’appel de fonction ; `generation.reasoning_summary` = texte du résumé ; `model_name` = modèle d’origine normalisé ; `messages` = [] | — |
| `dialogue_id` stocké avec `.json` | record annoté `D.json`, requête `D` (ou l’inverse) | trace trouvée (les deux formes sont cherchées, la plus récente gagne) | — |
| Pas de trace | nœud écrit à la main / record absent / record en échec / sortie vide | 404 `{"code":"generation_trace_not_found"}` | rien n’est créé |
| Message OK | conversation existante, `{"content":"Pourquoi ce ton ?"}` | 201 `{user_message, assistant_message}` ; le LLM reçoit instructions d’origine sans le suffixe structured output, contexte = messages d’origine + sortie (assistant) + note d’application + historique, prompt = question | — |
| Réponse LLM en erreur | le client renvoie `"Erreur: …"` ou lève (hors `AllLLMProvidersUnavailableError`) | 502 `{"code":"llm_error"}` | aucun message persisté |
| Budget dépassé | `check_budget(...)["allowed"] is False` | 429 `QUOTA_EXCEEDED` | aucun appel LLM, aucun message |
| Conversation pleine | 40 messages déjà présents | 409 `{"code":"conversation_full"}` | aucun appel LLM |
| Accès retiré | partage révoqué après création | 403 `{"code":"dialogue_access_denied"}` sur GET et POST message | — |
| Requête multi-appels | « tous les choix » sur 2 choix, ou choix avec test (4 appels) | chaque nœud est annoté sur **son** record ; les autres records du `request_id` restent intacts | appel sans suivi d’usage (Dummy) ⇒ pas d’annotation, pas d’erreur |

</intent-contract>

## Code Map

- `models/llm_usage.py` -- `LLMUsageRecord` ; ajouter `call_id: Optional[str]`.
- `services/repositories/llm_usage_repository.py` -- `update()` remplace toutes les entrées du même `request_id` (bug) ; `get_by_dialogue_and_node` (plus récent non supprimé).
- `services/llm_usage_service.py` -- `track_usage`, `annotate_usage` (par `request_id`, à remplacer), `compute_and_persist_context_relevance(request_id)`.
- `core/llm/openai/client.py:133-136,302-308` -- suffixe « Tu DOIS utiliser la fonction 'generate_interaction'… » ajouté aux instructions puis stocké dans `prompt` ; format `"{instructions}\n\n--- Input ---\n{json messages}"`.
- `core/llm/openai/parameter_builder.py:126-206` -- `build_reasoning_config` renvoie `{}` sans effort ni summary ⇒ aucun résumé lisible aujourd’hui.
- `core/llm/mistral_client.py:120`, `core/llm/openrouter_client.py:131` -- `prompt` = JSON des messages (system inclus) ; `response` = JSON Chat Completions.
- `services/graph_node_orchestrator.py:691-753` -- `_generate_and_enrich` (1 appel → 1 nœud) ; `GenerationResult` :62-74.
- `services/unity_dialogue_generation_service.py:298-440` -- `generate_nodes_for_choice_with_test` ; `generate_one` = 1 appel → 1 nœud, 4 en `asyncio.gather`.
- `services/graph_generation_service.py:144-235,285-312` -- `generate_for_one_choice` (une tâche par choix ; chemin libre = 1 appel → 1 nœud).
- `services/dialogue_tree_expansion_service.py:258` -- nœud START via `UnityDialogueOrchestrator.generate`.
- `api/routers/graph_generation.py:273-287,479-487` -- annotations generate-node et job batch (une seule, sur le mauvais record).
- `api/routers/graph_node_history.py:294-344` -- regenerate (le nœud prend l’id `node_id` du chemin).
- `api/routers/graph_expansion.py:262-355` -- expand-tree, aucune annotation.
- `api/routers/graph_cost.py:186-192` -- `try_compute_context_relevance(usage_service, request_id)`.
- `services/document_persistence_service.py:210-222` -- `require_access(document_id, current_user)` lève `DialogueAccessDeniedError`.
- `services/document_id_validation.py:18-31` -- `validate_document_id` (retire `.json`, `ValueError`).
- `services/cost_governance_service.py:28-108`, `api/routers/graph_generation.py:81-118` -- modèle de contrôle budget (429 `QUOTA_EXCEEDED` via `APIException`).
- `factories/llm_factory.py:40-203` -- `LLMClientFactory.create_client(model_id, config, available_models, usage_service, request_id, endpoint)`.
- `services/repositories/sqlite/collections_repository.py`, `services/collection_service.py`, `api/routers/collections.py`, `api/schemas/collections.py`, `tests/api/test_collections.py` -- patron SQLite/service/router/test à copier.
- `services/repositories/sqlite/migrations/` -- prochaine migration : `013`. `tests/services/repositories/sqlite/test_migrations.py:11-24` -- `EXPECTED_MIGRATION_VERSIONS`.
- `api/main.py:749-760` -- enregistrement des routers.

## Tasks & Acceptance

**Execution:**
- `models/llm_usage.py`, `services/repositories/llm_usage_repository.py` -- ajouter `call_id` ; `update()` cible l’entrée de même `call_id`, ou à défaut (record legacy) l’unique entrée de même `(request_id, timestamp)` ; ajouter `get_by_call_id` (protocole + implémentation) -- corrige la corruption multi-appels.
- `services/llm_call_provenance.py` (nouveau) -- `ContextVar` : `capture_llm_calls()` (puits de `call_id` par tâche), `report_llm_call(call_id)`, `collect_node_provenance()` (dict partagé `node_id → call_id`), `link_nodes_to_calls(node_ids, call_ids)` (dernier `call_id`, no-op si vide ou hors portée) -- provenance sûre en concurrence.
- `services/llm_usage_service.py` -- `track_usage` pose `call_id = uuid4().hex` et appelle `report_llm_call` si `success` ; remplacer `annotate_usage` par `annotate_call(call_id, dialogue_id, node_id, template_id=None, template_name=None)` ; `compute_and_persist_context_relevance(call_id)` ; ajouter `get_record_by_call_id`.
- `services/graph_node_orchestrator.py`, `services/unity_dialogue_generation_service.py`, `services/graph_generation_service.py`, `services/dialogue_tree_expansion_service.py` -- entourer chaque appel LLM producteur de nœud de `capture_llm_calls()` puis `link_nodes_to_calls([ids des nœuds produits], calls)` -- un nœud ↔ son appel, y compris en parallèle.
- `api/routers/graph_generation.py`, `api/routers/graph_node_history.py`, `api/routers/graph_expansion.py`, `api/routers/graph_cost.py` -- envelopper la génération dans `collect_node_provenance()` (dans `_runner` pour le job batch) et annoter chaque nœud renvoyé via `annotate_call` avec le `dialogue_id`/`document_id` connu (regenerate : id généré → `node_id` du chemin) ; pertinence de contexte par `call_id` pour generate-node et regenerate seulement.
- `core/llm/openai/parameter_builder.py` -- pour `ModelNames.is_reasoning_family(model)` sans effort ni summary fournis : renvoyer `{"summary": "auto"}` (effort omis ⇒ défaut API inchangé) ; mettre à jour les tests existants qui attendaient `{}`.
- `core/llm/openai/client.py` -- extraire le suffixe structured output en constante de module `STRUCTURED_OUTPUT_INSTRUCTION_SUFFIX` (comportement inchangé).
- `services/generation_trace.py` (nouveau) -- `GenerationTrace` (frozen dataclass : `instructions`, `input_messages`, `output_text`, `reasoning_summary`, `model_name`, `generated_at`, `request_id`, `call_id`) et `parse_generation_trace(record)` : formats OpenAI (marqueur `--- Input ---`, réponse Responses : `function_call.arguments` sinon `output_text`, résumés `reasoning.summary[].text` joints), Chat Completions (system extrait des messages, `tool_calls[0].function.arguments` sinon `content`), texte brut ; retire `STRUCTURED_OUTPUT_INSTRUCTION_SUFFIX` des instructions ; lève `GenerationTraceUnavailableError` si `success` faux, prompt/réponse absents ou sortie vide.
- `services/repositories/sqlite/migrations/013_ai_conversations.sql`, `services/repositories/sqlite/ai_conversations_repository.py`, `services/repositories/sqlite/__init__.py` -- tables `ai_conversations` (`id`, `owner_id` FK `users` ON DELETE CASCADE, `subject_kind`, `subject_key`, `subject_json`, `title`, `model_name`, `seed_json`, `created_at`, `updated_at` ; index `(owner_id, updated_at)`, `(owner_id, subject_key)`) et `ai_conversation_messages` (`id`, `conversation_id` FK CASCADE, `position`, `role` CHECK user/assistant, `content`, `reasoning_summary`, `llm_call_id`, `model_name`, `cost_usd`, `created_at`, UNIQUE `(conversation_id, position)`) ; ajout atomique d’une paire de messages (position = max + 1 dans la transaction) ; mettre à jour `EXPECTED_MIGRATION_VERSIONS`.
- `services/ai_conversation_service.py` (nouveau) -- `AIConversationService` : registre `kind → résolveur` (protocole `AIConversationSubjectResolver` : `resolve(subject, user) -> ConversationSeed`, `check_access(subject, user)`), résolveur `DialogueNodeSubjectResolver` (validation id, `require_access`, recherche du record sous `D` et `D.json`, `parse_generation_trace`, instantané) ; `create`, `list_for_user(user, subject_kind?, subject_key?)`, `get`, `delete`, `post_message` (accès, plafond 40 messages, budget via `check_budget(user_id=billable_user_id, …)`, client via fabrique injectable `llm_client_factory(model_id, request_id) -> ILLMClient` utilisant `LLMClientFactory.create_client(…, endpoint="ai_conversation")`, `capture_llm_calls()`, résumé de raisonnement du tour si réel, coût `last_call_cost`, persistance atomique après succès) ; erreurs de domaine dédiées. Modèle : demandé, sinon `ModelNames.normalize_model_id(trace.model_name)` s’il est disponible, sinon `default_model` de la config.
- `api/schemas/ai_conversations.py`, `api/routers/ai_conversations.py`, `api/main.py`, `api/container.py`, `api/dependencies.py` -- `POST /api/v1/ai-conversations` (201), `GET /api/v1/ai-conversations` (filtres `subject_kind`, `dialogue_id`, `node_id`), `GET /{id}`, `POST /{id}/messages` (201), `DELETE /{id}` (204) ; sujet = union discriminée sur `kind` (un seul membre `dialogue_node`) ; contenu 1–4000 caractères ; mapping d’erreurs de la matrice.
- `tests/services/test_llm_call_provenance.py`, `tests/repositories/test_llm_usage_repository.py`, `tests/services/test_llm_usage_service.py`, `tests/services/test_generation_trace.py`, `tests/services/test_ai_conversation_service.py`, `tests/api/test_ai_conversations.py`, `tests/api/test_graph_generation_provenance.py`, `tests/core/llm/openai/test_parameter_builder.py` -- couvrir chaque ligne de la matrice, la concurrence (deux tâches parallèles ⇒ deux liens distincts), l’`update()` multi-records, les trois formats de trace, et la provenance des chemins orchestrateur/batch/test/expand START avec un faux client qui appelle le vrai `LLMUsageService` sur un dépôt fichier temporaire.
- `docs/api/api-contracts-api.md` -- section « Conversations IA » (routes, corps, codes d’erreur).

**Acceptance Criteria:**
- Given un dialogue possédé par writer-a et un record de génération OpenAI pour (D, N), when writer-a crée une conversation puis poste deux questions, then chaque réponse 201 contient le message assistant, le détail `GET` liste 4 messages dans l’ordre, et le second appel LLM a reçu la première paire question/réponse dans son contexte.
- Given un POST `/unity-dialogues/graph/generate-node` avec `generate_all_choices` sur 2 choix et `dialogue_id`, servi par un faux client qui trace son usage, when la génération se termine, then `GET /api/v1/llm-usage/dialogue/{dialogue_id}/generation-logs` renvoie 2 entrées aux `node_id` distincts égaux aux ids des nœuds renvoyés, chacune avec son propre prompt.
- Given une requête de génération ayant produit deux records sous le même `request_id`, when l’un est annoté, then `GET /api/v1/llm-usage/dialogue/{dialogue_id}/generation-logs` montre l’autre avec ses tokens, coût, prompt et réponse d’origine (aucun doublon).
- Given un modèle GPT-6.x sans effort ni summary configurés, when les paramètres Responses sont construits, then `reasoning == {"summary": "auto"}` et aucun `temperature`/`top_p`.
- Given writer-b sans accès au dialogue, when il crée une conversation, then 403 `dialogue_access_denied` ; when il lit la conversation de writer-a, then 404.

## Spec Change Log

## Review Triage Log

### 2026-11-19 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 15 (high 2, medium 7, low 6)
- defer: 2 (medium 1, low 1)
- reject: 4 (medium 1, low 3)
- addressed_findings:
  - `[high]` `[patch]` Texte libre OpenAI jamais lu (`extract_text_output` cherchait `type == "text"`, l'API renvoie `message`/`output_text`) : chaque tour de conversation aurait rendu 502, facturé mais compté à 0. Lecture des items `message` + tests sur objets SDK réels.
  - `[high]` `[patch]` Injection de prompt stockée : les routes de génération annotaient un `dialogue_id` fourni par le client sans contrôle ; un autre rédacteur pouvait planter la graine d'une conversation. Annotation conditionnée à `require_edit` sur le dialogue.
  - `[medium]` `[patch]` Messages de panne Mistral/OpenRouter enregistrés comme réponses : détection d'échec élargie (préfixes + appel suivi sans succès).
  - `[medium]` `[patch]` Modèle demandé non validé (repli silencieux sur Dummy), modèle épinglé jamais revérifié, pas de chaîne de repli, exception de fabrique hors `try` : 422 `unknown_model`, modèle par défaut si retiré, repli configuré partagé avec les routes du graphe.
  - `[medium]` `[patch]` Boucle d'événements bloquée (historique d'usage relu deux fois à la création, réécriture du fichier du jour par nœud) : threadpool, un seul parcours, annotation groupée.
  - `[medium]` `[patch]` Doublons legacy identiques (laissés par l'ancien `update()`) plus modifiables, `mark_node_deleted` mentait : remplacement des copies identiques, `update()` renvoie le résultat réel.
  - `[medium]` `[patch]` Job batch : nœuds livrés avant une interruption jamais annotés : annotation dans `on_item`.
  - `[medium]` `[patch]` Record legacy mal relié (copie d'un nœud frère) rejoué comme celui du nœud : trace refusée (404) quand un record sans `call_id` partage son `request_id`.
  - `[medium]` `[patch]` Graine limitée à la sortie brute : ajout du nœud tel qu'il est aujourd'hui dans le dialogue.
  - `[low]` `[patch]` Tours concurrents sur une conversation (double facturation, historique désordonné) : verrou par conversation.
  - `[low]` `[patch]` Suffixe structured output et marqueur `--- Input ---` dupliqués entre clients et parseur : constantes partagées + test aller-retour client → trace.
  - `[low]` `[patch]` Trous de vérification (expand-tree via l'API, pertinence par `call_id`, `append_exchange`, câblage réel du conteneur) : tests ajoutés.
  - `[low]` `[patch]` `get_by_request_id` devenu code mort : supprimé.
  - `[low]` `[patch]` Coût par tour annoncé dans l'étude sans mesure : mesuré sur un vrai tour (voir l'étude).
- deferred: nœuds générés avant que le dialogue ait un nom (START de « Générer », brouillon) ; FK `owner_id` sous `DISABLE_AUTH` (admin factice absent de `users`).
- rejected: plafond de conversations par nœud (plus bloquant une fois la création hors boucle) ; risque de 400 sur `reasoning.summary: "auto"` (vérifié sans erreur sur `gpt-6.2-astra`, `gpt-6.2-sol`, `gpt-6.1-terra`, `gpt-6-luna` le 2026-11-19) ; instructions vides ⇒ prompt système par défaut du client (comportement voulu) ; écarts de lecture descriptifs de l'audit d'intention (rejeu plutôt que reprise littérale, résumé plutôt que raisonnement brut : choix documentés et mesurés).

## Design Notes

**Pourquoi un rejeu textuel et pas les items chiffrés.** Sonde réelle du 2026-11-19 sur `gpt-6.2-sol` (détail : `docs/architecture/conversations-ia.md`) : relancer la génération avec ses items `reasoning` (`encrypted_content`) — sans état ou par `previous_response_id` — ne réinjecte le raisonnement (tokens d’entrée +184) **que** si instructions, outils **et** `tool_choice` sont strictement identiques, ce qui force le modèle à rappeler `generate_interaction`. Dès que la relance demande une réponse en texte (`tool_choice:"none"`/`"auto"`), le raisonnement est retiré (tokens = historique visible) et le modèle dit n’en avoir aucune trace. En plus, un `function_call` rejoué sans son item `reasoning` donne 400. Le rejeu natif n’apporte donc rien et ajoute des contraintes : on rejoue en texte, ce qui marche aussi pour OpenRouter/Mistral/Dummy via `generate_variants(previous_dialogue_context=…)`.

**Ce que l’IA « retrouve » de ses réflexions** : le contexte exact, sa sortie exacte et, si OpenAI l’a fourni, le résumé lisible de son raisonnement (1 fois sur 4 dans la sonde, souvent en anglais). La note d’application le dit explicitement au modèle pour qu’il distingue ce qu’il retrouve de ce qu’il reconstruit :

```text
[Note de l'application] La génération est terminée : ta réponse ci-dessus est devenue le nœud {node_id}.
L'auteur du jeu ouvre une discussion avec toi sur ce nœud. Réponds en français, en texte libre, sans JSON
ni appel de fonction. Ton raisonnement interne de la génération n'a pas été conservé ; tu disposes du
contexte exact, de ta réponse exacte{et du résumé de ta réflexion ci-dessous}. Distingue ce que tu retrouves
dans ces éléments de ce que tu reconstruis après coup ; n'invente pas de souvenir.
{Résumé de ta réflexion pendant la génération : …}
```

**Instantané** : la graine (`seed_json`) est copiée dans la conversation à la création ; une régénération ultérieure du même `node_id` ou la rotation des fichiers d’usage ne change pas une conversation existante.

**Provenance** : `collect_node_provenance()` pose un dict dans le contexte de la requête ; les tâches filles (copie superficielle du contexte) écrivent dans ce même dict. `capture_llm_calls()` est posé **dans** la tâche qui appelle le LLM, jamais avant `create_task`/`gather` (sinon les tâches partageraient la même liste).

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest tests/services/test_llm_call_provenance.py tests/repositories/test_llm_usage_repository.py tests/services/test_llm_usage_service.py tests/services/test_generation_trace.py tests/services/test_ai_conversation_service.py tests/api/test_ai_conversations.py tests/api/test_graph_generation_provenance.py tests/services/repositories/sqlite/test_migrations.py -q` -- expected: tout vert
- `node scripts/getPythonPath.js -m pytest tests/core/llm tests/services tests/api -q -x -m "not slow"` -- expected: aucune régression
- `npm run test:backend:fast` -- expected: vert

## Auto Run Result

Status: done

**Résumé.** Étude de faisabilité mesurée (sondes réelles GPT-6.2 Sol) + back-end livré : conversations IA persistées (`/api/v1/ai-conversations`, sujets enfichables, premier sujet `dialogue_node`), rejeu textuel de l'instantané de génération et du nœud tel qu'il est aujourd'hui, résumé de réflexion lisible demandé par défaut aux familles GPT-5.6/6.x, et correction de la traçabilité nœud → appel LLM (`call_id`, provenance par tâche asyncio, `update()` qui écrasait les records frères).

**Fichiers.**
- Étude et sonde : `docs/architecture/conversations-ia.md`, `scripts/llm_probes/reasoning_replay_probe.py`.
- Traçabilité : `models/llm_usage.py`, `services/repositories/llm_usage_repository.py`, `services/llm_usage_service.py`, `services/llm_call_provenance.py` (nouveau), `services/graph_node_orchestrator.py`, `services/unity_dialogue_generation_service.py`, `services/graph_generation_service.py`, `services/dialogue_tree_expansion_service.py`, `services/batch_node_generation_service.py`, `api/routers/graph_router_helpers.py`, `api/routers/graph_generation.py`, `api/routers/graph_node_history.py`, `api/routers/graph_expansion.py`, `api/routers/graph_cost.py`.
- LLM : `core/llm/tracking_format.py` (nouveau), `core/llm/openai/client.py`, `core/llm/openai/parameter_builder.py`, `core/llm/openai/response_parser.py` (texte libre `message`/`output_text`), `core/llm/mistral_client.py`, `core/llm/openrouter_client.py`, `core/llm/fallback_client.py`, `factories/llm_factory.py`, `services/context_relevance_scoring.py`.
- Conversations : `services/generation_trace.py`, `services/ai_conversation_service.py`, `services/repositories/sqlite/ai_conversations_repository.py`, migration `013_ai_conversations.sql` (nouveaux) ; `api/schemas/ai_conversations.py`, `api/routers/ai_conversations.py` (nouveaux) ; `api/main.py`, `api/container.py`, `api/dependencies.py`, `services/repositories/sqlite/__init__.py`.
- Docs et harnais : `docs/api/api-contracts-api.md`, `.claude/rules/llm.md`, `CLAUDE.md`, `_bmad-output/implementation-artifacts/deferred-work.md`.
- Tests : 6 nouveaux fichiers (provenance, trace, service, API conversations, provenance API, dépôt SQLite) et 9 étendus.

**Revue.** 4 relecteurs (adversarial, cas limites, trous de vérification, alignement d'intention). 15 correctifs appliqués (2 hauts : texte libre OpenAI jamais lu ⇒ 502 à chaque tour ; injection de prompt via annotation non contrôlée), 2 reportés (`deferred-work.md`), 4 rejetés. Recommandation de seconde revue : **oui** (correctifs hauts ; score 3 × 7 + 6 = 27).

**Vérification.**
- `pytest` ciblé (fichiers de la spec + dépôt SQLite + `tests/core/llm/openai`) : 206 passed.
- Palier rapide `pytest tests/ -m "not slow"` (venv du dépôt principal, équivalent `npm run test:backend:fast`) : 2739 passed, 4 skipped.
- `tests/test_claude_rules_frontmatter.py` : 162 passed.
- Réel, contenu synthétique : génération `gpt-6.2-sol` → trace → conversation de 2 tours par le service, réponses fondées ; tour 2 relu en cache à 93 % (0,0042 $). Acceptation de `reasoning.summary: "auto"` vérifiée sur les 4 modèles GPT-6.

**Risques résiduels.**
- Résumé de réflexion rare (1 sondage sur 5) : l'IA explique surtout à partir du contexte et de sa sortie, pas de son raisonnement.
- Liens legacy multi-appels perdus ; nœuds non annotés avant que le dialogue ait un nom (front à venir).
- T2 complet (`npm run test:premerge`, ESLint + Vitest) non relancé : aucun fichier front touché.
- Aucune preuve UI : pas de front dans ce lot.
