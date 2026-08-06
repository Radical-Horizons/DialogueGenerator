---
title: 'Fragment de dialogue complet en un seul appel LLM'
type: 'feature'
created: '2026-08-06'
status: 'in-progress'
baseline_commit: 'b4eaf4e955983f533b18ede58d7aacd3c2ca6c7a'
review_loop_iteration: 0
context: ['.claude/rules/unity_dialogue_generation.md', '.claude/rules/structured_output.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `UnityDialogueGenerationResponse` impose **un seul nœud** par génération. Le premier run réel du benchmark l'a rendu visible : le critère « Conséquence perceptible » score 1,3/20 et 1,0/20, et le juge écrit lui-même « aucune véritable réponse de branche et donc aucune conséquence dialoguée visible ». Deux critères pondérés notent la forme de l'exercice, pas le modèle. L'unité que l'auteur produit réellement, c'est un panneau, ses options, et le panneau qui suit chacune d'elles avec ses propres options.

**Approach:** Un nouveau modèle de sortie structurée décrivant un **fragment complet** : une **liste plate de panneaux**, chacun portant une **clé locale d'auteur**, les choix désignant leur suite par cette clé. Le modèle compose l'ensemble en **un seul appel** — il voit donc toutes les branches à la fois, ce qu'une expansion appel par appel ne permet pas, et sans multiplier le coût. L'application résout ensuite clés locales → identifiants Unity.

## Boundaries & Constraints

**Always:**
- **Un seul appel LLM** par génération. Le chemin `orchestrator.generate_with_events()` reste celui du benchmark : c'est lui qui alimente le plafond budgétaire dur.
- Les **identifiants techniques Unity** (`targetNode`, `nextNode`, `successNode`, `failureNode`) restent posés par l'application. Une **clé locale d'auteur** n'en est pas un : elle exprime l'enchaînement voulu, l'application seule la traduit en `id` / `targetNode`.
- Le nombre de panneaux et de branches est **contraint par le schéma** (`minItems` / `maxItems`, supportés par les Structured Outputs), jamais demandé au prompt seul.
- La génération **mono-nœud existante reste intacte** : graphe, expansion d'arbre et tests actuels continuent d'utiliser `UnityDialogueGenerationResponse` sans changement de comportement.
- Tout nouveau modèle de réponse doit être **reconnu par `DummyLLMClient`** — sans clé API, c'est lui qui répond, et un modèle inconnu casserait le dev et les tests.
- Une génération dont un choix pointe vers une clé inexistante est **`invalid`** (portes), jamais notée zéro.

**Ask First:**
- Étendre l'unité arborescente **au-delà du benchmark** (génération graphe côté produit) : décision produit, hors de ce lot.
- Toute dépense API réelle : l'utilisateur déclenche le run facturé.

**Never:**
- Pas d'expansion multi-appels (`DialogueTreeExpansionService.expand()`) — écartée explicitement.
- Pas de structure **récursive ou imbriquée** du type `choice.followUp` / `choice.next_node.choices[]` — écartée explicitement.
- Ne pas exposer au modèle les champs `targetNode` / `nextNode` / `successNode` / `failureNode`.
- Ne pas traiter la divergence GDD (2–10 options) vs schéma Unity (max 8) — déjà consignée en travail différé.
- Pas de classement Elo, pas de rapport agrégé, pas d'UI, pas de CLI.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fragment nominal | Cas de benchmark, 3 branches demandées | 4 panneaux : ouverture + 3 suites, toutes porteuses de choix ; document Unity plat, `targetNode` résolus | N/A |
| Choix orphelin | Un choix désigne une clé absente de la liste | Génération `invalid`, porte motivée nommant la clé | N/A |
| Clé dupliquée | Deux panneaux partagent la même clé locale | Génération `invalid`, porte motivée | N/A |
| Panneau inatteignable | Un panneau qu'aucun choix ne désigne | Génération `invalid`, porte motivée | N/A |
| Branche terminale | Un choix sans suite déclarée | `targetNode: "END"` — fin de branche légitime, pas une erreur | N/A |
| Sans clé API | `DummyLLMClient` répond | Fragment factice conforme au nouveau schéma, portes franchies | N/A |
| Panneau trop long | Un panneau dépasse `max_words` | `invalid`, porte `length` sur le panneau le plus long, pas sur la somme | N/A |

</frozen-after-approval>

## Code Map

- `models/dialogue_structure/unity_dialogue_node.py` — `UnityDialogueNodeContent`, `UnityDialogueChoiceContent`, `UnityDialogueGenerationResponse` (mono-nœud, à conserver)
- `services/unity_dialogue_generation_service.py` — `enrich_with_ids()` (pose `id` et `targetNode: "END"`), `resolve_generated_display_name()`, appel `generate_variants(response_model=…)`
- `core/llm/llm_client.py` — `DummyLLMClient` **teste le nom de classe en dur** ; un modèle inconnu ne produit aucune réponse factice
- `core/llm/openai/response_parser.py`, `core/llm/mistral_client.py`, `core/llm/openrouter_client.py` — normalisation `consequences` liste→objet, elle aussi **branchée sur le nom de classe**, et qui suppose un `node` unique
- `services/benchmark_gate_service.py` — porte déjà une **liste** de nœuds ; accueille connexité et nombre de panneaux
- `api/schemas/benchmark.py` — `BenchmarkCaseExpectations` (à étendre : nombre de panneaux)
- `services/benchmark_suite_seed.py` — consignes des 5 cas, à réécrire pour le fragment
- `services/benchmark_run_service.py` — `_generate_one`, chemin `generate_with_events` à préserver

## Tasks & Acceptance

**Execution:**
- [x] `models/dialogue_structure/unity_dialogue_fragment.py` -- nouveau modèle : `title` + liste plate de panneaux, clé locale par panneau, `leadsTo` par choix, bornes `minItems`/`maxItems` -- l'unité mesurée doit être exprimable sans récursion ni champ technique
- [x] `services/unity_dialogue_fragment_resolver.py` -- résolution clés locales → `id` Unity, `targetNode` posés, `END` sur branche terminale ; erreurs de référence retournées, pas levées -- l'application seule attribue les identifiants
- [x] `core/llm/llm_client.py` -- `DummyLLMClient` produit un fragment factice pour le nouveau modèle -- sans clé API c'est lui qui répond ; un modèle inconnu casserait dev et tests
- [x] `services/unity_dialogue_generation_service.py` -- méthode de génération de fragment réutilisant le même chemin `generate_variants` -- le plafond budgétaire dépend de ce chemin
- [x] `api/schemas/benchmark.py` + `services/benchmark_gate_service.py` -- attente de nombre de panneaux ; portes de connexité (clé inconnue, clé dupliquée, panneau inatteignable) -- lignes de la matrice
- [x] `services/benchmark_run_service.py` -- brancher la génération de fragment pour les runs de benchmark -- l'unité de mesure change ici
- [x] `services/benchmark_suite_seed.py` -- réécrire les consignes des 5 cas pour demander le fragment complet -- « Écris le panneau … » ne décrit plus ce qu'on attend
- [x] `tests/` -- couvrir chaque ligne de la matrice, la non-régression mono-nœud, et le fragment factice du Dummy -- la connexité est le risque neuf

**Acceptance Criteria:**
- Given un cas de benchmark, when une génération est produite, then elle contient l'ouverture et une suite par choix, chaque suite portant ses propres options, en **un seul appel LLM**.
- Given une génération de fragment, when le document Unity est produit, then aucun identifiant n'a été fourni par le modèle et tous les `targetNode` sont résolus par l'application.
- Given la suite de tests existante, when elle s'exécute, then la génération mono-nœud se comporte exactement comme avant.
- Given un environnement sans clé API, when une génération de fragment est demandée, then `DummyLLMClient` renvoie un fragment conforme qui franchit les portes.
- Given un run de fumée réel après bascule, when « Conséquence perceptible » est noté, then le critère cesse d'être plancher pour les deux modèles.

## Spec Change Log

- **`fragment_mode` porté par la requête, pas par un service séparé.** L'orchestrateur a deux voies : streaming natif et non-streamée. Le streaming est câblé sur le modèle mono-nœud (normalisation, `enrich_with_ids`). Le mode fragment force la voie non-streamée plutôt que de toucher au streaming — toute régression sur le chemin de production est ainsi exclue. Streaming du fragment à différer.
- **Une clé non résolue reste dans `targetNode` au lieu d'être rabattue sur `END`.** Un `END` silencieux ferait passer une branche cassée pour une fin voulue et produirait un document valide : la porte de connexité n'aurait plus rien à voir. La clé pendante y est visible, donc qualifiable.
- **`generate_dialogue_fragment` ne factorise pas le déballage de variante avec `generate_dialogue_node`.** Refactoriser la méthode existante l'aurait exposée à une régression pour un gain cosmétique ; la duplication est assumée et bornée.

## Design Notes

**Pourquoi plat plutôt qu'imbriqué.** Les Structured Outputs acceptent la récursion (`$ref`) et jusqu'à 10 niveaux : l'imbrication était donc techniquement possible. Elle est écartée pour deux raisons. La profondeur est figée par le schéma — passer à deux niveaux imposerait un nouveau type de panneau — alors qu'une liste plate décrit n'importe quelle topologie, y compris deux choix convergeant vers le même panneau, qu'une structure imbriquée ne sait pas exprimer sans duplication.

**Les clés locales ne sont pas des champs techniques.** `.claude/rules/unity_dialogue_generation.md` interdit d'exposer `targetNode`, `nextNode`, `successNode`, `failureNode` : ce sont des identifiants **Unity** que l'application pose. Une clé locale d'auteur relève de l'intention narrative — « cette réponse mène là » — et disparaît à la résolution. L'invariant tenu par la règle, à savoir que le modèle n'attribue jamais d'identifiant Unity, reste entier.

**Le schéma garantit la forme, le prompt porte le sens.** `minItems`/`maxItems` étant supportés, le nombre de branches est structurel. Le prompt ne le répète pas (`.claude/rules/structured_output.md`) ; il dit ce que la suite doit faire — montrer la conséquence du choix.

**Écart préexistant relevé, non traité ici.** `UnityDialogueChoiceContent` expose déjà `testSuccessNode`, `testFailureNode`, `testCriticalSuccessNode`, `testCriticalFailureNode` au modèle, ce que la règle interdit. Le modèle de fragment ne reprendra pas ces champs ; corriger l'existant sort du périmètre et doit être consigné en travail différé.

## Verification

**Commands:**
- `F:/Projets/DialogueGenerator/.venv/Scripts/python.exe -m pytest tests/ -k "fragment or benchmark or unity_dialogue" -q` -- expected: tous verts, aucune régression sur les 230 tests benchmark
- `F:/Projets/DialogueGenerator/.venv/Scripts/python.exe -m pytest tests/ -m "not slow" -q` -- expected: T2 verte (référence : 2287 passed, 8 skipped)

**Manual checks (if no CLI):**
- Run de fumée réel (`alteir-smoke`, `gpt-5.6-luna` vs `gpt-5.6-terra`, K=1) : chaque génération compte 4 panneaux, et « Conséquence perceptible » n'est plus au plancher. Déclenché par l'utilisateur.
