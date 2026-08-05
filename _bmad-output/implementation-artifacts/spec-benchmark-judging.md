---
title: 'Mode Benchmark — grille de critères en donnée et notation rubrique'
type: 'feature'
created: '2026-08-05'
status: 'done'
review_loop_iteration: 0
context: []
baseline_commit: '039f4b62c'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le noyau benchmark produit des générations valides mais ne les note pas. Le seul juge du dépôt (`llm_quality_judge_service`) a sa grille verrouillée en dur à 4 critères et n'enregistre pas quel juge a produit quelle note : l'utiliser tel quel donnerait une impression, pas une mesure.

**Approach:** Une grille de critères éditable en donnée, et une passe de notation absolue qui rejoue les générations déjà produites — sans jamais en régénérer — pour donner à chaque génération valide un profil par critère. Le juge est enregistré sur chaque verdict, son raisonnement libre est stocké mais jamais compté, et l'appariement des critères passe exclusivement par leur identifiant stable.

## Boundaries & Constraints

**Always:**
- Appariement des critères sur l'**identifiant stable**, jamais sur le libellé. Un identifiant manquant ou inconnu dans la réponse du juge est une erreur explicite, jamais un critère ignoré en silence.
- Le sens d'un critère (`higher_is_better` / `lower_is_better`) et son poids viennent de la grille, pas du code.
- **Jamais de régénération** : la passe lit les générations persistées du run.
- Seules les générations `valid` sont notées ; `invalid` et `config_error` sont ignorées, jamais notées zéro.
- **Le raisonnement libre du juge est stocké pour audit et jamais analysé** : les scores sont lus uniquement dans les champs structurés dédiés.
- Chaque verdict porte le modèle juge qui l'a produit ; les verdicts de juges différents cohabitent sans se mélanger.
- La longueur de la génération est mesurée et enregistrée **à côté** des notes, jamais fondue dedans.
- Passe asynchrone reprenable et budgétée, sur le patron coopératif du moteur de run (verrou, progression, pause/annulation, sauvegarde après chaque verdict).
- Aucun échec silencieux : grille absente ou vide, run inconnu, run sans génération valide, juge mal configuré → arrêt avec message clair avant tout appel LLM.

**Ask First:**
- Modifier `llm_quality_judge_service` ou son schéma à 4 critères (l'endpoint FR42 existant en dépend).

**Never:**
- Pas de comparaison par paires (spec suivante), pas de classement, pas de rapport agrégé.
- Pas d'UI ni de CLI.
- Pas de fusion des mesures déterministes (slop, edit distance) dans les notes du juge.
- Pas de normalisation silencieuse : un score non normalisable est rendu brut et étiqueté comme tel.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Passe nominale | run terminé, 6 générations valides, grille de N critères | 6 verdicts persistés au fil de l'eau, un score par critère, statut `completed` | N/A |
| Aucune régénération | passe sur un run terminé | zéro appel à l'orchestrateur de génération | N/A |
| Re-jugement autre juge | passe relancée avec un juge différent | nouveaux verdicts sous ce juge, générations et verdicts précédents intacts | N/A |
| Critère manquant | juge omet un identifiant de la grille | verdict `judge_error` nommant l'identifiant manquant, passe continue | N/A |
| Identifiant inconnu | juge invente un identifiant | verdict `judge_error`, l'identifiant inventé n'entre nulle part | N/A |
| Générations non valides | run dont tout est `invalid` / `config_error` | 400 immédiat, message clair, aucun appel LLM | N/A |
| Grille vide ou introuvable | grille absente du magasin | 400 immédiat, aucun appel LLM | N/A |
| Juge mal configuré | clé API absente (repli `DummyLLMClient`) | 400 au lancement, la passe ne démarre pas | N/A |
| Plafond budget | coût cumulé de la passe ≥ plafond | arrêt propre, verdicts déjà produits conservés, statut `interrupted_budget` | N/A |

</frozen-after-approval>

## Code Map

- `services/benchmark_run_service.py` — patron coopératif à réutiliser (verrou, `_is_active`, pause/annulation, reprise, plafond, `_record_is_usable`) et source des générations (`list_generations`) ; `diagnose_models` sert aussi à valider le juge
- `api/schemas/benchmark.py` — `BenchmarkGenerationRecord` (entrée), `BenchmarkRunProgress` (forme de la progression)
- `services/llm_quality_judge_service.py` — modèle d'appel juge (`generate_variants(response_model=…)` + prompt système) ; **grille verrouillée**, s'en inspirer sans l'étendre
- `models/dialogue_quality_judge.py` — pourquoi la grille en dur ne convient pas : `Literal` + `min_length=4`
- `core/prompt/dialogue_quality_judge.py` — forme du prompt juge (logique métier seule, schéma laissé à Pydantic)
- `services/llm_pricing_service.py` — estimation et plafond de la passe
- `services/gdd_notion_atomic_io.py` — `write_json_atomic`
- `api/routers/benchmark.py` — surface à étendre (garde admin `_require_admin_user` en place)
- `constants.py` (`FilePaths`) — chemins `data/benchmarks/criteria/`

## Tasks & Acceptance

**Execution:**
- [x] `api/schemas/benchmark_judging.py` -- `CriterionDefinition` (id stable, libellé, description juge, `direction`, `weight`), `CriteriaGrid`, `RubricVerdict` (scores par identifiant, `judge_model`, `reasoning`, longueur mesurée, statut `scored`/`judge_error`), `JudgePassConfig`, `JudgePassState` -- contrat consommé par le pairwise, le classement et le rapport à venir
- [x] `constants.py` -- chemins `FilePaths` de la grille -- pas de chemin en dur
- [x] `services/benchmark_criteria_store.py` -- CRUD de grilles sous `data/benchmarks/criteria/`, refus d'une grille vide ou aux identifiants dupliqués, grille de départ (§5 de la spec fonctionnelle, dont « correction du français ») livrée en seed versionnable -- critères éditables sans toucher au code
- [x] `models/benchmark_judge_output.py` -- sortie structurée générique (`criterion_id: str` libre, `score`, `comment`, `reasoning` isolé), validée **après coup** contre la grille -- une grille en donnée ne peut pas être un `Literal`
- [x] `core/prompt/benchmark_judge.py` -- prompt rubrique construit depuis la grille (libellé, description, sens) -- le prompt suit la grille, il ne la redéclare pas
- [x] `services/benchmark_judge_service.py` -- `judge_rubric(record, grid, llm_client, judge_model)` : un verdict, scores lus uniquement dans les champs structurés, juge et longueur enregistrés, conformité à la grille vérifiée -- cœur du livrable
- [x] `services/benchmark_judge_pass_service.py` -- passe asynchrone sur un run terminé : sélection des `valid`, progression, pause/annulation, sauvegarde après chaque verdict, reprise, plafond, diagnostic du juge avant démarrage -- même patron coopératif que le moteur de run
- [x] `api/routers/benchmark.py` + `api/container.py` + `api/dependencies.py` -- CRUD grilles, `POST /runs/{id}/judge`, `GET /runs/{id}/verdicts`, `GET /judge/progress`, `POST /judge/pause|unpause|cancel` -- surface admin cohérente avec l'existant
- [x] `tests/services/test_benchmark_criteria_store.py`, `test_benchmark_judge_service.py`, `test_benchmark_judge_pass_service.py` -- chaque ligne de la matrice I/O, juge mocké ; assertions explicites : aucun appel de génération, raisonnement mentionnant un score non compté, critère manquant/inconnu, sens `lower_is_better` issu de la grille -- les garde-fous sont la valeur du livrable
- [x] `tests/api/test_benchmark_judging.py` -- TestClient : cycle grille → passe → verdicts, 400 grille vide, 400 run sans génération valide, 403 non-admin -- contrat API

**Acceptance Criteria:**
- Given un run terminé avec 6 générations valides et 2 invalides, when la passe s'exécute, then 6 verdicts sont persistés, aucun pour les invalides, et l'orchestrateur de génération n'a reçu aucun appel.
- Given un juge dont le raisonnement libre annonce un score différent de celui du champ structuré, when le verdict est extrait, then seul le champ structuré fait foi.
- Given une grille dont un critère est `lower_is_better`, when un verdict est produit, then le sens et le poids viennent de la grille et l'identifiant seul sert à l'appariement.
- Given une réponse de juge à laquelle il manque un critère, when elle est validée, then le verdict est `judge_error` en nommant l'identifiant manquant et la passe continue.
- Given une passe relancée avec un second juge, when elle se termine, then les verdicts des deux juges coexistent sans se mélanger et chacun porte son `judge_model`.
- Given un run sans aucune génération valide, when la passe est demandée, then 400 immédiat et aucun appel LLM.

## Spec Change Log

## Design Notes

- **Stockage** : `data/benchmarks/criteria/<grid_id>.json` ; verdicts sous `data/benchmarks/runs/<run_id>/verdicts/rubric/<juge>__<modèle>__<cas>__<k>.json`. Le juge fait partie du chemin : deux juges cohabitent sans collision, et regrouper par juge est trivial.
- **Grille en donnée vs structured output** : le schéma exposé au LLM porte `criterion_id: str` libre ; la conformité à la grille est vérifiée après coup (tous présents, aucun inconnu). Un `Literal` figerait la grille dans le code — ce que la spec interdit explicitement.
- **Longueur** : mesurée par le service et enregistrée dans le verdict, jamais soumise au juge comme critère. Elle sert au rapport à venir pour repérer un modèle qui écrit le double de la consigne.
- **Contrôles coopératifs** : patron identique au moteur de run. Extraire un helper partagé si l'extraction reste sous ~80 lignes ; sinon dupliquer et le noter. Le code du moteur est couvert par 80 tests, ce qui rend la refonte mesurable.

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest tests/services/test_benchmark_judge_service.py tests/services/test_benchmark_judge_pass_service.py tests/services/test_benchmark_criteria_store.py tests/api/test_benchmark_judging.py -v` -- expected: tous verts
- `node scripts/getPythonPath.js -m pytest tests/ -k benchmark -q` -- expected: aucune régression (80 tests noyau existants)
- `npm run test:backend:fast` -- expected: T2 verte

## Suggested Review Order

**Les garde-fous — la valeur du livrable**

- Point d'entrée : un verdict, et rien lu hors des champs structurés.
  [`benchmark_judge_service.py:173`](../../services/benchmark_judge_service.py#L173)

- Conformité à la grille : manquant, inconnu, dupliqué — jamais de verdict partiel.
  [`benchmark_judge_service.py:77`](../../services/benchmark_judge_service.py#L77)

- Le sens et le poids figés dans le verdict : sans quoi inverser un critère réécrit le passé.
  [`benchmark_judging.py:171`](../../api/schemas/benchmark_judging.py#L171)

- Le prompt suit la grille, y compris le sens inversé ; aucune liste dupliquée en code.
  [`benchmark_judge.py:58`](../../core/prompt/benchmark_judge.py#L58)

**Passe de jugement**

- Refus de lancement : juge factice, run encore en génération, plafond insuffisant.
  [`benchmark_judge_pass_service.py:390`](../../services/benchmark_judge_pass_service.py#L390)

- Boucle : verdicts incrémentaux, plafond, annulation coopérative, statut honnête.
  [`benchmark_judge_pass_service.py:520`](../../services/benchmark_judge_pass_service.py#L520)

- Un verdict d'un schéma antérieur ne compte pas comme une notation faite.
  [`benchmark_judge_pass_service.py:159`](../../services/benchmark_judge_pass_service.py#L159)

- Dépense recalculée depuis les verdicts, jamais lue dans l'état persisté.
  [`benchmark_judge_pass_service.py:283`](../../services/benchmark_judge_pass_service.py#L283)

**Budget**

- Repli tarifaire : un client sans suivi d'usage rendrait le plafond inopérant.
  [`benchmark_judge_service.py:134`](../../services/benchmark_judge_service.py#L134)

**Refactor partagé — le moteur de run a été recâblé dessus**

- Désarmement à la libération : une annulation ne doit pas survivre à la passe suivante.
  [`benchmark_pass_control.py:54`](../../services/benchmark_pass_control.py#L54)

**Grille en donnée**

- Amorçage par marqueur, hors de tout chemin de lecture.
  [`benchmark_criteria_store.py:85`](../../services/benchmark_criteria_store.py#L85)

- Grille de départ : critères négatifs explicites, français pondéré au maximum.
  [`benchmark_criteria_seed.py:1`](../../services/benchmark_criteria_seed.py#L1)

**Périphérie**

- Contrôle coopératif enfin testé en direct — il stérilisait le service en cas de défaut.
  [`test_benchmark_pass_control.py:1`](../../tests/services/test_benchmark_pass_control.py#L1)

- Garde-fous anti-biais, dont le raisonnement contaminant.
  [`test_benchmark_judge_service.py:1`](../../tests/services/test_benchmark_judge_service.py#L1)
