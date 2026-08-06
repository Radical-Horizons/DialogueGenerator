# EQ-Bench Creative Writing v3 — référence, et ce que nous en reprenons

Document de référence pour le mode Benchmark de DialogueGenerator.

**Pourquoi ce document.** Notre benchmark s'inspire d'EQ-Bench Creative Writing v3. S'en
inspirer sans connaître son fonctionnement réel conduit à recopier ses défauts et à manquer
ses bonnes idées. La partie 1 décrit EQ-Bench tel qu'il est implémenté — elle fait autorité
et ne doit pas être « corrigée » depuis un souvenir ou une lecture de README. La partie 2
décrit nos écarts, chacun justifié.

> ⚠️ EQ-Bench Creative Writing v3 est la branche « écriture créative » de la famille
> EQ-Bench, **pas** le test d'intelligence émotionnelle originel. Ne pas confondre.

---

## 1. EQ-Bench CW v3 — fonctionnement réel

### 1.1 Ce que le bench produit

Deux scores de **nature différente**, issus du même run, qui ne corrèlent pas parfaitement —
et c'est assumé :

| Score | Nature | Échelle | Usage |
|---|---|---|---|
| `eqbench_creative_score` | Absolu — notation sur grille par un juge | 0–100 | Diagnostic par critère ; **sature** en haut de classement |
| `elo_norm` | Relatif — duels tête-à-tête | ~200–1500 | Métrique de classement du leaderboard |

C'est `elo_norm` qui fait le classement. La rubrique sert au diagnostic.

### 1.2 Le pipeline

```
32 prompts × 3 itérations
        │
        ▼
[1] GÉNÉRATION      ── modèle testé ──► 96 textes
        │
        ▼
[2] NOTATION RUBRIC ── modèle juge  ──► 22 notes /20 par texte ──► score 0-100
        │
        ▼
[3] DUELS PAIRWISE  ── modèle juge  ──► gagnant + marge, par paire
        │
        ▼
[4] SOLVEUR TRUESKILL ──► ELO brut ──► normalisation par ancres ──► elo_norm
```

### 1.3 Étape 1 — Génération et seed modifiers

Le jeu de prompts contient **32 prompts** (identifiants 1–33, le 27 n'existe pas : trou
historique). Chacun porte une `category`, un `writing_prompt`, et **~10 seed modifiers** —
321 au total.

- Le prompt final est le `writing_prompt` où `<SEED>` est remplacé par un modifier.
- L'itération *i* prend le seed d'index `(i−1) mod n`. Avec 3 itérations, ce sont
  **toujours les seeds 0, 1, 2** — déterministe, jamais tiré au hasard.
- Double objectif : produire **trois textes différents** pour un même prompt (mesure de
  variance, on ne juge pas un modèle sur un coup de chance), et ajouter **une micro-consigne
  vérifiable** de plus à respecter.

Quatre types de seed modifiers : détail sensoriel, objet ou tic récurrent (force la
continuité sur 1000 mots), complication narrative, contrainte de cadre.

**Les prompts sont conçus pour casser les modèles**, pas pour vérifier qu'ils savent
écrire :

| Famille | Ce qu'elle cible |
|---|---|
| `physical-spatial` | Cohérence spatiale exigée explicitement — talon d'Achille classique des LLM |
| `first-person unique perspective` | Quasi zéro action externe, tout en monologue intérieur — casse le *Tell-Don't-Show* |
| `humour` | Le registre le plus difficile ; un prompt interdit nommément les trois solutions évidentes |
| `fanfic-crossover` | Fidélité au canon sans caricature, fiches de personnages fournies |
| `scp` | Format documentaire contraint, registre bureaucratique |
| Contraintes **négatives** | « pas de scène de combat » alors que la scène est une confrontation armée ; « ne résolvez pas le conflit » |
| Ratios imposés | 50 % dialogue / 20 % monologue / 30 % exposition — vérifiable objectivement |

Presque tous imposent **1000 mots**, et beaucoup fixent la personne et le temps
(`First person, past tense`). Le POV imposé est un signal binaire propre pour
*Adherence to Instructions*.

Paramètres : `temperature=0.7`, `min_p=0.1`, `max_tokens=12000`. Garde-fou : une réponse de
moins de 500 caractères est retentée 3×, puis marquée `generation_failed` — **elle n'est pas
notée zéro**, elle sort de la moyenne.

### 1.4 Étape 2 — Notation sur grille (22 critères)

Chaque texte est envoyé **isolément** au juge. 13 critères positifs, 9 négatifs.

**Groupes** : respect de la commande (1) · personnages (3) · prose et style (7) ·
émotion (5) · structure (4) · synthèse (2).

Trois mécaniques structurantes :

1. **Inversion des négatifs.** Le juge note « à quel point le défaut est présent » ; le code
   applique `20 − note`. Contrainte dure : **le nom du critère négatif doit matcher la
   grille au caractère près**, sinon l'inversion ne se déclenche pas et un défaut *augmente*
   le score. Un contrôle au démarrage protège ce cas précis.
2. **Critères optionnels.** Le juge peut écarter un critère non pertinent (critère de
   dialogue sur un texte sans dialogue). Le nombre de notes remontées varie de 17 à 22.
3. **Pondération plate.** *Overall Impression* ne vaut pas plus que *Weak Dialogue*.

**Le parsing est textuel, par regex** — pas de JSON, pas de function calling. C'est le mode
de défaillance n°1 : un juge qui reformate ses noms de critères produit un run partiellement
muet, sans erreur visible.

Agrégation : moyenne des critères par texte → moyenne des 96 textes → 0–20 → `×5` → 0–100.
Un **bootstrap de 500 rééchantillonnages** donne un IC 95 % pour savoir si un écart entre
deux modèles est réel.

### 1.5 Étape 3 — Duels pairwise (9 dimensions)

Grille **différente et plus courte** que la rubrique. Deux textes en vis-à-vis, verdict
obligatoire (**aucun nul autorisé**), marge de `+` à `+++++`.

| Clé | Dimension |
|---|---|
| `character_authenticity_insight` | Authenticité et finesse des personnages |
| `interesting_original` | Intérêt et originalité |
| `writing_quality` | Qualité d'écriture |
| `coherence` | Cohérence (intrigue, choix, métaphores) |
| `instruction_following` | Respect du prompt |
| `world_and_atmosphere` | Monde et atmosphère |
| `avoids_cliches` | Évite les clichés |
| `avoids_verbosity` | Évite la verbosité fleurie |
| `avoids_poetic_overload` | Évite la métaphore gratuite |

**Les trois dernières sont les contre-mesures anti-biais** : le juge LLM préfère
spontanément le texte le plus orné, on l'oblige donc à noter explicitement la sur-écriture
comme un défaut.

Textes présentés sous pseudonymes `A0493` / `A0488` — **codés en dur dans le parsing** :
changer le template sans changer le parseur casse silencieusement tous les duels (tout
devient nul). Troncature à 4000 caractères. Chaque paire jugée **deux fois**, A/B puis B/A.

⚠️ **Quirk hérité** : pour `avoids_poetic_overload`, `coherence` et `avoids_verbosity`, le
vainqueur gagne ses `+` **et** le perdant se voit retirer le même nombre — ces trois
dimensions pèsent donc **double**. Le commentaire du code débat lui-même de la pertinence de
ce choix, et la présence de `coherence` dans une liste de « critères négatifs » est douteuse.
À traiter comme un comportement hérité, pas comme une intention.

Le décompte des `+` donne vainqueur et marge, normalisée par 45 (9 dimensions × 5).

### 1.6 Étape 4 — Solveur et normalisation

**TrueSkill**, pas Glicko-2 (le README a divergé du code ; c'est le code qui fait foi).

- `mu` initial = 1200, `sigma` = 400.
- La marge de victoire devient des **pseudo-victoires répétées** : une victoire écrasante
  compte comme 4 victoires successives (`bin_size`). C'est l'astuce qui fait entrer « de
  combien » dans un système conçu pour du binaire.
- TrueSkill est séquentiel donc sensible à l'ordre : **10 tirages d'ordres mélangés
  déterministes, moyennés**.
- Un second passage avec un `bin_size` plus petit sert uniquement à estimer `sigma` pour les
  intervalles de confiance.

**Normalisation** : transformation affine calée sur deux modèles-ancres, pour que les scores
restent comparables dans le temps quand le pool grandit.

### 1.7 Le calendrier d'échantillonnage — l'idée la plus rentable

EQ-Bench **ne joue pas tous les duels**. Un nouveau modèle reçoit d'abord un ELO
**interpolé depuis son score rubrique**, qui sert d'amorce. Puis :

| Stage | Adversaires | Comparaisons / adversaire |
|---|---|---|
| 1 | 10 modèles tirés sur toute l'échelle | 1 |
| 2 | voisins de rang ±1, ±2, ±3 | 4, puis 8, puis 16 |
| 3 | mêmes voisins | 48 |

Entre chaque boucle, on résout l'ELO et on regarde si le **rang** a bougé. Stable → stage
suivant ; sinon on reboucle (4 fois maximum).

**Principe** : l'information est dans les duels serrés. Comparer un modèle médiocre à un
excellent ne dit rien qu'on ne sache déjà, et coûte le même prix.

### 1.8 Le pool EST le benchmark

Tout tient dans deux fichiers JSON, sans base de données. `elo_results.json` contient le
**pool de référence** : pour chaque modèle, ses textes, son score rubrique, l'historique de
ses duels, son ELO.

Conséquence : **un ELO n'existe que relativement au pool**. Sans le pool canonique, un score
n'est comparable à rien. Changer de juge, de langue ou de grille invalide toute comparaison
avec l'existant.

Reprise idempotente : chaque tâche porte un statut, chaque duel une signature. Relancer
reprend où l'on s'est arrêté et ne rejuge jamais un duel déjà fait.

### 1.9 Coût

**~10 $ par modèle** en anglais avec un juge Sonnet ; **l'ELO domine la facture**. Un smoke
test à ~0,03 $ existe pour valider la chaîne avant de s'engager.

### 1.10 Biais : traité / non traité

**Traité** : longueur (troncature), position (double jugement), verbosité et surcharge
poétique (dimensions dédiées), variance de génération (3 itérations).

**Non traité** : auto-préférence du juge pour ses propres sorties, aversion NSFW,
préférences stylistiques du juge, biais « slop » (les listes sont dans le dépôt mais **ne
sont pas branchées** dans le scoring).

### 1.11 Le fork français

- Grille, prompts de notation et de duel, et les 32 prompts traduits ; **décors anglophones
  conservés** pour permettre une lecture prompt à prompt contre le leaderboard anglais.
- `--language fr` injecte un system prompt minimal et active une **garde de langue** par
  ratio de mots-outils : une sortie qui dérive vers l'anglais est retentée 3× puis exclue.
- **Le CLI refuse de démarrer** sans pool FR et prompt de duel dédiés — sinon on comparerait
  du français au pool anglais.
- Troncature portée à **4700 caractères** : le français court 15–20 % plus long à contenu égal.
- Le pool FR est reconstruit de zéro. Les scores FR sont comparables entre eux, **pas** au
  leaderboard anglais.

### 1.12 Les cinq pièges signalés par le dev

1. **Coût réel** : ~10 $/modèle, l'ELO domine. Le smoke test existe pour ça.
2. **La grille et les noms de critères sont un contrat.** Modifier un libellé casse
   silencieusement le parsing ou l'inversion des négatifs. Mode de défaillance n°1.
3. **Un ELO n'est valide qu'au sein de son pool.**
4. **Le README a divergé du code** sur deux points (Glicko-2 vs TrueSkill ; ancre basse).
5. **Rubrique et ELO peuvent se contredire** — méthodologies différentes. C'est `elo_norm`
   qui classe.

---

## 2. Notre adaptation

### 2.1 Ce qui change structurellement

Notre exercice n'est pas le leur, et deux différences commandent tout le reste.

**Le ratio entrée/sortie est inversé.** EQ-Bench : prompt court, 1000 mots produits. Nous :
**des milliers de tokens de contexte GDD** en entrée, quelques centaines de mots en sortie.
Conséquences directes :

- Le coût est **dominé par l'entrée**, pas par la sortie. Leur intuition « l'ELO domine la
  facture » ne se transpose pas telle quelle.
- La troncature à 4000 caractères, chez eux quasi neutre (textes homogènes de 1000 mots), ne
  se déclenche pour ainsi dire **jamais** chez nous. Ce n'est pas notre parade au biais de
  longueur — voir §2.4.
- Le critère « fidélité au contexte fourni » devient central, alors qu'il n'a pas
  d'équivalent fort chez eux : nous *donnons* le monde, ils le font inventer.

**L'unité produite est un fragment interactif, pas un texte linéaire.** Un panneau de
dialogue et ses réponses ne se juge pas comme une nouvelle de 1000 mots. Cela ouvre des
critères qu'ils n'ont pas (différenciation des options, lisibilité de l'intention,
conséquence perceptible) et en rend d'autres inopérants.

**Cadre produit** : fantasy / SF / entre les deux, univers maison. Dialogue de jeu vidéo
**littéraire** — la référence est *Planescape: Torment*. Les didascalies sont un **mode de
run** (§2.3) : la question se tranche en comparant deux runs, pas en dupliquant les cas.

### 2.2 Ce que nous reprenons tel quel

| Mécanisme EQ-Bench | Chez nous |
|---|---|
| Deux jambes indépendantes sur **les mêmes** générations | Identique — jamais de regénération pour la seconde jambe |
| Grille de critères en donnée, IDs stables | Identique — 17 critères, 5 en `lower_is_better`, jamais d'appariement par libellé |
| Chaque paire jugée **deux fois**, positions inversées | Identique |
| Pseudonymes opaques, jamais les noms de modèles | Identique, mais **rotatifs** — leurs `A0493`/`A0488` sont en dur |
| Raisonnement libre du juge conservé, jamais parsé | Identique — le parsing regex est leur mode de défaillance n°1 |
| K répétitions pour mesurer la variance | Identique, défaut K=3 |

### 2.3 Ce que nous faisons différemment, et pourquoi

**Les portes structurelles précèdent la notation.** Chez eux, une sortie cassée traverse la
grille et se ramasse des notes basses. Chez nous elle est marquée `invalid` et **exclue des
moyennes** — jamais notée zéro, qui écraserait la moyenne d'un modèle par ailleurs bon. Le
**taux de validité** devient une mesure de premier ordre : en production, un modèle qui écrit
bien une fois sur deux et casse le schéma l'autre fois n'est pas utilisable.

**Un seed déterministe, pas un catalogue de modifiers.** Leurs ~10 modifiers par prompt
diversifient un prompt court. Notre variabilité vient d'ailleurs : `enrich_context_selections_
for_scene` ajoute une fiche de personnage tirée au hasard à chaque appel. Non maîtrisée, elle
rendrait deux modèles incomparables — ils ne recevraient pas le même contexte. D'où
`context_seed`, dérivé du `case_id` par SHA-256 : tous les modèles et toutes les répétitions
d'un cas reçoivent **strictement le même prompt**. (`hash()` ne convient pas : randomisé par
processus, il casserait la reprise.)

**Les didascalies sont un mode de run.** Elles ne dépendent ni du personnage ni du lieu :
les porter par cas obligerait à dupliquer chaque scène et doublerait le coût de la suite.
`BenchmarkRunConfig.narration_mode` applique la même directive à tous les cas, et entre dans
l'identité du run — deux modes ne s'agrègent pas.

**Les contraintes chiffrées sont des portes, pas des critères.** Le système de dialogue vise
150 mots par panneau et plafonne à 300 ; il autorise 2 à 10 options (le schéma d'export Unity
en plafonne 8). Ce sont des faits vérifiables : la porte `length` et les bornes de choix les
tranchent. Les faire juger par un LLM introduirait du bruit là où il n'y a rien à interpréter.

**Pas de pondération héritée.** Trois de leurs neuf dimensions pairwise comptent double, par
accident historique assumé. Nos poids sont explicites et portés par la grille — `french_
correctness` à 2.0 est un choix, pas une survivance.

### 2.4 Le biais de longueur, chez nous

Leur parade est la troncature commune à 4000 caractères. Comme nos sorties font quelques
centaines de mots, elle ne se déclenche pour ainsi dire jamais : nous la gardons (limite
identique côté duels) mais elle ne protège de rien ici.

Notre parade réelle est ailleurs : **la longueur est une mesure déterministe à part**, pas un
critère de jugement. Le plafond de mots est une porte ; la longueur observée est un chiffre du
rapport. Un modèle bavard se voit dans la colonne longueur et dans son taux de validité, pas
dans une note de style qu'un juge aurait gonflée parce que le texte était plus long.

### 2.5 Reste à faire

Le solveur de classement (TrueSkill ou Elo, avec intervalles d'incertitude et « non
distinguables » explicite), le calendrier d'échantillonnage des paires (§1.7 — leur idée la
plus rentable, et non implémentée à ce jour : nous appairons exhaustivement), le rapport, la
CLI et l'UI. Registre : `_bmad-output/implementation-artifacts/deferred-work.md`.
