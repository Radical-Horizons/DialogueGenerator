# Mini test — MiMo-V2.6, GPT-6 Luna, et qui doit juger (2026-10-01)

Trois questions tranchées pour **1,10 $**. La troisième n'était pas prévue et
vaut plus que les deux autres.

## 1. Le juge : GLM tient, et l'auto-préférence se précise

Les 24 générations de Luna (`none`/`medium`/`high`) étaient déjà notées par
Sonnet et par Luna. Un **troisième** juge sur les mêmes textes a coûté 0,46 $.

| juge | `none` | `medium` | `high` | verdicts | $/verdict |
|---|---|---|---|---|---|
| `claude-sonnet-5` | 7,33 | 7,27 | 7,35 | 24/24 | 0,1064 |
| `z-ai/glm-5.3` | 8,56 | 8,49 | 8,56 | 22/24 | **0,0192** |
| `gpt-5.6-luna` | 8,46 | 8,60 | 8,54 | 24/24 | 0,0085 |

**Deux phénomènes que j'avais confondus.**

Le décalage de niveau n'est **pas** de l'auto-préférence : GLM, qui n'a aucun
intérêt dans l'affaire, est à +1,19 de Sonnet là où Luna est à +1,22. Deux juges
indépendants s'accordent sur ~8,5 ; Sonnet seul dit 7,3. C'est **Sonnet qui est
sévère**, pas Luna qui se flatte.

La **forme**, en revanche, est bien un artefact. Tendance de
`instruction_compliance` de `none` à `high` :

| juge | tendance |
|---|---|
| Sonnet | −0,25 |
| GLM (désintéressé) | −0,08 |
| **Luna** | **+1,12** |

Seule Luna voit la montée. La conclusion « l'effort n'achète rien de mesurable »
tient donc sous **trois** juges, et la montée monotone était bien de
l'auto-préférence sur sa propre sortie à fort effort.

### Le risque adjacent s'est réalisé

GLM avait été disqualifié comme candidat pour avoir substitué ses propres
libellés aux identifiants imposés. Prédiction faite avant de dépenser : la même
indiscipline pourrait toucher `criterion_id`. Elle l'a fait — un verdict rejeté
pour **`ai_ticks` au lieu de `ai_tics`**, plus une réponse vide. 2 échecs sur 24,
soit 8 %.

Ce n'est pas rédhibitoire : l'échec est **bruyant** (la validation de grille le
rejette, il n'entre pas dans les moyennes) et `_discard_judge_error_verdicts` le
rejoue à la passe suivante. Mais il faut budgéter ~8 % de reprises.

**Recommandation : GLM comme juge par défaut** — 5,6× moins cher que Sonnet,
désintéressé puisque disqualifié comme candidat. Sonnet en contre-épreuve
occasionnelle. Pour classer des candidats, le niveau absolu n'importe pas ; les
deux juges s'accordent sur la **forme**, qui est ce qui classe.

⚠️ Aucune vérité terrain ne dit lequel a raison sur le niveau. Pour « 8,5 est-il
bon dans l'absolu », l'écart de 1,2 point compte ; pour « A vaut-il mieux que B »,
non.

## 2. MiMo-V2.6-Flash : moins cher que l'actuel, mais il n'obéit pas

8 cas, effort `none`, juge GLM.

| modèle | valides | note /10 | fidélité | consigne | français | tok. sortie | $/gén. |
|---|---|---|---|---|---|---|---|
| **`openai/gpt-6-luna`** | 8/8 | **8,62** | 8,75 | **8,75** | **9,38** | 1 114 | **0,0028** |
| `openai/gpt-5.6-luna` | 8/8 | 8,56 | 8,83 | 8,33 | 9,00 | 1 307 | 0,0061 |
| `xiaomi/mimo-v2.6-flash` | 8/8 | 8,28 | 8,57 | **6,43** | 8,00 | 1 474 | 0,0042 |

Portes déterministes, insensibles au juge :

| modèle | observations |
|---|---|
| `gpt-6-luna` | **aucune** |
| `gpt-5.6-luna` | `address_consistency` ×1 |
| `mimo-v2.6-flash` | `panel_count` ×6, `narration` ×1, `connectivity` ×1 |

MiMo produit **trop** de panneaux, pas trop peu : 5, 8, 10 là où 4 sont attendus
pour une ouverture à trois options. Il écrit un troisième niveau malgré
l'interdiction explicite, et ajoute des didascalies dans un run qui les refuse.
Deux consignes ignorées, d'où une conformité à 6,43 contre 8,75.

Son JSON est valide et ses identifiants sont réels — ce n'est pas la faute de GLM
comme candidat. Mais il répond à une autre question que celle posée, ce qui casse
l'unité mesurée et, en production, générerait de la structure que l'auteur n'a pas
demandée.

## 3. La vraie trouvaille n'était pas MiMo

**`openai/gpt-6-luna` est à la fois le moins cher et le mieux noté.**

| | $/génération | écart |
|---|---|---|
| `gpt-6-luna` | 0,0028 | référence |
| `mimo-v2.6-flash` | 0,0042 | +50 % |
| `gpt-5.6-luna` *(défaut actuel)* | 0,0061 | +118 % |

Soit **2,2× moins cher que le défaut actuel**, avec une note légèrement
supérieure, le meilleur français du lot et **zéro observation de porte**.

Tarif officiel OpenAI : 0,10 / 0,50 \$ par Mtok, identique en direct et sur la
route — vérifié sur `developers.openai.com`. Contexte 1,05 M, 128 k de sortie.

⚠️ La doc officielle précise qu'en **Chat Completions** le function calling n'est
accepté qu'avec `reasoning_effort: none`. Le banc passe par Chat Completions via
OpenRouter, et la sonde montre que les outils fonctionnent à **tous** les efforts
sur cette route. La contrainte porte donc sur la route OpenAI directe. À ne pas
oublier si le projet repasse un jour en direct.

## Ce qui reste à faire avant de l'adopter en production

Ce test rend `gpt-6-luna` **mesurable**, pas adopté. N'ont pas été touchés :
`default_model`, la chaîne de repli, `ModelNames`, le miroir frontend, les
options d'effort de l'UI, les presets et les e2e. C'est le périmètre du skill
`llm-model-update`, et c'est une décision produit — pas un effet de bord de banc.

Également non testé : `xiaomi/mimo-v2.6-pro` (0,435 / 0,87 \$/Mtok, soit 3,7× le
prix de `gpt-6-luna`). Si la variante Flash ignore deux consignes, la Pro mérite
un essai seulement si le prix cesse d'être l'argument.

## Pas de GPT-6 Terra

La lignée terra s'arrête à la 5.6. La gamme GPT-6 au catalogue : `astra`
(10 / 50), `luna` (0,10 / 0,50), `sol` (2 / 10), plus un `gpt-6.1-sol`.
