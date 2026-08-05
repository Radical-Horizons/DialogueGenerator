---
title: 'Mode Benchmark — comparaison par paires sous contrôle de biais'
type: 'feature'
created: '2026-08-05'
status: 'done'
review_loop_iteration: 0
context: []
baseline_commit: '58cadd83b'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La notation absolue sature : au-dessus d'un certain niveau tous les modèles prennent des notes voisines et le classement devient arbitraire. Il manque la seconde jambe — faire choisir le juge entre deux générations d'un même cas — sans laquelle le classement à venir n'a aucune matière.

**Approach:** Une passe de comparaison par paires sur les générations déjà produites, appariées par cas et par répétition pour que les deux textes répondent au même prompt. Les contrôles de biais sont dans le chemin d'exécution, pas en option : chaque paire est jugée dans les deux sens, sous étiquettes opaques dont l'attribution tourne, les deux textes sont tronqués à une même limite annoncée au juge, et le gagnant est lu uniquement dans le champ structuré dédié.

## Boundaries & Constraints

**Always:**
- **Aucune régénération** : la passe lit les générations persistées ; seules les `valid` sont appariées.
- Deux générations ne sont appariables que si elles partagent le **cas** et l'**index de répétition** — donc le même prompt. Jamais d'appariement entre cas ou entre répétitions différentes.
- **Chaque paire est jugée dans les deux sens** et les deux verdicts sont agrégés ; un désaccord entre les deux sens donne une égalité, enregistrée comme telle.
- **Étiquettes opaques** (`A` / `B`) dont l'attribution aux modèles est tirée par paire depuis une graine stable : le juge ne voit jamais un nom de modèle, et ne peut pas apprendre qu'une position correspond toujours au même candidat.
- Les deux textes sont **tronqués à une même limite** avant comparaison, et le juge en est informé pour ne pas pénaliser la coupure ; la longueur réelle de chaque texte est enregistrée à part.
- Le gagnant et la marge sont lus **uniquement** dans les champs structurés ; le raisonnement libre est stocké pour audit et jamais analysé.
- Chaque verdict porte son juge et un instantané de la grille ; les verdicts de juges différents ne se mélangent pas.
- Passe asynchrone reprenable, budgétée, sur le patron coopératif existant.
- Aucun échec silencieux : run inconnu ou encore en génération, grille absente, juge inutilisable, moins de deux modèles appariables → arrêt clair avant tout appel LLM.

**Ask First:**
- Réduire le nombre de paires par échantillonnage si le volume devient coûteux (le nombre de paires croît en carré du nombre de modèles).

**Never:**
- Pas de solveur de classement, pas d'intervalle d'incertitude, pas de rapport agrégé — cette spec produit les duels bruts.
- Pas d'UI ni de CLI.
- Pas de réutilisation des scores rubrique pour départager : le pairwise est une mesure indépendante.
- Jamais de nom de modèle dans le prompt du juge.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Passe nominale | run terminé, 3 modèles × 2 cas × K=1, toutes valides | 3 paires par cas soit 6 duels, chacun jugé deux fois, persistés au fil de l'eau, statut `completed` | N/A |
| Aucune régénération | passe sur un run terminé | zéro appel à l'orchestrateur de génération | N/A |
| Double sens concordant | le juge désigne le même modèle dans les deux sens | ce modèle gagne le critère, marge = moyenne des deux marges | N/A |
| Double sens discordant | le juge désigne un modèle différent selon l'ordre | égalité sur ce critère, désaccord enregistré | N/A |
| Étiquette hors champ | le juge répond autre chose que `A`, `B` ou `tie` | le domaine fermé de `winner` empêche la valeur d'atteindre le service : la réponse est rejetée au schéma, et le duel devient `judge_error` portant l'erreur de validation, qui nomme le critère et la valeur fautive | N/A |
| Raisonnement contaminant | le raisonnement annonce l'autre gagnant | le champ structuré seul fait foi | N/A |
| Appariement impossible | un seul modèle a des générations valides sur le cas | le cas est ignoré, et le rapport de passe le compte | N/A |
| Générations de longueurs très inégales | un texte fait le double de l'autre | les deux sont tronqués à la même limite, longueurs réelles conservées | N/A |
| Moins de deux modèles appariables | run à un seul modèle valide | 400 immédiat, aucun appel LLM | N/A |
| Plafond budget | coût cumulé ≥ plafond | arrêt propre, duels déjà produits conservés, statut `interrupted_budget` | N/A |

</frozen-after-approval>

## Code Map

- `services/benchmark_judge_service.py` — `judge_rubric` comme modèle : validation après coup contre la grille, coût replié sur la tarification, raisonnement isolé. `judge_pair` s'y ajoute.
- `services/benchmark_judge_pass_service.py` — passe rubrique à étendre : sélection des `valid`, `_verdict_is_usable`, `_spent_for`, `_discard_judge_error_verdicts`, plafond total, contrôles coopératifs
- `api/schemas/benchmark_judging.py` — `CriteriaGrid`, `RubricVerdict` (forme à suivre : juge, snapshot de grille, statut, raisonnement)
- `models/benchmark_judge_output.py` — sortie structurée générique ; le pairwise ajoute la sienne (gagnant `A`/`B`/`tie` + marge par critère)
- `core/prompt/benchmark_judge.py` — prompt construit depuis la grille ; le pairwise ajoute le sien, avec la mention de troncature
- `services/benchmark_pass_control.py` — verrou, pause, annulation ; une passe à la fois par service
- `api/routers/benchmark.py` — surface admin à étendre

## Tasks & Acceptance

**Execution:**
- [x] `api/schemas/benchmark_judging.py` -- `PairwiseOutcome` (gagnant par `criterion_id` : `model_id` ou égalité, marge, désaccord entre sens), `PairwiseVerdict` (run, cas, répétition, les deux `model_id`, juge, snapshot de grille, statut, les deux raisonnements, longueurs réelles, troncature appliquée), `PairwisePassConfig` -- contrat consommé par le classement à venir
- [x] `models/benchmark_judge_output.py` -- `BenchmarkPairwiseJudgeResult` : par critère, `winner` ∈ {`A`,`B`,`tie`} et `margin` 0–3, plus `reasoning` isolé -- le gagnant est une étiquette, jamais un nom de modèle
- [x] `core/prompt/benchmark_judge.py` -- prompt de comparaison construit depuis la grille, annonçant la troncature commune et interdisant de préférer le texte le plus long -- parade au biais de longueur
- [x] `services/benchmark_pair_builder.py` -- construction des paires (par cas et index de répétition, modèles distincts), attribution des étiquettes par graine stable dérivée de la paire, troncature commune -- logique pure, testable sans LLM
- [x] `services/benchmark_judge_service.py` -- `judge_pair(...)` : deux appels (sens direct et inverse), lecture du gagnant dans le champ structuré seul, remontée des étiquettes vers les `model_id`, agrégation par critère avec égalité en cas de désaccord -- cœur des contrôles de biais
- [x] `services/benchmark_judge_pass_service.py` -- passe pairwise : énumération des paires, sauvegarde après chaque duel, reprise, plafond, mêmes refus de lancement que la rubrique -- réutilise le patron, ne le duplique pas
- [x] `api/routers/benchmark.py` + `api/container.py` + `api/dependencies.py` -- `POST /runs/{id}/judge/pairwise`, `GET /runs/{id}/pairwise`, progression et contrôles -- surface admin cohérente
- [x] `tests/services/test_benchmark_pair_builder.py` -- appariement, étiquettes tournantes mais reproductibles, troncature -- logique pure
- [x] `tests/services/test_benchmark_judge_pair.py` -- double sens concordant et discordant, étiquette hors champ, raisonnement contaminant, remontée étiquette → modèle, biais de position -- les garde-fous sont la valeur du livrable
- [x] `tests/services/test_benchmark_pairwise_pass.py` + `tests/api/test_benchmark_pairwise.py` -- chaque ligne de la matrice I/O ; aucun appel de génération ; 400 si moins de deux modèles ; 403 non-admin -- contrat

**Acceptance Criteria:**
- Given un run à 3 modèles, 2 cas et K=1 tous valides, when la passe s'exécute, then 6 duels sont persistés, chacun porte deux verdicts de sens opposés, et l'orchestrateur de génération n'a reçu aucun appel.
- Given un juge qui désigne systématiquement la première position, when les paires sont agrégées, then aucun modèle ne gagne : le double sens neutralise le biais de position et tous les critères ressortent à égalité.
- Given un juge dont le raisonnement libre désigne l'autre étiquette, when le verdict est extrait, then seul le champ structuré fait foi.
- Given deux générations dont l'une fait le double de l'autre, when la paire est soumise, then les deux textes envoyés au juge ont la même longueur maximale et les longueurs réelles sont conservées dans le verdict.
- Given deux paires du même cas, when les étiquettes sont attribuées, then l'attribution est reproductible d'une exécution à l'autre sans être constante d'une paire à l'autre.
- Given un cas où un seul modèle a une génération valide, when la passe s'exécute, then le cas est ignoré et le compte des cas non appariables apparaît dans l'état de passe.
- Given un run où un seul modèle a des générations valides, when la passe est demandée, then 400 immédiat et aucun appel LLM.

## Spec Change Log

## Design Notes

- **Appariement par index de répétition** : avec K répétitions, apparier toutes les générations de A avec toutes celles de B donnerait K² duels par paire de modèles et par cas. On apparie donc répétition par répétition (A₀ vs B₀, A₁ vs B₁…) : c'est linéaire en K, et les deux textes partagent alors la même graine de contexte, donc strictement le même prompt.
- **Volume** : le nombre de duels vaut `cas × C(modèles, 2) × K`, et chaque duel coûte deux appels de juge. À 8 modèles ce sont 28 paires par cas et par répétition — l'estimation de coût pré-lancement doit le rendre visible avant de dépenser.
- **Étiquettes** : l'attribution `A`/`B` est tirée d'une graine SHA-256 de `(run_id, case_id, model_a, model_b, repetition)`. Reproductible d'une exécution à l'autre — indispensable à la reprise — sans être devinable ni constante.
- **Stockage** : `data/benchmarks/runs/<run_id>/verdicts/pairwise/<juge>__<empreinte>/<cas>__<modèle_a>_vs_<modèle_b>__<empreinte>__<k>.json`, avec le même suffixe d'empreinte que les verdicts rubrique — deux identifiants qui s'assainissent pareil ne doivent pas partager un fichier.
- **Ordre des modèles dans le nom** : trié, pour qu'une paire ait un seul fichier quel que soit l'ordre d'énumération.

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest tests/services/test_benchmark_pair_builder.py tests/services/test_benchmark_judge_pair.py tests/services/test_benchmark_pairwise_pass.py tests/api/test_benchmark_pairwise.py -v` -- expected: tous verts
- `node scripts/getPythonPath.js -m pytest tests/ -k benchmark -q` -- expected: aucune régression (158 tests existants)
- `npm run test:backend:fast` -- expected: T2 verte

## Suggested Review Order

**Le contrôle de biais — la valeur du livrable**

- Point d'entrée : deux appels, remontée des étiquettes vers les modèles, agrégation.
  [`benchmark_judge_service.py:488`](../../services/benchmark_judge_service.py#L488)

- Le cœur : un désaccord entre sens donne une égalité, et le désaccord est conservé.
  [`benchmark_judge_service.py:341`](../../services/benchmark_judge_service.py#L341)

- Appariement par cas ET répétition, étiquettes tirées d'une graine stable.
  [`benchmark_pair_builder.py:135`](../../services/benchmark_pair_builder.py#L135)

- La coupure n'est excusée que si elle a eu lieu — sinon on apprend au juge à excuser un vrai défaut.
  [`benchmark_judge.py:104`](../../core/prompt/benchmark_judge.py#L104)

**Couverture honnête**

- Les créneaux sans aucun modèle valide sont comptés : l'indicateur ne doit pas être aveugle aux pires runs.
  [`benchmark_pair_builder.py:200`](../../services/benchmark_pair_builder.py#L200)

**Passe et budget**

- Refus de lancement, et dépense relevée **avant** la purge des duels en erreur.
  [`benchmark_judge_pass_service.py:911`](../../services/benchmark_judge_pass_service.py#L911)

- Même correctif sur la passe rubrique : le plafond n'est plus rejouable.
  [`benchmark_judge_pass_service.py:399`](../../services/benchmark_judge_pass_service.py#L399)

**Périphérie**

- Le test qui compte : un juge biaisé en position ne gagne rien.
  [`test_benchmark_judge_pair.py:1`](../../tests/services/test_benchmark_judge_pair.py#L1)

- Bout en bout, un juge qui lit le contenu fait émerger un vrai gagnant.
  [`test_benchmark_pairwise_pass.py:1`](../../tests/services/test_benchmark_pairwise_pass.py#L1)
