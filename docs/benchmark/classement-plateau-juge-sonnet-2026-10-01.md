# Classement du plateau — juge tiers Claude Sonnet 5 (2026-10-01)

Six candidats, 8 cas, effort `medium`, rubrique seule. Juge
`anthropic/claude-sonnet-5` à l'effort `high`, contexte entier, grille v2.
48 générations, 48 verdicts, **zéro échec de juge**.

Run `20261001T183935-7f0b2969`. Dépense : 1,32 $ de génération + 4,99 $ de
notation = **6,31 $**.

## Le classement

| | modèle | note /10 | σ | min | portes | $/gén. | $/1 000 |
|---|---|---|---|---|---|---|---|
| 1 | `openai/gpt-6-sol` | 7,65 | 0,30 | 7,07 | `speaker_label` ×2 | 0,0595 | 59,55 |
| 2 | `moonshotai/kimi-k3` | 7,59 | 0,27 | 7,24 | `speaker_label` ×7, `connectivity` ×2 | 0,0306 | 30,56 |
| 3 | `openai/gpt-5.6-luna` | 7,44 | 0,38 | 6,69 | **aucune** | 0,0064 | 6,40 |
| 3 | **`openai/gpt-6-luna`** | **7,44** | **0,15** | 7,23 | **aucune** | **0,0031** | **3,10** |
| 5 | `openai/gpt-5.6-terra` | 7,40 | 0,32 | 6,79 | `speaker_label` ×1 | 0,0605 | 60,48 |
| 6 | `xiaomi/mimo-v2.6-flash` | 6,99 | 0,70 | 5,44 | `connectivity` ×3, `panel_count` ×2, … | 0,0049 | 4,88 |

## Ce que dit ce tableau

**Le plateau est plat.** Les cinq premiers tiennent dans **0,25 point**, avec des
écarts-types de 0,15 à 0,38. À n=8, cet intervalle est du bruit : l'ordre des cinq
n'est pas établi. Seul MiMo se détache, vers le bas.

**Et l'éventail de prix est de 19,5×.** De 3,10 $ à 60,48 $ les mille fragments,
pour 0,25 point d'écart invérifiable. C'est le résultat qui compte pour la
production : **payer plus n'achète rien de mesurable sur cette tâche.**

## La couronne de septembre est tombée

`gpt-5.6-terra` avait gagné 76 % de ses duels en septembre et dominait deux runs
consécutifs. C'était sous un juge Luna — dont on a établi le même jour qu'il
favorise sa propre famille sur la forme.

Sous un juge tiers, Terra est **cinquième sur six**, à 60,48 $ les mille — le
modèle le plus cher du plateau est aussi l'un des derniers. Sa victoire était un
artefact de juge.

## GPT-6 Luna est la réponse, et pas seulement sur le prix

À égalité de note avec `gpt-5.6-luna` (7,44), pour **la moitié du prix**. Mais le
chiffre qui compte davantage est son **écart-type de 0,15** — deux à cinq fois plus
resserré que tout le reste du plateau — avec un minimum de 7,23, le deuxième plus
haut. Et **zéro observation de porte** sur 8 générations.

C'est donc le modèle le plus **régulier** du plateau, ce qui est exactement ce qu'on
demande à une production de masse : non pas le meilleur coup, mais le pire coup le
moins mauvais.

## Deux pièges du plateau

**Kimi K3 — bonne plume, sortie inexploitable.** Deuxième sur la note (7,59), mais
**7 générations sur 8** écrivent l'identifiant technique dans le champ locuteur,
plus 2 défauts de connectivité. Il faudrait un post-traitement, et il coûte 10× le
prix de GPT-6 Luna.

**MiMo — sa cheapness est une illusion.** 3 982 tokens de sortie en moyenne, soit
2,4× le plateau, parce qu'il continue d'écrire un troisième niveau. Résultat : il
revient **plus cher** que GPT-6 Luna (0,0049 contre 0,0031 $) tout en finissant
dernier, avec le pire écart-type (0,70) et le pire minimum (5,44).

Le point contesté est tranché : sur les 8 cas, **GPT-6 Luna en gagne 7**. MiMo ne
gagne que `akthar-interdit` — précisément le cas que l'échantillon de deux verdicts
avait tiré la fois précédente. C'était un effet de cas, pas un classement.

## Le signal le plus actionnable n'est pas un classement

`oral_naturalness` par modèle : 6,75 · 6,12 · 6,12 · 6,00 · 5,75 · 5,62.

**Aucun modèle ne dépasse 6,75.** Quand tous les candidats échouent sur le même
critère, ce n'est pas une propriété des modèles — c'est la consigne qui n'obtient
pas ce qu'elle demande. Sonnet ne trouve le dialogue de personne naturel à dire à
voix haute.

C'est la piste produit la plus rentable du tableau : améliorer le prompt sur
l'oralité ferait monter **tout le monde**, là où changer de modèle ne déplace que
0,25 point.

## Ce que ce run ne dit pas

- **n=8, un tirage, un juge.** L'ordre des cinq premiers n'est pas établi. Ce qui
  tient : l'écart de MiMo, les observations de portes (déterministes), et les
  écarts-types.
- **Sonnet est sévère** d'environ 1,2 point par rapport à GLM et à Luna, mesuré sur
  des textes identiques. Les niveaux absolus ici ne se comparent pas aux chiffres
  jugés par GLM.
- **Rubrique seule.** Départager les deux ou trois premiers demande des duels :
  ~1,50 $ sur trois modèles, contre ~18 $ sur les six.
- `xiaomi/mimo-v2.6-pro` et `openai/gpt-6-astra` n'ont pas été mesurés — le second
  dépasse le plafond de 0,10 $/génération par un facteur trois.
