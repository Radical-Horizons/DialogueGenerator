---
description: Invariants du mode Benchmark — portes structurelles, contrôles de biais du juge, unité de mesure, gouvernance du coût
globs: ["services/benchmark_*.py", "api/routers/benchmark.py", "api/schemas/benchmark*.py", "core/prompt/benchmark_judge.py", "models/dialogue_structure/unity_dialogue_fragment.py", "services/unity_dialogue_fragment_resolver.py"]
alwaysApply: false
---

# Mode Benchmark — invariants

Le benchmark répond à **une** question : quel LLM employer pour générer nos
dialogues. Ce n'est pas un outil de QA sur un dialogue donné. Chaque invariant
ci-dessous existe parce que l'enfreindre produit un **chiffre qui a l'air d'une
mesure sans en être une** — le mode de défaillance propre à ce genre d'outil.

**Procédure, coûts, pièges d'environnement** : `docs/benchmark/runbook.md`.
**Protocole, écarts assumés vis-à-vis d'EQ-Bench** : `docs/benchmark/eq-bench-reference.md`.

## Mesure

- **Une génération recalée par une porte est `invalid`, jamais notée zéro.** Elle
  sort des moyennes. Un zéro écraserait la moyenne d'un modèle par ailleurs bon
  et transformerait un défaut de forme en jugement de qualité.
- **Le taux de validité par modèle est une mesure de premier ordre**, à publier
  au même titre que les notes.
- **L'unité mesurée est un fragment** : un panneau, ses options, et le panneau
  qui suit chacune d'elles avec ses propres options — produit en **un seul appel**
  (`fragment_mode`). Sur un nœud isolé dont les choix pointent vers `END`,
  « conséquence perceptible » et « cohérence des embranchements » notent le vide
  (mesuré : 1,3/20 avant la bascule, 8–9/20 après).
- **Ce qui est objectivement vérifiable relève d'une porte, pas du juge** :
  longueur, bornes de choix, connexité, langue, conformité au schéma. Faire
  arbitrer un fait par un LLM ajoute du bruit là où il n'y a rien à interpréter.
- **Une forme fautive mais corrigeable se normalise, elle ne se pénalise pas.**
  Un nom de flag accentué passe par `normalize_unity_export_document` ; le
  compter invalide ferait chuter un taux de validité pour une raison sans rapport
  avec la qualité du dialogue.

## Juge

- **Le juge reçoit le contexte réellement fourni au candidat.** Sans lui,
  « justesse de la voix » et « fidélité au contexte » sont notés à l'aveugle — le
  juge le dit lui-même dans ses commentaires, et la note entre quand même dans la
  moyenne pondérée avec l'autorité d'une mesure.
- **Chaque paire est jugée dans les deux sens**, étiquettes opaques. Un fort taux
  de désaccord entre les deux passes est une information sur l'instabilité du
  juge, pas un bruit à moyenner.
- **Le contexte d'un duel n'est transmis que s'il est identique des deux côtés**,
  sinon il désigne implicitement l'une des propositions.
- **Le raisonnement libre du juge est conservé pour audit, jamais parsé** pour en
  extraire un verdict. C'est le mode de défaillance n°1 d'EQ-Bench.
- **Le modèle juge est enregistré avec chaque note.** Ne jamais agréger des notes
  produites par des juges différents.
- **Les critères sont de la donnée, appariés par identifiant stable** — jamais par
  libellé. Chaque verdict fige un `criteria_snapshot` (sens et poids).

## Comparabilité et coût

- **`narration_mode` fait partie de l'identité du run.** Deux runs de modes
  différents ne s'agrègent pas.
- **Même prompt pour tous les modèles et toutes les répétitions d'un cas** :
  `context_seed` est dérivé du `case_id` par SHA-256 — jamais `hash()`, randomisé
  par processus, ce qui casserait la reprise.
- **Plafond budgétaire dur, estimation avant lancement, coût réel enregistré.**
  Un modèle sans tarif connu fait refuser le lancement : sans prix, le plafond ne
  se déclencherait jamais.
- **Facturation sur une identité dédiée** (`BENCHMARK_BILLABLE_USER_ID`) : le
  coût des runs n'entame pas le quota d'un humain.
- **Aucun repli LLM pendant un run** (`_NoFallbackConfigService`) : sinon un échec
  ferait mesurer un autre modèle et lui attribuerait la note du modèle demandé.

## Données

- **Les suites et la grille sont semées depuis le code** — `benchmark_suite_seed.py`
  et `benchmark_criteria_seed.py` sont la source de vérité. `data/benchmarks/` est
  dérivé et gitignoré ; supprimer `suites/` puis redémarrer régénère.
- **Le semis n'est jamais déclenché depuis un chemin de lecture** : un `GET` ne
  doit pas écrire. Marqueur `.seeded`, posé à la construction du service.
- **Toute entité GDD citée par un cas doit exister sous son nom canonique exact**,
  apostrophes comprises. Un nom approximatif ne lève aucune erreur — il vide
  silencieusement le contexte, et le run entier mesure du vide. Test dédié :
  `tests/services/test_benchmark_suite_seed.py`.

## Interdits

- Réintroduire une génération multi-appels pour produire un fragment (coût ×N,
  et les branches seraient écrites en aveugle les unes des autres).
- Exposer au LLM les identifiants techniques Unity (`targetNode`, `nextNode`,
  `successNode`, `failureNode`). Les **clés locales d'auteur** n'en sont pas :
  elles expriment l'enchaînement voulu et disparaissent à la résolution.
- Ajouter un modèle de réponse structurée sans l'enseigner à `DummyLLMClient` :
  les clients LLM aiguillent sur `response_model.__name__`, et tout
  développement sans clé API casserait silencieusement.
- Lancer un run facturé de sa propre initiative : c'est l'utilisateur qui déclenche
  la dépense.
