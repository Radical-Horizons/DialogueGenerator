# Campagne oralité — 2026-10-02

Le classement du 2026-10-01 a montré `oral_naturalness` entre 5,6 et 6,75 pour
**tous** les modèles. Avant de toucher au prompt, la relecture des 48 prompts
enregistrés a montré que le banc ne mesurait pas le prompt de la production.

Plan approuvé : l'instrument d'abord (phase 1), une ligne de base B0, puis un
levier par palier, chacun mesuré contre le précédent, critères fixés avant de
dépenser. Feu vert de l'utilisateur à chaque palier facturé.

## Phase 1 — le banc reçoit le prompt de la production, entier

Ce sont des corrections, pas des leviers : leur effet est inattribuable, et c'est
assumé. Elles produisent la ligne de base contre laquelle chaque levier sera mesuré.

### Ce qui était faux

| Défaut | Conséquence au run du 2026-10-01 |
|---|---|
| Fiche PNJ plus grosse que le budget → coupe par la tête | 4 cas sur 8 **sans PJ, sans lieu, sans espèce** ; `akthar-interdit` ne montrait pas le champ qu'il teste |
| Espèce prise après les lieux (ordre du tuple, pas du texte) | Espèce absente même sous le budget |
| Cache Notion résolu depuis le worktree (vide) | **Guides narratifs absents des 12 runs** |
| Valeurs jamais nettoyées sur le chemin JSON | 52 à 182 UUID bruts par contexte, embeds PDF, URL d'images signées |
| Mentions Notion auto-fermantes non résolues | Des phrases sans sujet : « … sans contact conscient avec ⟨URL⟩ et ignore son identité » |
| Cache précompilé compilé **sans** index des relations, et aveugle au code qui le compile | Même avec l'index injecté ailleurs, c'est la version non résolue qui était servie |
| `escape_xml_text` avant ElementTree | Double échappement : `&amp;lt;scene_instructions&amp;gt;`, 9 à 166 occurrences par prompt |
| `truncate_excerpt` appliqué à un champ que le chemin JSON laisse vide | Aucun extrait raccourci : un lieu « en extrait » injectait 10 000 caractères d'histoire |
| Champs de voix slugifiés (`gestes_et_tics_re_ve_lateurs`…) rangés dans « AUTRES » | La moitié de la voix en fin de fiche, coupée la première |
| Descriptions du schéma de sortie autorisant les didascalies dans tous les modes | Un run « sans » en recevait l'autorisation par une voie que l'audit ne lisait pas |
| Exemples de fiche truffés de `*(…)*` en mode « sans » | 142 didascalies montrées en exemple à un modèle à qui on les interdit |
| « Entre 2 et 8 choix » face à un schéma de fragment plafonné à 6 | Une consigne qu'un modèle obéissant ne pouvait pas tenir |
| `<character>` sans attribut `name` en forme XML hiérarchique | Trois blocs anonymes, sans dire lequel est le locuteur |
| Aucune empreinte du prompt dans l'identité du run | Deux runs de consignes différentes se comparaient en silence |
| Rubrique : verdict réutilisé sans vérifier sa grille | Une passe relancée sous une grille rééditée sautait tout |

### Les prompts, avant et après

Même graine par cas ; client factice, rien de facturé.

| Cas | caractères avant | après | UUID dans le contexte, avant | après | double échappement, avant | après |
|---|---|---|---|---|---|---|
| `akthar-interdit` | 97 728 | 122 895 | 182 | 0 | 108 | 0 |
| `ensevelie-revelation` | 35 618 | 55 161 | 52 | 0 | 9 | 0 |
| `genka-confrontation` | 83 105 | 86 094 | 108 | 0 | 129 | 0 |
| `genka-marchandage` | 34 817 | 55 384 | 72 | 0 | 15 | 0 |
| `voknir-exposition-dedale` | 101 090 | 94 090 | 151 | 0 | 166 | 0 |
| `voknir-premiere-rencontre` | 34 238 | 55 122 | 95 | 0 | 55 | 0 |
| `zaehria-confrontation` | 101 714 | 86 533 | 165 | 0 | 133 | 0 |
| `zaehria-marchandage` | 99 426 | 86 805 | 167 | 0 | 132 | 0 |

Les cas courts grossissent : ils reçoivent désormais les guides (~15 000
caractères) et, à budget de contexte égal, le PJ, le lieu et l'espèce qu'ils
perdaient. Les cas longs maigrissent : le bruit retiré compense les guides, et
leur contexte tient désormais **entier** dans son budget.

Toutes les fiches déclarées par chaque cas figurent dans son prompt — vérifié par
`tests/integration/test_benchmark_prompts_real_gdd.py`, qui assemble les huit cas
réels sur le GDD réel.

**Run à blanc** `20261001T230702-59a5e393` (client factice, 0 $) : huit
générations, audit de cohérence passé, guides présents dans les huit prompts,
aucun UUID dans les contextes, empreinte de consigne `e00f05ab28f3`. La grille
installée est montée en v3 au démarrage de l'API.

### Ce qui n'a pas été changé, et pourquoi

- **`scene_type: first_meeting`** sur le cas de première rencontre : le front ne
  l'envoie jamais. Le cas reflète donc la production telle quelle. Le champ
  `rencontre_initiale`, que ce chemin collait aux consignes, arrive désormais dans
  « VOIX ET STYLE » par le routage corrigé.
- **Le personnage tiré au hasard** (`random_excerpt_count=1`) : comportement de
  production, conservé.
- **Le message système** (« contenu textuel riche… chaque champ doit être
  développé ») : c'est le premier **levier** (L1), pas une correction.

### Grille v3, gelée avant B0

L'empreinte du juge change de toute façon avec B0 : c'était le seul moment où
retoucher la grille ne coûtait aucune comparabilité.

- `oral_naturalness` reçoit des **repères** (4 / 6 / 8) et se note **brut** — 28
  notes sur 48 valaient exactement 6.
- `voice_consistency`, nouveau : une étrangeté constante est une voix, une
  étrangeté intermittente est une erreur.
- `voice_fidelity` ne récompense plus la recopie d'une formule de la fiche.

**Règle produit** (décidée le 2026-10-02) : une oralité faible est légitime si,
et seulement si, `voice_fidelity` ≥ 8 **et** `voice_consistency` ≥ 8. Appliquée
par le rapport (`is_oral_low_legitimate`), jamais par le juge.

### Mesures sans juge

Publiées par modèle au rapport (`BenchmarkOralObservations`) : mots par phrase,
`;`+`:` pour 100 mots, ruptures pour 100 mots, séquences de huit mots recopiées
du prompt. Recalculées sur le run du 2026-10-01, elles reproduisent ce que les
verdicts disaient :

| modèle | mots/phrase | `;` `:` /100 mots | ruptures /100 mots | générations avec recopie |
|---|---|---|---|---|
| `kimi-k3` | **12,2** | 1,69 | **1,86** | 2 / 8 |
| `gpt-6-sol` | 15,7 | 3,24 | 0,25 | 0 / 8 |
| `gpt-5.6-terra` | 16,1 | 3,01 | 0,18 | 0 / 8 |
| `gpt-5.6-luna` | 16,4 | 2,75 | 0,61 | 0 / 8 |
| `gpt-6-luna` | 16,7 | 2,76 | 0,79 | 1 / 8 |
| `mimo-v2.6-flash` | 16,9 | 2,26 | 1,53 | 2 / 8 |

## Pré-enregistrement des paliers

Écrit **avant** la première dépense.

- **Modèle** `openai/gpt-6-luna`, 8 cas × 3 répétitions = **n = 24** par palier.
- **Juge J2** : `anthropic/claude-sonnet-5`, effort `high`, contexte entier, grille
  v3. Gelé pour toute la campagne — aucune retouche de grille ni de consigne de juge.
- **Critère primaire** : `oral_naturalness` hors oralité faible légitime, en hausse
  d'au moins **+0,5** sur le palier précédent (≈ 2,5 erreurs standard à n = 24),
  **et** les mesures sans juge dans le bon sens (mots/phrase et jointures en baisse).
- **Garde contre une règle qui se récompense elle-même** : la moyenne « hors
  excuses » a un dénominateur mobile. Un levier qui fait monter la justesse ou la
  cohérence de la voix range davantage de verdicts dans le panier excusé, et la
  moyenne monte sans qu'une réplique soit devenue plus dicible. Chaque palier
  publie donc **trois** chiffres — moyenne **brute** de `oral_naturalness`,
  moyenne hors excuses, nombre de verdicts excusés — et ne compte comme gain que
  si la moyenne brute monte aussi, ou si le nombre d'excusés reste stable.
- **Garde-fous** — aucune baisse > 0,4 : `context_fidelity`, `voice_fidelity`,
  `voice_consistency`, `french_correctness`. Aucune hausse > 0,4 : `ai_tics`,
  `overwriting`, `blandness`, `forced_exposition`. La recopie ne monte pas.
  `concision` n'est **pas** un garde-fou en L1 : la longueur y change à dessein.
- Un levier qui échoue est retiré du code avant le suivant.
- Entre deux paliers, on itère sur la formulation avec les seules mesures sans
  juge ; le juge tranche.

| Palier | Contenu | Coût estimé |
|---|---|---|
| B0 | prompt corrigé, sans levier | ≈ 2,6 $ |
| L1 | message système à source unique, bloc oralité partagé, longueur du GDD en mots (≤ 150, plafond 300) | ≈ 2,6 $ |
| L2 | `<speaker_voice>` élargi et placé avant la consigne de scène | ≈ 2,6 $ |
| L3 | exemples écrit ✗ / dit ✓, hors jeu de test, validés par l'auteur | ≈ 2,6 $ |
| Confirmation | second juge GLM sur B0 et le final ; plateau des six modèles refait | ≈ 7,5 $ |

### Ce que B0 ne pourra pas dire

B0 et le run du 2026-10-01 ne se comparent pas sur les notes du juge, même pour
`gpt-6-luna` : le prompt **et** la grille ont changé. Le seul pont est fait des
mesures sans juge — mots par phrase, jointures, ruptures — que B0 publiera à côté
du tableau ci-dessus. C'est le seul effet de la phase 1 sur l'oralité qui soit
mesurable.

## B0 — ligne de base (2026-10-29)

Run `20261029T174049-a0d1779a`, empreinte de consigne `f4b09c8d2e1a`.
`openai/gpt-6-luna`, 8 cas × 3, sans didascalies, effort `medium` ; juge J2.
24 générations valides, aucune troncature, **aucune observation de porte**.
Dépense réelle : **2,758 $** (0,074 $ de génération, 2,684 $ de notation).

| mesure | B0 |
|---|---|
| `oral_naturalness`, moyenne brute | **5,54** (σ 0,66 ; une note à 4, onze à 5, onze à 6, une à 7) |
| `oral_naturalness`, hors excuses | 5,54 |
| verdicts à oralité faible légitime | 0 |
| `voice_fidelity` | 5,67 |
| `voice_consistency` | 7,17 |
| `context_fidelity` | 6,96 |
| `french_correctness` | 8,88 |
| `ai_tics` · `overwriting` · `blandness` · `forced_exposition` | 2,46 · 3,04 · 2,33 · 2,88 |
| moyenne pondérée | 7,16 |

Aucun verdict n'est excusé : la justesse de la voix n'atteint 8 sur aucun.

**Le seul pont avec le 1ᵉʳ octobre, les mesures sans juge** : mots par phrase
15,9 (16,7 avant), `;` `:` pour 100 mots 2,92 (2,76), ruptures 0,45 (0,79). La
phase 1 n'a **pas** rendu `gpt-6-luna` plus oral, ce qui est attendu : elle
corrigeait ce que le modèle recevait, pas ce qu'on lui demande.

**Pourquoi la voix tombe à 5,67** (lecture des commentaires, hypothèse) : le juge
voit désormais la voix entière de chaque fiche — les « modes de communication » de
l'Ensevelie, le patois de Genka, les tics de Voknir, auparavant coupés en fin de
fiche — et il note contre elle. Les trois notes les plus basses (4) disent la même
chose : l'Ensevelie « tient un dialogue argumentatif parfaitement articulé » au lieu
de sa « violence douce » sensorielle, Genka reste « sentencieux et abstrait », loin
du patois de routes. La spécification de la voix est maintenant sous les yeux du
modèle ; il ne l'applique pas. C'est la cible de L1 et de L2.

| cas | oral brut | voix | cohérence |
|---|---|---|---|
| `akthar-interdit` | 6,33 | 6,33 | 7,67 |
| `voknir-exposition-dedale` | 6,00 | 6,33 | 7,33 |
| `voknir-premiere-rencontre` | 6,00 | 5,00 | 6,33 |
| `genka-confrontation` | 5,67 | 6,67 | 7,67 |
| `zaehria-marchandage` | 5,33 | 5,67 | 7,67 |
| `ensevelie-revelation` | 5,00 | 4,33 | 6,67 |
| `genka-marchandage` | 5,00 | 4,33 | 6,33 |
| `zaehria-confrontation` | 5,00 | 6,67 | 7,67 |

Deux incidents de mesure, traités :

- **Une réponse du juge non conforme** (`branch_coherence` noté deux fois) : verdict
  rejeté puis rejugé, n = 24 comme prévu.
- **La purge des verdicts en erreur effaçait leur coût** : la passe affichait
  2,563 $ pour 2,684 $ dépensés, et le plafond ne tenait qu'une relance. Corrigé
  par un registre des coûts purgés, test à l'appui.

## L1 — message système, oralité, longueur du GDD

Trois changements, mesurés ensemble par décision produit (longueur et oralité vont de
pair) :

1. **Une seule source pour le message système** : `config/system_prompts/default.txt`,
   celui que l'éditeur de l'UI affiche, est désormais celui que les clients envoient.
   La clé `system_prompt_template` de `llm_config.json` — « contenu textuel riche…
   chaque champ doit être développé » — disparaît. Le nouveau texte ne décrit plus le
   format (il autorisait les didascalies dans tous les modes) et l'audit lit
   désormais le message système.
2. **Un bloc « Oralité »** dans les contraintes partagées par les deux chemins de
   génération (fragment d'ouverture et nœuds enfants du graphe) : une idée par phrase,
   ni `;` ni `:` dans une réplique, pas de subordonnées en cascade, l'oral qui se
   reprend quand la voix le veut ; exception pour une syntaxe singulière exigée par
   la fiche, à condition qu'elle soit tenue sans faille.
3. **La longueur du GDD, en mots** : une réplique vise 150 mots au plus, jamais plus de
   300 — à la place de « 1 à 4 phrases ».

Vérifié sans dépense sur les huit cas réels : bloc présent partout, ancienne règle
absente, audit sans contradiction.

### Mesure (2026-10-29)

Run `20261029T183549-0460f9c9`, empreinte `51e6b8fa0e7c`. Même configuration que B0.
24 générations valides, aucune porte, aucune troncature. Dépense : **2,650 $**
(0,078 $ de génération, 2,572 $ de notation). Audit de cohérence passé sur le
**vrai** message système.

| mesure | B0 | L1 | écart | règle | verdict |
|---|---|---|---|---|---|
| **oralité, brute** | 5,54 | **6,75** | **+1,21** | ≥ +0,5 | ✅ |
| oralité, hors excuses | 5,54 | 6,75 | +1,21 | ≥ +0,5 | ✅ |
| verdicts excusés | 0 | 0 | = | stable | ✅ |
| mots par phrase | 15,9 | **8,9** | −7,0 | en baisse | ✅ |
| `;` `:` pour 100 mots | 2,92 | **0,06** | −2,86 | en baisse | ✅ |
| `context_fidelity` | 6,96 | 6,96 | 0,00 | baisse ≤ 0,4 | ✅ |
| `voice_fidelity` | 5,67 | 5,54 | −0,13 | baisse ≤ 0,4 | ✅ |
| `voice_consistency` | 7,17 | 6,92 | −0,25 | baisse ≤ 0,4 | ✅ |
| `french_correctness` | 8,88 | 8,96 | +0,08 | baisse ≤ 0,4 | ✅ |
| `ai_tics` | 2,46 | 2,38 | −0,08 | hausse ≤ 0,4 | ✅ |
| `overwriting` | 3,04 | 2,29 | −0,75 | hausse ≤ 0,4 | ✅ |
| `forced_exposition` | 2,88 | 2,75 | −0,13 | hausse ≤ 0,4 | ✅ |
| **`blandness`** | 2,33 | **2,79** | **+0,46** | hausse ≤ 0,4 | ❌ |
| recopie (générations) | 1 | 1 | = | ne monte pas | ✅ |

Hors garde-fous : `concision` 5,92 → 7,04, longueur moyenne des répliques 48 → 50 mots
(le plafond relevé à 150 n'a pas allongé les panneaux), moyenne pondérée 7,16 → 7,23.

**Lecture stricte : L1 ne passe pas.** Le critère primaire est franchi largement —
plus du double du seuil, et confirmé par les mesures sans juge — mais un garde-fou
l'est aussi, de 0,06. Ce qui manque n'est pas l'oralité, c'est la matière : les quatre
notes de platitude à 4 reprochent toutes la **répétition d'un panneau à l'autre**
(« même mouvement rhétorique répété », « la répétition de l'idée centrale dans presque
chaque panneau sans gradation », « tournent en rond »). Cause plausible, et c'est la
nôtre : la consigne dit que l'oral « se répète ». Hypothèse, non mesurée.

La recopie reste marginale : une génération par palier, et ce sont des faits de la
fiche, pas des formules signatures.
