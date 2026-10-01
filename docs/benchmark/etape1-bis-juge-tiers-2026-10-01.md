# Étape 1 rejouée — Claude Sonnet 5 comme juge (2026-10-01)

**Ce document corrige la conclusion de `etape1-effort-raisonnement-2026-10-01.md`.**
L'effet d'effort qui y était présenté comme le résultat principal n'existe que
lorsque Luna note ses propres textes.

## Protocole

24 générations de Luna (8 cas × `none`/`medium`/`high`), **notées deux fois** :
par `anthropic/claude-sonnet-5` et par `openai/gpt-5.6-luna`. Mêmes textes, deux
juges — la seule façon d'isoler ce que le juge apporte. GLM est exclu, disqualifié
par le contrat d'identifiants.

| | run |
|---|---|
| `none` | `20261001T132859-8862044c` |
| `medium` | `20261001T133203-b82fea9f` |
| `high` | `20261001T133528-5807efe3` |

48 verdicts, **8/8 dans chaque cellule**, zéro échec de juge après correctif.

## La courbe d'effort de Luna, vue par deux juges

| juge | effort | note /10 | fidélité (min, σ) | consigne (min, σ) |
|---|---|---|---|---|
| **Sonnet** | `none` | 7,33 | 7,25 (5 · 0,97) | 8,00 (6 · 1,12) |
| **Sonnet** | `medium` | 7,27 | 6,88 (5 · 1,05) | 7,62 (6 · 1,11) |
| **Sonnet** | `high` | 7,35 | 6,62 (6 · 0,48) | 7,75 (6 · 0,97) |
| Luna | `none` | 8,46 | 8,50 (8 · 0,50) | 8,75 (7 · 1,09) |
| Luna | `medium` | 8,60 | 8,62 (8 · 0,48) | 9,12 (7 · 1,17) |
| Luna | `high` | 8,54 | 8,25 (7 · 0,83) | **9,88** (9 · 0,33) |

Sous le juge tiers : note **plate** (7,33 / 7,27 / 7,35) et fidélité qui **baisse**
(7,25 → 6,62). Sous l'auto-juge : la consigne monte de façon monotone jusqu'à 9,88.

**La montée monotone était l'artefact.**

## L'auto-préférence, mesurée

| effort | écart global | orality | voix | fidélité | consigne | français |
|---|---|---|---|---|---|---|
| `none` | +1,13 | +1,75 | +1,50 | +1,25 | +0,75 | −0,12 |
| `medium` | +1,33 | +1,75 | +1,50 | +1,75 | +1,50 | +0,12 |
| `high` | +1,19 | +1,88 | +1,00 | +1,62 | **+2,12** | −0,12 |

Luna se note **plus d'un point au-dessus** de ce que Sonnet lui donne, sur les
mêmes textes. Deux observations qui comptent plus que le chiffre global :

**1. Le biais n'est pas constant — il croît avec l'effort.** Sur le respect de la
consigne : +0,75 à `none`, +1,50 à `medium`, +2,12 à `high`. J'avais écrit la
veille que « le biais est constant d'un effort à l'autre, donc la forme de la
courbe reste valide ». C'était faux, et c'est précisément ce qui fabriquait la
fausse courbe.

**2. Le biais épargne ce qui est vérifiable.** Sur `french_correctness` :
−0,12 / +0,12 / −0,12 — rien. Le biais se concentre sur le naturel de l'oral
(+1,75 à +1,88) et la justesse de la voix, c'est-à-dire là où la réponse est
affaire de goût. Un juge impartial là où l'on peut vérifier, complaisant là où
l'on ne peut pas.

Sur `unsupported_invention`, Luna note **plus bas** que Sonnet (−0,12 à −0,62) :
elle voit moins d'invention dans son propre texte. Cohérent, le critère est négatif.

Le désaccord n'est pas un simple décalage : écart absolu moyen par cas de 1,13 à
1,33, jusqu'à 1,84 sur `genka-confrontation`.

## Le signal sans juge confirme

Les portes sont déterministes, donc immunisées au biais :

| effort | valides | observations | tokens de sortie |
|---|---|---|---|
| `none` | 8/8 | 1 (`address_consistency`) | 1 307 |
| `medium` | 8/8 | 0 | 1 438 |
| `high` | 8/8 | 1 (`schema`) | 2 227 |

Aucune différence. Triple confirmation : juge tiers, portes déterministes, et
auto-juge — seul le dernier voit un effet.

## Conclusion

**Sur cette tâche, à n=8, l'effort de raisonnement n'achète rien de mesurable.**
Le plancher de fidélité qui montait de 5 à 8, présenté la veille comme le
résultat, ne s'est pas reproduit : sous Sonnet le minimum est 5 à `none` **et à**
`medium`. C'était un tirage, pas un effet.

### Implication de production : `medium`, et non `none`

J'avais écrit « `none` convient ». C'était une sur-optimisation, faute d'avoir
regardé l'ordre de grandeur de ce qu'on économise :

| effort | $/1 000 fragments | tok. sortie |
|---|---|---|
| `none` | 6,11 | 1 307 |
| `medium` | 6,27 | 1 438 |
| `high` | 7,21 | 2 227 |

Passer de `none` à `medium` coûte **16 centimes pour mille fragments**. Aucun
arbitrage ne se joue à ce prix. Or n=8 ne détecte qu'un écart d'environ 1 point :
un bénéfice réel mais modeste resterait invisible. Face à une incertitude qu'on
n'a pas les moyens de lever, et à une assurance qui coûte 0,16 $, on prend
l'assurance — un fragment mal formé coûte une reprise manuelle, ce qui écrase
l'économie de plusieurs ordres de grandeur.

**`medium` par défaut.** `high`, en revanche, coûte 1,10 $ de plus pour mille
(+18 %) sans rien de mesuré : à écarter.

Le « plancher de fidélité » ne soutient aucune des deux thèses. Le minimum de 5
apparaît à `none` et `medium` chez Sonnet, à `medium` chez GLM, nulle part chez
Luna — sans aucun motif cohérent entre juges. C'est du bruit, ce qui est
cohérent avec « pas d'effet ».

⚠️ « Rien de mesurable » n'est pas « aucun effet ». Avec n=8 et σ ≈ 1,0, seul un
écart d'environ 1 point serait détectable. Un bénéfice réel mais modeste resterait
invisible. Trancher demanderait plus de cas ou des répétitions.

## Ce que ce run ne dit pas

- Les biais propres de Sonnet sont inconnus. Il n'est pas candidat ici, donc pas
  d'auto-préférence — mais il note tout environ 1,2 point plus bas, et rien ne dit
  que cette sévérité est uniforme entre critères.
- Seules les comparaisons **à juge constant** ont un sens. Les niveaux absolus de
  deux juges ne se comparent pas.
- Tous les classements antérieurs produits avec Luna comme juge **et** Luna comme
  candidate sont à relire avec +1,2 point de complaisance en tête. Cela inclut le
  classement de septembre et l'étape 1 de ce matin.
