# Étape 1 — quel effort de raisonnement ? (2026-10-01)

> ⚠️ **Conclusion invalidée le même jour.** Le juge était Luna et Luna était
> candidate. Rejoué avec `anthropic/claude-sonnet-5` comme juge tiers sur les
> mêmes textes, l'effet d'effort **disparaît** : la montée monotone du respect de
> la consigne était de l'auto-préférence, et son biais **croissait avec l'effort**
> (+0,75 à `none`, +2,12 à `high`). Voir
> `etape1-bis-juge-tiers-2026-10-01.md`. Les chiffres ci-dessous restent exacts
> comme mesure de ce que Luna pense de Luna ; ils ne mesurent pas l'effort.

Quatre runs, 48 générations, **1,3044 $** dépensés (0,9057 génération + 0,3987
notation). Suite `alteir-standard` v2, 8 cas. Juge `openai/gpt-5.6-luna` à
l'effort `high`, contexte entier, grille `grille-dialogue-fr` v2.

| effort | run |
|---|---|
| `medium` | `20261001T115544-95d6bc27` |
| `high` | `20261001T120732-0aaf1643` |
| `none` | `20261001T122409-87d8cf2d` |
| `low` | `20261001T123127-4c3c98a8` |

`z-ai/glm-5.3` **refuse** `effort: none` (400, « Reasoning is mandatory for this
endpoint and cannot be disabled »), d'où sa courbe partant de `low`. Sondé avant
de dépenser : sans cette vérification, une jambe entière aurait été perdue en
`config_error`.

## Résultats

| modèle | effort | valides | note /10 | fidélité | invention | consigne | français | tok. sortie | $/gén. |
|---|---|---|---|---|---|---|---|---|---|
| `openai/gpt-5.6-luna` | `none` | 8/8 | 8.46 | 7.75 | 3.12 | 8.38 | 8.75 | 1281 | 0.0061 |
| `openai/gpt-5.6-luna` | `medium` | 8/8 | 8.51 | 8.62 | 3.25 | 9.00 | 9.00 | 1524 | 0.0064 |
| `openai/gpt-5.6-luna` | `high` | 8/8 | 8.57 | 8.62 | 3.00 | 9.75 | 8.88 | 2010 | 0.0070 |
| `z-ai/glm-5.3` | `low` | 6/8 | 7.75 | 7.67 | 2.33 | 4.67 | 8.50 | 1448 | 0.0272 |
| `z-ai/glm-5.3` | `medium` | 8/8 | 7.96 | 8.00 | 3.38 | 7.00 | 7.38 | 1306 | 0.0268 |
| `z-ai/glm-5.3` | `high` | 8/8 | 7.74 | 8.25 | 2.50 | 4.75 | 8.75 | 5851 | 0.0398 |

`invention` est en sens inversé : bas vaut mieux.

## Ce que l'effort achète — et ce n'est pas la moyenne

Ton hypothèse était que le raisonnement n'améliorerait pas l'écriture mais la
fiabilité. Vérifié, et plus précisément que prévu : **c'est le plancher qui monte,
pas la moyenne.**

Luna, `context_fidelity` (poids maximal de la grille) :

| effort | moyenne | **minimum** | écart-type |
|---|---|---|---|
| `none` | 7,75 | **5** | 1,48 |
| `medium` | 8,62 | **8** | 0,48 |
| `high` | 8,62 | **8** | 0,48 |

À `none`, Luna contredit parfois sérieusement les fiches — un 5 sur le critère le
plus lourd. À `medium`, elle ne descend **jamais** sous 8 et l'écart-type est
divisé par trois. La moyenne ne gagne que 0,87 point ; le risque, lui, disparaît.

Même forme sur `instruction_compliance` : 8,38 (σ 0,86, min 7) → 9,00 (σ 0,87) →
**9,75 (σ 0,43, min 9)**. Et `french_correctness` à `medium` : σ **0,00**, les huit
cas notés 9.

La note globale, elle, ne bouge pas : 8,46 → 8,51 → 8,57. Avec n=8, ces 0,11 point
sont du bruit. **L'écriture ne s'améliore pas ; la tenue, oui.**

## Le prix de cette fiabilité est négligeable

| effort | $/génération | 1 000 fragments |
|---|---|---|
| `none` | 0,0061 | 6,10 $ |
| `medium` | 0,0064 | 6,40 $ |
| `high` | 0,0070 | 7,00 $ |

Passer de `none` à `high` coûte **+15 %** sur un total déjà minuscule : 90 centimes
pour mille fragments. Économiser cela au prix d'un plancher de fidélité à 5 n'a
aucun sens en production.

## GLM-5.3 est inutilisable pour cette tâche, à tout effort

Non pas à cause de sa prose — son français est correct — mais parce qu'il **ne
respecte pas le contrat d'identifiants**. Ses `targetNode` portent des libellés
sémantiques (`colere`, `doute`, `refus`, `politesse`, `prix`, `provocation`) au lieu
des identifiants générés. Conséquence sur 5 cas sur 8 : tous les choix pointent vers
des panneaux inexistants et tout le second niveau est injoignable.

Il écrit aussi l'identifiant technique dans le champ locuteur (`akthar_neth_amatru`,
`l_ensevelie`), affiché tel quel en jeu.

D'où un `instruction_compliance` à **minimum 0** aux trois efforts, avec σ > 2,8 :
4,67 (`low`) / 7,00 (`medium`) / 4,75 (`high`). L'effort n'y change rien — ce n'est
pas un défaut d'attention, c'est un contrat non respecté.

À `high` il a brûlé **5 851** tokens de sortie par génération (contre 2 010 pour
Luna) pour une note **inférieure** à son propre `medium`. Six générations valides
sur huit à `low`.

## Ce que ce run ne dit pas

⚠️ **Le juge est Luna, et Luna est candidate.** La courbe d'effort *intra-Luna* n'en
souffre pas — même juge, même modèle, seul l'effort varie, donc le biais est
constant et s'annule dans la comparaison. Mais la comparaison **Luna contre GLM**
est confondue par une préférence possible du juge pour sa propre production. Le
classement entre modèles relève de l'étape 2, et devra se faire avec un juge tiers.

- n = 8 cas par cellule. Un écart inférieur à ~0,5 point n'est pas séparable du bruit.
- Température à 0,7 pour les deux, mais **inerte sur GPT-5.6 et honorée par GLM** :
  les deux ne tournent pas sous le même régime d'échantillonnage (sonde du 2026-10-01).
- La porte `address_consistency`, livrée la veille, a attrapé un vrai défaut en
  production : GLM vouvoie au START puis tutoie dans trois panneaux.

## Recommandation

**`medium` comme défaut de production, `high` si la forme doit être irréprochable.**

`medium` capte l'essentiel du gain de fiabilité (plancher de fidélité 5 → 8, σ
divisé par trois) pour +5 % de coût. `high` ajoute la marge sur le respect de la
consigne (9,00 → 9,75, σ 0,87 → 0,43) pour +9 % de plus — défendable là où un
fragment mal formé coûte une reprise manuelle.

**`none` est à écarter** : il n'économise que 5 % et rouvre un plancher de fidélité à 5.

Pour l'étape 2, GLM n'a plus à être classé : il est disqualifié par le contrat
d'identifiants, pas par un score.
