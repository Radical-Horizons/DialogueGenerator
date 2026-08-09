---
description: "Invariants du mode Benchmark : portes structurelles, contrôles de biais du juge, unité de mesure, gouvernance du coût"
paths:
  - "services/benchmark_*.py"
  - "frontend/src/components/admin/BenchmarkPanel.tsx"
  - "frontend/src/api/benchmark.ts"
  - "frontend/src/types/benchmark.ts"
  - "services/unity_dialogue_fragment_resolver.py"
  - "api/routers/benchmark.py"
  - "api/schemas/benchmark*.py"
  - "tests/api/test_benchmark*.py"
  - "core/prompt/benchmark_judge.py"
  - "models/dialogue_structure/unity_dialogue_fragment.py"
  - "tests/services/test_benchmark_*.py"
---

# Mode Benchmark — invariants

Le benchmark répond à **une** question : quel LLM employer pour générer nos
dialogues. Ce n'est pas un outil de QA sur un dialogue donné. Chaque invariant
ci-dessous existe parce que l'enfreindre produit un **chiffre qui a l'air d'une
mesure sans en être une** — le mode de défaillance propre à ce genre d'outil.

**Procédure, coûts, pièges d'environnement** : `docs/benchmark/runbook.md`.
**Protocole, écarts assumés vis-à-vis d'EQ-Bench** : `docs/benchmark/eq-bench-reference.md`.

## Mesure

- **Une valeur technique ne disqualifie jamais une réponse.** Panneau trop long,
  options en trop ou en moins, cible pendante, flag manquant, panneaux en nombre
  insuffisant : ce sont des **observations**, pas des recalages. Le texte reste
  jugeable, et ces défauts se corrigent au prompt — les écarter retirerait de la
  mesure le matériau même qu'on cherche à évaluer, et ferait chuter un taux de
  validité pour des raisons sans rapport avec la qualité d'écriture.
  Mécanique : `BenchmarkGateFailure.severity` (`blocking` | `observation`), et
  `BLOCKING_GATES` tient dans une ligne.
- **Ne bloque que ce qui rend le texte illisible** : rien à parser (`parsable`),
  rien à lire (`non_empty`). Plus la **langue**, seule exception assumée — la
  grille note « justesse de la voix » et « tenue du français » : sur un texte
  anglais, la note existerait sans rien mesurer.
- **Corollaire sur le schéma de sortie** : les bornes Pydantic du fragment sont
  volontairement larges (1 panneau, 1 choix). Elles valaient 2 et 2, et un
  fragment d'un seul panneau était rejeté **texte compris**. Le schéma ne garde
  que ce sans quoi il n'y a rien à lire ; le compte attendu par un cas est une
  attente de porte, en observation.
- **Une génération réellement recalée est `invalid`, jamais notée zéro.** Elle
  sort des moyennes. Un zéro écraserait la moyenne d'un modèle par ailleurs bon
  et transformerait un défaut de forme en jugement de qualité.
- **Le taux de validité par modèle est une mesure de premier ordre**, à publier
  au même titre que les notes.
- **L'unité mesurée est un fragment** : un panneau, ses options, et le panneau
  qui suit chacune d'elles avec ses propres options — produit en **un seul appel**
  (`fragment_mode`). Sur un nœud isolé dont les choix pointent vers `END`,
  « conséquence perceptible » et « cohérence des embranchements » notent le vide
  (mesuré sur l'échelle 0–10 : 1,3 avant la bascule, 8–9 après).
- **L'échelle est 0–10**, et un critère `lower_is_better` s'y lit à l'envers (0 =
  le défaut est absent). Toute moyenne pondérée doit donc **normaliser** avant
  d'additionner, sinon elle mélange deux sens opposés.
- **L'agrégation vit dans `benchmark_report_service.py`**, jamais dans l'UI.
  Réécrite en TypeScript, elle deviendrait une seconde implémentation du
  protocole, hors de portée de pytest, qui divergerait sans que rien ne le dise.
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
- **Le coût s'affiche avant d'être engagé.** `POST /runs` estime *et* démarre ;
  `POST /runs/preview` chiffre sans rien créer. Deux routes distinctes plutôt
  qu'un drapeau : un booléen mal sérialisé lancerait un run facturé. La garde de
  lançabilité est **la même fonction** (`assert_measurable`) des deux côtés — la
  dupliquer laisserait l'aperçu promettre ce que le lancement refuse. Une seule
  de ses trois branches échappe à l'aperçu : **le plafond**, qui n'existe pas
  encore quand on chiffre. C'est donc à l'UI de refuser un plafond sous
  l'estimation basse — sinon le serveur oppose un 409 après coup.
- **`config_error` n'entre pas au dénominateur du taux de validité.** Clé absente,
  budget épuisé : c'est une panne d'environnement, pas une propriété du modèle.
  L'y compter ferait lire « ce modèle écrit mal » là où il n'a rien écrit.
- **Corollaire, et le piège le plus coûteux du lot : une sortie non conforme est
  `invalid`, jamais `config_error`.** Le critère est « le modèle a-t-il été
  mesuré ? ». S'il a répondu quelque chose d'inexploitable — JSON sous la borne
  `minItems`, réponse vide, type inattendu — il a été mesuré, et son échec doit
  peser sur son taux. Ranger cela en `config_error` l'**exclut** du dénominateur
  et le flatte : au bench du 2026-08-08, un modèle qui manquait 2 cas sur 3
  affichait « 100 % de validité, 1 tentative », et un modèle incapable de
  produire la structure affichait « aucune tentative » au lieu de 0 %.
  Mécanique : `UnityStructuredOutputError` → `error_kind: model_output` porté par
  l'événement d'erreur → `invalid` + porte `schema`.
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

## Enchaînement

- **Générer sans noter ne répond à aucune question.** La notation fait partie du
  lancement (`BenchmarkRunConfig.auto_judge`), pas d'un second geste qu'on peut
  oublier — l'oublier a déjà produit un run payé et muet.
- **Le plafond de notation se saisit au lancement**, avec l'estimation des deux
  étapes affichée d'un coup. Déclencher la notation plus tard engagerait une
  dépense que personne n'a chiffrée. L'estimation suppose **toutes les
  générations valides** : un plafond calé sur une hypothèse moyenne laisserait un
  run à moitié noté, le pire des deux mondes.
- **Le chaînage vit dans le processus API**, pas dans l'onglet : fermer le
  navigateur n'interrompt rien. Il est déclenché après `_execute`, jamais dans
  son `finally` — la passe de jugement refuse un run encore `running`, et une
  erreur de notation ne doit pas masquer le statut de la génération.
- **Un run `cancelled` ou `failed` n'est pas noté.** Annuler doit arrêter la
  dépense, pas en déclencher une seconde. Un run `interrupted_budget`, lui, a
  produit des mesures réelles : il est noté.
- **Les deux jambes partagent grille et juge.** Un duel arbitré par un autre juge
  que la rubrique ne serait comparable à rien.

## Diagnosticabilité

- **Un échec doit être imputable.** Tant que le harnais n'enregistre ni coût, ni
  tokens, ni raison d'arrêt sur une génération ratée, on ne peut pas distinguer
  « le modèle a mal répondu » de « on l'a coupé » — et toute conclusion sur le
  modèle est une opinion. Constaté le 2026-08-09 : cinq échecs à « 0 token,
  0 $ », dont deux fragments d'un seul panneau **dont les choix pointaient vers
  des panneaux jamais écrits**.
- **Un appel en échec a coûté.** L'usage est relevé sur le client jusque dans le
  chemin d'erreur : sinon le plafond budgétaire sous-compte la dépense réelle.
- **Le plafond de complétion se dimensionne sur l'unité mesurée.** Il valait 2000
  depuis l'ère du panneau unique ; la bascule en fragment a quadruplé la sortie
  attendue sans que personne ne le suive. La meilleure génération consommait 86 %
  du plafond — mesurer si près du plafond, c'est mesurer le plafond.

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
