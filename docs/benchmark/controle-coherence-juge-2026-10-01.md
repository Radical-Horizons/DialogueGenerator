# Contrôle de cohérence du juge — un cas, 2026-10-01

Écrit après le premier run suivant la suppression de la troncature du contexte
(commit `8521dcf8a`) et la version 2 de la grille. Un seul cas, un seul modèle :
le but n'était pas de mesurer mais de **regarder**, avant d'engager un bench complet.

Les runs vivent dans `data/benchmarks/`, qui est en `.gitignore` : les seize runs de
septembre ont disparu avec leur worktree. Les extraits sont donc recopiés ici.

## Le run

| | |
|---|---|
| `run_id` | `20261001T085506-e1e21dab` |
| Cas | `akthar-interdit` — contexte long, le plus gros de la suite standard |
| Candidat | `openai/gpt-5.6-luna`, effort `medium` |
| Juge | `openai/gpt-5.6-luna`, effort `high` (épinglé), empreinte `a134027b24b7` |
| Grille | `grille-dialogue-fr` v2 |
| Prompt candidat | 97 728 caractères  30 086 tokens |
| `<scene_instructions>` | offset 96 126 — soit au-delà de l'ancienne coupure de 24 000 |
| Coût génération | 0.0077 $ |
| Coût notation | 0.0106 $ (33 052 tokens en entrée) |
| Portes | aucune |

## Ce qui prouve que le juge lit maintenant la consigne

La consigne de scène, à l'offset 96 126, demande qu'Akthar-Neth se dérobe
« **sans céder par complaisance envers le joueur, et sans que le refus devienne un
mur qui ferme la scène** ».

Le commentaire du juge sur `voice_fidelity` :

> Akthar-Neth est immédiatement identifiable : emploi insistant de « Nous », registre hiératique, refus oblique, lexique du pacte, de la contrition et des Insufflations. Il esquive sans devenir un mur et ne cède pas par complaisance.

La dernière phrase reprend la consigne presque mot pour mot. Le juge d'avant ne
pouvait pas l'écrire : il n'avait jamais vu ce texte.

Second indice, indépendant. Le juge crédite « la future Révélation pénitentielle ».
Ce terme apparaît dans la fiche à l'offset 56 506, et `contrition` à 56 595 —
**hors** de l'ancienne fenêtre. Le passage dit :

> **Révélation pénitentielle anticipée** : avant le rituel, il prépare une cérémonie
> d'aveu. Il fera sa contrition […] puis il exposera les crimes du Paradigme Ésothrope

Et le modèle écrit, dans le panneau `node-67309150…` :

> « Quant aux morts du Paradigme, leur compte sera récité quand l'heure de la
> contrition sera venue — non pour vous acheter, mais pour empêcher que Nous nous
> cachions derrière une œuvre utile. »

C'est la meilleure démonstration de fidélité au long contexte de tout le fragment,
et elle était **structurellement invisible** à la mesure précédente.

## Le meilleur choix du modèle, et ce que la fiche en dit

La fiche porte une section explicite, à l'offset 5 705 :

> **Levier jouable : la voix de Qalamtû** — Veth-Solan Qalamtû est le seul être dont
> la désapprobation ouverte pourrait fracturer l'édifice intérieur d'Akthar-Neth […]
> parce qu'il est la seule personne au monde à connaître Akthar-Neth hors de sa
> fonction d'Exégète. Un PJ qui parvient à conduire Qalamtû […] à exprimer un doute
> sincère *devant* Akthar-Neth, obtient une fissure réelle dans le Noyau latent.

Le modèle en fait une option, derrière le test le plus dur du fragment :

> `Sociabilité+Autorité:11` — « Appelez Qalamtû, et laissez devant vous une voix qui
> vous connaît avant l'Exégète. »

« qui vous connaît avant l'Exégète » est une reformulation exacte de « hors de sa
fonction d'Exégète ». Le juge l'a crédité, mais sommairement (« le rôle intime de
Qalamtû ») : il n'a pas vu que c'était le levier que la fiche désigne, employé au bon
moment et correctement verrouillé.

## Ce que le juge a manqué

La consigne du cas impose : « **même tu/vous que le START** ».

| Panneau | Adresse du PNJ |
|---|---|
| `START` | **tu** |
| `node-67309150f9e14000ada` | **vous** |
| `node-36e458255cdf4eee9fa` | **vous** |
| `node-999af31150614960937` | **vous** |

START tutoie, les trois panneaux suivants vouvoient. Le juge a mis **9** sur
`instruction_compliance` et écrit :

> Le fragment fournit exactement le START, trois options, puis un panneau et deux options pour chacune, sans troisième niveau ni didascalie. Les répliques restent dans le format demandé. Les tests emploient bien les attributs disponibles, même si certaines compétences ne sont pas explicitement listées dans le contexte fourni.

Le juge voyait la consigne, et a tout de même manqué sa contrainte la plus
mécanique. **Correctif livré** : porte `address_consistency`, en `observation`,
qui suit les deux sens d'adresse séparément — le PNJ peut tutoyer un PJ qui le
vouvoie, c'est une caractérisation, pas une faute. Ce qu'une expression régulière
vérifie à coup sûr ne se délègue pas au discernement d'un modèle.

## Le nouveau critère d'invention

`unsupported_invention` = 2 (sens inversé, 0 = rien à signaler) :

> Peu d'écarts factuels. Les extrapolations repérables sont formulées comme « la paix de ceux qui nous faisaient confiance », « toutes les voix que nos décisions ont condamnées au silence » et « la forme ancienne touche à son terme » ; elles restent des formulations interprétatives compatibles avec le contexte, non des inventions lourdes.

Le critère fait ce qu'on lui demande : il **cite** les passages, verbatim. Vérifié à
la main, les trois sont des extrapolations de registre, pas des faits nouveaux — la
note de 2 est juste. Aucune des trois ne mérite d'entrer au GDD, mais le mécanisme
de récolte fonctionne.

## Notes du juge, pour mémoire

| Critère | Note |
|---|---|
| `voice_fidelity` | 9 |
| `voice_distinction` | 8 |
| `oral_naturalness` | 7 |
| `concision` | 8 |
| `french_correctness` | 9 |
| `option_differentiation` | 9 |
| `intent_readability` | 9 |
| `perceptible_consequence` | 8 |
| `branch_coherence` | 9 |
| `context_fidelity` | 9 |
| `unsupported_invention` | 2 |
| `world_codes` | 9 |
| `instruction_compliance` | 9 |
| `blandness` | 1 |
| `forced_exposition` | 1 |
| `ai_tics` | 2 |
| `overwriting` | 3 |
| `register_anachronism` | 0 |

## Ce que ce cas ne dit pas

Une génération, un modèle, un cas. Trois choses ont changé en même temps — la
politique de contexte, la grille, et le premier effort de raisonnement réellement
imposé. Ces notes ne se comparent à aucun run de septembre, et ne classent rien.
Elles établissent seulement que le juge lit la consigne, cite ses preuves, énumère
les inventions — et qu'il ne faut pas lui confier une vérification déterministe.
