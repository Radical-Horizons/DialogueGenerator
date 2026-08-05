---
title: 'Mode Benchmark — suites, portes et moteur de run'
type: 'feature'
created: '2026-08-04'
status: 'done'
review_loop_iteration: 0
context: []
baseline_commit: '05e4c8f3266d61e745d82d25488c39351f3612d4'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Aucun moyen chiffré de comparer des modèles LLM sur nos vrais dialogues (ramifiés, courts, FR, gros contexte GDD) : rien dans le repo ne rejoue les appels de génération réels de façon reproductible, budgétée et reprenable, et rien ne filtre programmatiquement les générations structurellement invalides avant toute mesure.

**Approach:** Introduire la fondation du mode benchmark : un modèle de suites de cas versionnées (donnée, pas code), des portes structurelles qui valident/invalident chaque génération avant tout jugement, et un moteur de run asynchrone qui rejoue l'orchestrateur de génération existant sur suite×modèles×répétitions, avec progression, pause/annulation, checkpoint/reprise et plafond budgétaire. Le jugement de qualité et le rapport de classement suivent en specs séparées, au-dessus de cette fondation.

## Boundaries & Constraints

**Always:**
- Composer les services existants (orchestrateur de génération, pricing, usage, gouvernance de coût) — jamais dupliquer leur logique.
- Génération invalide (porte échouée) = statut `invalid` avec raison, jamais un score zéro.
- Échec de protocole fournisseur (clé absente → `DummyLLMClient` silencieux, ou 400 paramètres) = statut `config_error` distinct de `invalid`.
- Sauvegarde incrémentale (`write_json_atomic`) après chaque génération terminée ; un répertoire de résultats par run, jamais de magasin partagé entre runs.
- Aucun échec silencieux : suite introuvable, suite/grille vide, modèle inconnu → arrêt avec message clair avant tout appel LLM.
- Neutraliser la chaîne de fallback LLM pendant un run (mesurer le modèle demandé, pas son remplaçant).
- Reprise (`resume`) : aucune génération déjà persistée n'est refaite ; empreinte de la suite vérifiée avant reprise.
- **Budget benchmark isolé** : le coût d'un run ne débite jamais le quota mensuel utilisateur ; il est suivi dans un compteur propre au benchmark, plafonné par `budget_cap_usd`.
- **Endpoints de run réservés admin** (`require_admin`, `api/dependencies.py:128`) : lancer, reprendre, annuler un run est une action admin. La lecture des suites reste ouverte aux utilisateurs authentifiés.

**Ask First:**
- Aucun arbitrage en suspens (dépendance de détection de langue et isolation du budget tranchés par l'utilisateur).

**Never:**
- Pas de jugement de qualité, pas de classement, pas de rapport, pas d'UI, pas de CLI dans cette spec (différés).
- Pas de chemins de fichiers en dur hors `constants.FilePaths`.
- Pas de nouvel endpoint de génération : le run appelle l'orchestrateur existant tel quel.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Run nominal | suite 3 cas × 2 modèles × K=3 | `run_id` retourné immédiatement ; progression consultable ; générations persistées au fil de l'eau, statut `completed` | N/A |
| Plafond budget atteint | coût réel cumulé ≥ `budget_cap_usd` | arrêt propre, résultats partiels conservés, statut `interrupted_budget` | N/A |
| Reprise | run interrompu + `POST resume` | aucune génération déjà produite n'est refaite | empreinte de suite modifiée depuis → 409 explicite |
| Porte structurelle échouée | JSON invalide, flag inconnu, choix dupliqué, sortie non-FR, texte vide | génération `invalid` + raison motivée | N/A |
| Modèle mal configuré | clé API absente (DummyLLMClient) ou 400 protocole fournisseur | générations du modèle en `config_error`, run continue pour les autres modèles | N/A |
| Annulation | `POST cancel` pendant le run | arrêt coopératif, résultats partiels conservés, statut `cancelled` | N/A |
| Suite/grille vide | 0 cas dans la suite | 400 immédiat, message clair, aucun appel LLM | N/A |

</frozen-after-approval>

## Code Map

- `services/unity_dialogue_orchestrator.py` — `generate(GenerateUnityDialogueRequest)` rejoué par cas×modèle×répétition ; renvoie `json_content`, `raw_prompt`, `prompt_hash`, `last_call_cost`/`last_usage_*_tokens`
- `factories/llm_factory.py` — création client ; piège : clé absente → `DummyLLMClient` silencieux (sauf OpenRouter qui lève)
- `core/llm/unity_allowed_models.py` — whitelist des modèles éligibles génération Unity (valider les modèles demandés contre elle)
- `services/gdd_notion_sync_service.py` — pattern run async de référence : `asyncio.Lock`, dict de progression mono-thread, `_cooperative_sync_point()` (pause/cancel), checkpoint après chaque unité de travail, statut persisté séparé de la progression in-memory
- `services/gdd_notion_full_sync_checkpoint.py` — `save_checkpoint`, `validate_checkpoint_for_resume`, `compute_sources_fingerprint` — modèle pour la reprise benchmark
- `services/gdd_notion_atomic_io.py` — `write_json_atomic` / `read_json_file` (helper générique malgré le nom)
- `services/llm_pricing_service.py` — `calculate_cost`, `get_model_pricing`
- `services/cost_governance_service.py` — **non appelé** par le run (budget isolé, cf. Spec Change Log) ; le middleware HTTP ne couvre de toute façon pas les tâches de fond
- `api/middleware/billable_user_context.py` — `push_billable_user_id("benchmark")` : isole la consommation du run du quota mensuel utilisateur
- `services/llm_usage_service.py` — `track_usage(...)` déjà appelé par les clients LLM, sur l'identité `benchmark` pendant un run
- `services/graph_validation_service.py`, `api/utils/unity_schema_validator.py` — porte validité structurelle
- `services/dialogue_flag_reference_validation_service.py`, `services/document_choice_id_service.py` — porte intégrité flags/choix
- `api/routers/gdd_notion_sync.py`, `api/container.py`, `api/dependencies.py`, `api/main.py` — wiring type (router récent avec prefix embarqué, getters lazy container)
- `constants.py` (`FilePaths`) — déclarer `data/benchmarks/`

## Tasks & Acceptance

**Execution:**
- [x] `api/schemas/benchmark.py` -- schémas Pydantic : `BenchmarkSuite` (id, version, cas avec catégories libres, `GenerateUnityDialogueRequest` figé + `raw_prompt` optionnel), `BenchmarkRunConfig` (suite@version, modèles, K défaut 3, `budget_cap_usd`), `BenchmarkRunStatus` (`running|completed|interrupted_budget|cancelled`), `BenchmarkGenerationRecord` (statuts `valid|invalid|config_error`) -- contrat unique pour run/jugement/API futurs
- [x] `constants.py` -- ajouter les chemins `FilePaths` benchmark (`data/benchmarks/suites/`, `.../runs/`) -- pas de chemins en dur
- [x] `services/benchmark_suite_store.py` -- CRUD + import/export de suites sous `data/benchmarks/suites/`, versionnées, via `write_json_atomic` ; refuse une suite à 0 cas -- suites en donnée, versionnables git
- [x] `services/benchmark_language_gate.py` + `requirements.txt` -- détection FR via dépendance dédiée (validée par l'utilisateur), repli heuristique si la lib est absente, seuil documenté + tests -- brique absente du repo
- [x] `services/benchmark_gate_service.py` -- portes structurelles (schéma Unity, flags/choix, langue, non-vide/tronqué) → `BenchmarkGenerationRecord` `valid`/`invalid` motivé -- chaque ligne de la matrice I/O
- [x] `services/benchmark_run_service.py` -- orchestration async (pattern GDD) : `asyncio.create_task`, `run_id`, progression in-memory + statut persisté, pause/cancel coopératifs, checkpoint après chaque génération, reprise validée par empreinte de suite, plafond budget via coût réel cumulé + `check_budget`, neutralisation fallback, détection `DummyLLMClient`/erreurs protocole → `config_error` -- cœur de la spec
- [x] `api/routers/benchmark.py` -- `/api/v1/benchmark` : CRUD suites + import/export, `POST /runs` (estimation de coût pré-lancement), `GET /runs/{id}/status`, `GET /runs/{id}/progress`, `POST /runs/{id}/pause|unpause|cancel|resume` -- surface consommée par jugement/rapport/UI/CLI futurs
- [x] `api/container.py` + `api/dependencies.py` + `api/main.py` -- getters lazy + `include_router` style récent -- conventions repo
- [x] `tests/services/test_benchmark_gate_service.py`, `test_benchmark_run_service.py`, `test_benchmark_suite_store.py` -- unitaires : chaque ligne de la matrice I/O, reprise sans refaite (compteur d'appels mock), plafond budget, `config_error` -- LLM mocké (`DummyLLMClient`/AsyncMock)
- [x] `tests/api/test_benchmark.py` -- TestClient : cycle suite→run→statut avec LLM mocké, 400 suite vide, 409 reprise invalide -- contrat API

**Acceptance Criteria:**
- Given une suite de 3 cas et 2 modèles mockés, when un run est lancé puis complété, then 6 `BenchmarkGenerationRecord` sont persistés avec statut et coût.
- Given un run interrompu (budget ou cancel), when `resume`, then aucune génération déjà produite n'est recalculée (compteur d'appels mock inchangé pour les cas déjà faits).
- Given une génération en anglais ou un JSON invalide, when la porte s'exécute, then le record est `invalid` avec une raison, jamais un score.
- Given un modèle sans clé API, when le run le traite, then ses records sont `config_error` et les autres modèles du run ne sont pas affectés.
- Given une suite à 0 cas, when un run est demandé, then 400 immédiat, aucun appel LLM.

## Spec Change Log

### 2026-08-05 — Reproductibilité du prompt : graine au lieu de prompt figé

**Déclencheur** : la spec prévoyait de figer le `raw_prompt` du premier passage et de le
rejouer. Vérification à l'implémentation : l'orchestrateur n'accepte aucun prompt en entrée,
et `enrich_context_selections_for_scene(random_excerpt_count=1)` ajoute **une fiche
personnage tirée au hasard à chaque appel**. Deux modèles n'auraient donc jamais reçu le même
prompt — la prémisse « deux générations répondant au même prompt » (§2 pairwise) était
inatteignable, et la mesure aurait été biaisée sans le signaler.

**Amendement** : champ optionnel `context_seed` sur `GenerateUnityDialogueRequest`
(défaut `None` = comportement historique inchangé, aucun appel existant modifié).
L'orchestrateur passe `random.Random(context_seed)` à l'enrichissement quand la graine est
fournie. Le moteur de run dérive une graine stable du `case_id` (SHA-256, pas `hash()` qui
est randomisé par processus) : tous les modèles et toutes les répétitions d'un cas reçoivent
strictement le même prompt, y compris après une reprise dans un autre processus.

**État évité** : un benchmark dont chaque génération porte un contexte GDD différent,
produisant un classement qui mesure la chance du tirage autant que le modèle.

**KEEP** : le champ reste optionnel et par défaut inactif — la génération applicative
courante ne doit pas devenir déterministe par effet de bord.

### 2026-08-05 — Budget isolé et endpoints de run réservés admin

**Déclencheur** : arbitrage utilisateur sur les deux points « Ask First ».

**Amendement** : `cost_governance_service.check_budget` n'est **pas** appelé par le run ;
le plafond est le compteur propre au run (`budget_cap_usd`). L'exécution pousse
`push_billable_user_id("benchmark")`, ce qui isole la consommation de `track_usage` sur une
identité dédiée dans `data/cost_budgets.json` au lieu d'entamer le quota mensuel d'un humain.
Lancement, reprise, pause, annulation, écriture et import de suites passent par
`require_admin` ; la lecture reste ouverte aux utilisateurs authentifiés.

**État évité** : un run de benchmark qui épuise le quota LLM mensuel de l'utilisateur courant
et bloque son travail de génération réel.

## Design Notes

- **Stockage** : `data/benchmarks/suites/<suite_id>.json`, `data/benchmarks/runs/<run_id>/{run.json, checkpoint.json, generations/<model>__<case>__<k>.json}`. `run.json` porte l'identité du run (suite+version, modèles, K) — nécessaire pour que jugement/rapport (specs suivantes) valident la comparabilité.
- **Reproductibilité** : l'orchestrateur ne rejoue pas un prompt fourni. La reproductibilité passe donc par une **graine** (`context_seed`) dérivée du `case_id`, qui rend déterministe le seul facteur aléatoire du prompt (la fiche personnage tirée au hasard). Voir Spec Change Log du 2026-08-05.

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest tests/services/test_benchmark_gate_service.py tests/services/test_benchmark_run_service.py tests/services/test_benchmark_suite_store.py tests/api/test_benchmark.py -v` -- expected: tous verts
- `npm run test:backend:fast` -- expected: aucune régression (T2)

**Manual checks (if no CLI):**
- `npm run api:invoke -- -Method GET -Path /api/v1/benchmark/suites` après seed -- liste la suite d'exemple.

## Suggested Review Order

**Moteur de run — le cœur, et l'essentiel du risque**

- Point d'entrée : la boucle cas × modèles × répétitions, avec reprise, budget et coopération.
  [`benchmark_run_service.py:722`](../../services/benchmark_run_service.py#L722)

- Refus de lancement d'un run qui ne pourrait rien mesurer — la garde la plus rentable.
  [`benchmark_run_service.py:491`](../../services/benchmark_run_service.py#L491)

- Garde d'unicité sur `_active_run_id` : le verrou est pris trop tard pour servir de garde.
  [`benchmark_run_service.py:388`](../../services/benchmark_run_service.py#L388)

- Détection du repli silencieux sur `DummyLLMClient` — sinon on note un modèle factice.
  [`benchmark_run_service.py:311`](../../services/benchmark_run_service.py#L311)

- Graine dérivée du cas : condition pour que deux modèles reçoivent le même prompt.
  [`benchmark_run_service.py:890`](../../services/benchmark_run_service.py#L890)

- Un record tronqué ne compte pas comme fait, sinon la matrice garde un trou définitif.
  [`benchmark_run_service.py:684`](../../services/benchmark_run_service.py#L684)

- Les commandes de contrôle honorent le `run_id` du chemin, pas « le run actif ».
  [`benchmark_run_service.py:564`](../../services/benchmark_run_service.py#L564)

**Reproductibilité du prompt — écart assumé avec la spec initiale**

- Champ optionnel, défaut inactif : la génération applicative reste aléatoire.
  [`dialogue.py:465`](../../api/schemas/dialogue.py#L465)

- Trois lignes dans l'orchestrateur ; seul point où le dépôt existant est modifié.
  [`unity_dialogue_orchestrator.py:163`](../../services/unity_dialogue_orchestrator.py#L163)

**Portes structurelles — ce qui décide si une génération compte**

- Ordre des portes et court-circuit sur JSON illisible.
  [`benchmark_gate_service.py:100`](../../services/benchmark_gate_service.py#L100)

- Détection FR : langdetect si présent, repli lexical sinon, seuils nommés.
  [`benchmark_language_gate.py:104`](../../services/benchmark_language_gate.py#L104)

- L'apostrophe est un séparateur : sans cela un dialogue français naturel sortait `invalid`.
  [`benchmark_language_gate.py:70`](../../services/benchmark_language_gate.py#L70)

**Comparabilité des suites**

- L'empreinte exclut la version : un export/import ne doit pas casser la comparabilité.
  [`benchmark_suite_store.py:45`](../../services/benchmark_suite_store.py#L45)

**Surface API**

- Lecture des suites ouverte, tout ce qui coûte ou expose le contexte GDD réservé admin.
  [`benchmark.py:55`](../../api/routers/benchmark.py#L55)

**Périphérie**

- Durcissements issus de la revue : budget rejoué, statut menteur, contrôle du mauvais run.
  [`test_benchmark_run_hardening.py:1`](../../tests/services/test_benchmark_run_hardening.py#L1)

- Diagnostic réel des modèles, y compris le repli `DummyLLMClient`.
  [`test_benchmark_model_diagnostics.py:1`](../../tests/services/test_benchmark_model_diagnostics.py#L1)

- Correctif hors périmètre : les tests de logs lisaient les vrais logs du dépôt.
  [`test_logs.py:20`](../../tests/api/test_logs.py#L20)
