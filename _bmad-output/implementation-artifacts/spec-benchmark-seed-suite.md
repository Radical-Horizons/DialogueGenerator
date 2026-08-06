---
title: 'Mode Benchmark — jeu de cas de départ, ancré dans le GDD'
type: 'feature'
created: '2026-08-06'
status: 'draft'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le mode benchmark est complet mécaniquement mais n'a **aucune matière** : `data/benchmarks/` n'existe pas. Un benchmark embarque son jeu de test — EQ-Bench livre ses 32 prompts, il ne demande pas à l'utilisateur d'écrire les siens. En l'état, personne ne peut lancer la moindre mesure sans rédiger du JSON à la main.

**Approach:** Livrer un jeu de cas de départ en donnée versionnée, semé au démarrage comme l'est déjà la grille de critères, et ancré dans les entités réelles du GDD. Les contraintes chiffrées du système de dialogue — panneau ≤ 150 mots cible / 300 plafond, 2 à 10 options — deviennent des attentes déclarées par cas, vérifiées par les portes plutôt que laissées au jugement du LLM. La présence de didascalies de narration devient un **mode de run**, pas une propriété de cas : elle ne dépend ni du personnage ni du lieu, et la dupliquer par cas doublerait le coût pour rien.

## Boundaries & Constraints

**Always:**
- Les cas emploient des **entités réelles du GDD**, avec leurs noms exacts : `Uresaïr`, `Voknir Esh'Maradel`, `Zaehria Neth'Varu`, `Genka Lien`, `L'Ensevelie`, `Akthar-Neth Amatru`, `Atelier des Matrices Ossifiées`, `Tunnel vertébral`, `Strate I - La Périphérie Caudale`, `Strate IV - Le Nexus Synaptique`, `Nef Centrale`, `Plis d’ossements`, `Léviathan pétrifié`, `Van’Doei` (apostrophes courbes comprises).
- Composition de contexte **par rôle** : PNJ locuteur en `characters_full`, Uresaïr en `characters_excerpt`, lieu de la scène **et son lieu parent** en `locations_excerpt`. Jamais deux fiches complètes — elles font 56k à 109k caractères.
- **Uresaïr est le seul PJ** du first playable ; les PNJ sont toujours les locuteurs.
- La présence de didascalies est un **mode de run** appliqué uniformément à tous les cas, et fait **partie de l'identité du run** : deux runs de modes différents ne s'agrègent pas.
- Catégories de cas : `fonction`, `ton`, `contexte` (`court`/`long`), `personnage`. Libres, pas une énumération fermée.
- Les attentes structurelles d'un cas (bornes d'options, plafond de mots) sont **des données du cas**, vérifiées par les portes — jamais des points retirés par le juge.
- Le semis n'écrase jamais une suite existante et n'est jamais déclenché par une lecture.

**Ask First:**
- Dépenser réellement sur l'API : l'utilisateur déclenche un run facturé, l'agent ne le lance pas de sa propre initiative.

**Never:**
- Pas de fiches Connaissances dans cette spec — non synchronisées localement (différé).
- Rien de construit sur le « iel » des fiches : ces personnages parlent une langue **sans genre**, et le rendu français dépend de ce que le point de vue perçoit. Sujet non instruit.
- Pas de classement, pas de rapport agrégé, pas d'UI, pas de CLI.
- Aucune entité inventée : si elle n'est pas dans le GDD, elle n'entre pas dans un cas. Aucun lieu parent supposé.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Poste neuf | `data/benchmarks/suites/` absent | Les deux suites de départ sont semées au démarrage ; `GET /suites` les liste | N/A |
| Suite déjà présente | une suite maison existe | Le semis ne s'exécute pas, rien n'est écrasé | N/A |
| Suite supprimée | la dernière suite est supprimée | Elle ne renaît pas — marqueur de semis, comme pour la grille | N/A |
| Mode narration | run lancé en mode `avec` puis en mode `sans` | Deux runs distincts, chacun portant son mode dans son identité ; aucune agrégation entre eux | N/A |
| Panneau trop long | génération de 480 mots, cas déclarant `max_words: 300` | Génération `invalid`, porte `length` motivée, exclue des moyennes | N/A |
| Options hors bornes | 1 seule option, cas déclarant `min_choices: 3` | Génération `invalid`, porte motivée | N/A |
| Entité GDD absente | un cas nomme une entité inconnue du GDD | Détecté par un test au semis, message nommant l'entité | N/A |
| Estimation de coût | contexte lourd (fiche PNJ complète) | L'estimation d'entrée dérive du `max_context_tokens` du cas, pas d'une constante forfaitaire | N/A |

</frozen-after-approval>

## Code Map

- `services/benchmark_criteria_seed.py` + `services/benchmark_criteria_store.py::ensure_seeded` — patron exact à reproduire (données en module, semis par marqueur, jamais depuis une lecture)
- `services/benchmark_suite_store.py` — magasin des suites ; il lui manque `ensure_seeded`
- `api/schemas/benchmark.py` — `BenchmarkCase`, `BenchmarkCaseExpectations`, `BenchmarkRunConfig`, `BenchmarkRunIdentity`
- `services/benchmark_gate_service.py::_expectation_failures` — vérifie déjà les bornes de choix ; à étendre au plafond de mots
- `api/schemas/dialogue.py::ContextSelection` — axes `*_full` / `*_excerpt` par catégorie
- `services/benchmark_run_service.py` — `_build_request` (point d'application du mode), `DEFAULT_PROMPT_TOKENS_ESTIMATE = 5000`, `estimate_cost`
- `api/container.py::get_benchmark_suite_store` — point d'amorçage (le magasin de grilles y sème déjà)
- `data/GDD_categories/systemes_de_jeu/Dialogues_*.json` — source des contraintes chiffrées
- `docs/benchmark/eq-bench-reference.md` — référence EQ-Bench et écarts assumés

## Tasks & Acceptance

**Execution:**
- [x] `api/schemas/benchmark.py` -- `max_words` dans `BenchmarkCaseExpectations` ; `narration_mode: avec|sans` dans `BenchmarkRunConfig` et reporté dans `BenchmarkRunIdentity` ; porte `length` dans `BenchmarkGateId` -- le plafond du GDD est une donnée du cas ; le mode conditionne la comparabilité
- [x] `services/benchmark_gate_service.py` -- porte `length` sur la réplique la plus longue, pas sur la somme -- une contrainte objectivement vérifiable ne doit pas coûter des points chez le juge
- [x] `services/benchmark_run_service.py` -- `NARRATION_MODE_DIRECTIVES` appliquées dans `_build_request` ; `PROMPT_OVERHEAD_TOKENS_ESTIMATE` ajouté à l'estimation ; `DEFAULT_PROMPT_TOKENS_ESTIMATE` aligné sur `Defaults.CONTEXT_TOKENS`
- [x] `services/benchmark_suite_seed.py` -- `alteir-smoke` (3 cas) et `alteir-standard` (5 cas), entités réelles, contexte par rôle avec lieu parent -- le jeu de test fait partie du livrable
- [x] `services/benchmark_suite_store.py` -- `ensure_seeded()` par marqueur `.seeded` ; jamais appelé depuis une lecture -- un `GET` ne doit pas écrire
- [x] `api/container.py` -- semis à la construction du magasin de suites -- symétrie avec les grilles
- [x] `tests/services/test_benchmark_suite_seed.py` -- 15 tests : validation, **existence GDD réelle de chaque entité**, une seule fiche complète par cas, couverture des axes, absence d'axe `didascalies`, sous-ensemble strict smoke ⊂ standard, amorçage (neuf / existant / supprimé / version 1)
- [x] `tests/services/test_benchmark_gate_service.py` + `tests/services/test_benchmark_run_service.py` -- porte `length` (sous, au-dessus, absent, plus long panneau ≠ somme) ; mode dans la consigne, identique entre modèles, présent dans l'identité, défaut `sans`
- [x] `tests/api/test_benchmark.py` -- `GET /suites` liste les suites semées sur un magasin neuf

**Acceptance Criteria:**
- Given un poste neuf, when l'API démarre, then `GET /api/v1/benchmark/suites` liste `alteir-smoke` et `alteir-standard` sans configuration préalable.
- Given la suite `alteir-standard`, when on lit ses cas, then chaque entité citée existe dans `data/GDD_categories/`, et aucun cas ne place deux personnages en `characters_full`.
- Given deux runs de la même suite en modes `avec` et `sans`, when on lit leurs identités, then elles diffèrent par le mode, ce qui interdit toute agrégation entre eux.
- Given une génération de 480 mots sur un cas déclarant `max_words: 300`, when les portes s'exécutent, then elle est `invalid` avec une porte `length` motivée, et n'entre pas dans les moyennes.
- Given un cas déclarant `max_context_tokens`, when le coût est estimé avant lancement, then l'estimation d'entrée en découle au lieu d'une constante forfaitaire.
- Given une suite maison déjà présente, when le semis s'exécute, then aucune suite de départ n'est écrite.

## Spec Change Log

- **Didascalies : axe de cas → mode de run.** La version initiale dupliquait la scène de Voknir pour isoler l'effet. Rejeté : la question ne dépend ni du personnage ni du lieu, et la porter par cas double le coût de la suite. Devenue `BenchmarkRunConfig.narration_mode`, reportée dans l'identité du run. Le cas doublon disparaît — six cas deviennent cinq.
- **Lieux corrigés** : Genka Lien → `Tunnel vertébral` (et non Escelion) ; Zaehria → `Strate I - La Périphérie Caudale` ; L'Ensevelie → `Strate IV - Le Nexus Synaptique` ; Akthar-Neth → `Nef Centrale`. Lieux parents joints en extrait là où ils sont connus.
- **Cas Voknir recentré** sur le ton et le rapport à Uresaïr — premier dialogue PNJ du jeu — et sur la qualité d'introduction à l'univers et aux Van’Doei ; l'espèce `Van’Doei` entre dans son contexte.
- **`max_choices` d'attente calé sur 8, pas 10.** Le système de dialogue du GDD annonce 2 à 10 options, le schéma d'export Unity en plafonne 8. C'est le schéma qui recale la génération : attendre 10 rendrait `valid` une sortie que la porte `schema` refuse par ailleurs. **Divergence GDD ↔ schéma à arbitrer hors de cette spec.**
- **`CONTEXT_TOKENS_SHORT` à 10000, pas 8000.** `Defaults.MIN_CONTEXT_TOKENS` vaut 10000 : l'API refuse en dessous.
- **Estimation de coût : le vrai défaut n'était pas celui prévu.** `max_context_tokens` a pour défaut `Defaults.CONTEXT_TOKENS` (10000) et n'est jamais `None` — l'estimation utilisait donc déjà le budget déclaré, et `DEFAULT_PROMPT_TOKENS_ESTIMATE = 5000` était quasi mort. Le vrai manque était l'overhead hors contexte GDD (system prompt, guides, consigne) : `PROMPT_OVERHEAD_TOKENS_ESTIMATE = 1500` l'ajoute.

## Design Notes

**Les cinq cas.**

| # | PNJ | Lieu de scène | Lieu parent | Fonction | Contexte | Ce qui est mesuré en priorité |
|---|---|---|---|---|---|---|
| 1 | Voknir Esh'Maradel | Atelier des Matrices Ossifiées | — | première rencontre | court | **Ton et rapport à Uresaïr**, plus la qualité d'introduction à l'univers et aux Van’Doei |
| 2 | Genka Lien | Tunnel vertébral | — | marchandage | court | Patois de routes, comparaisons spontanées, abstractions personnifiées |
| 3 | Zaehria Neth'Varu | Strate I - La Périphérie Caudale | Plis d’ossements | confrontation | long | Tenue de la voix quand le contexte grossit |
| 4 | L'Ensevelie | Strate IV - Le Nexus Synaptique | Plis d’ossements | révélation | court | Fiche **sans section de voix** : invention sans contradiction du lore |
| 5 | Akthar-Neth Amatru | Nef Centrale | Léviathan pétrifié | révélation | long | Sa fiche a une section « ce dont il refuse de parler » — on l'y emmène : refus en personnage ou effondrement complaisant |

`alteir-smoke` reprend les cas 1, 2 et 4 : de quoi valider la chaîne pour quelques centimes.

- **Le cas Voknir est le plus important.** C'est le premier dialogue avec un PNJ du jeu : il porte à la fois l'établissement du rapport avec Uresaïr et l'entrée du joueur dans l'univers. Son contexte inclut donc l'espèce `Van’Doei` en extrait, et sa consigne demande explicitement une porte d'entrée intelligible pour qui ne connaît rien au monde — sans exposition forcée, que la grille pénalise par ailleurs.
- **Pourquoi ces PNJ.** Voknir et Genka Lien ont des voix à contraintes multiples et simultanées : un modèle qui écrit du PNJ générique y échoue visiblement. L'Ensevelie n'a aucune section de voix — contexte volontairement mince. Akthar-Neth porte un interdit déclaré.
- **Pas de lieu parent supposé.** L'Atelier et le Tunnel vertébral n'en reçoivent pas : les relations du GDD sont stockées en UUID Notion et ne sont pas résolubles ici. Les trois parents connus viennent d'une indication explicite.
- **Cinq cas, pas trente.** Le jeu de départ couvre les axes, il n'épuise pas le GDD. Il grossira par capture depuis l'usage réel — le seul mécanisme qui garantisse qu'on mesure le vrai travail.

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest tests/services/test_benchmark_suite_seed.py tests/services/test_benchmark_gate_service.py tests/services/test_benchmark_run_service.py tests/api/test_benchmark.py -v` -- expected: tous verts
- `node scripts/getPythonPath.js -m pytest tests/ -k benchmark -q` -- expected: aucune régression (224 tests existants)
- `npm run test:backend:fast` -- expected: T2 verte

**Manual checks (if no CLI):**
- `npm run api:invoke -- -Method GET -Path /api/v1/benchmark/suites` -- les deux suites apparaissent sans configuration.
