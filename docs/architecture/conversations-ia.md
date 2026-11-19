# Conversations IA — étude de faisabilité et architecture back-end

*Étude du 2026-11-19, mesures sur `gpt-6.2-sol`. Spec d'implémentation :
`_bmad-output/implementation-artifacts/spec-ai-conversation-noeud-dialogue.md`.*

## Verdict

**Faisable, avec une limite dure.** On peut reprendre une session avec l'IA qui a produit un
nœud et lui demander la raison de ses choix : elle repart du **contexte exact** (prompt, GDD,
instructions), de **sa réponse exacte** et du **résumé lisible de sa réflexion** quand OpenAI
le fournit. En revanche, elle **ne relit pas son raisonnement brut** : mesuré, l'API le retire
dès que la relance n'est plus une génération strictement identique. Une explication obtenue
après coup reste donc une reconstruction informée, pas un souvenir — et le modèle le dit
lui-même au lieu d'inventer.

## Ce qui existe déjà

| Élément | État avant ce chantier |
|---|---|
| Journal par appel LLM (`data/llm_usage/usage_AAAA-MM-JJ.json`) | Prompt complet + réponse brute. La réponse OpenAI renvoie aussi `instructions`, `tools`, l'appel de fonction et un item `reasoning` avec `encrypted_content` (contenu chiffré, lisible par le seul modèle). |
| Lien nœud → appel | Fiable pour un nœud seul. **Faux ou absent** dès qu'une requête fait plusieurs appels : choix avec test (4 appels), « tous les choix », jobs batch, expand-tree. |
| `FileLLMUsageRepository.update()` | **Bug** : remplace toutes les entrées d'un même `request_id` par celle qu'on met à jour — prompts, réponses et coûts des autres appels perdus. |
| Résumé lisible du raisonnement | Jamais demandé pour le graphe : `reasoning` n'est envoyé qu'avec un effort explicite. Sur les records 5.6 locaux : 0 résumé sur 26. |

## Sonde réelle

Script : `scripts/llm_probes/reasoning_replay_probe.py` (manuel, quelques centimes). Une
génération en appel de fonction forcé, effort `high`, à qui l'on demande de choisir en secret,
dans sa seule réflexion, un motif, un prix et un mot de passe ; puis des relances qui lui
posent la question. Le compteur `input_tokens` dit si le raisonnement (ici 184 tokens) a été
réinjecté.

| Relance | Tokens d'entrée | Raisonnement réinjecté | Réponse du modèle |
|---|---|---|---|
| Rejeu sans état, même config, `tool_choice: "none"` | 364 | non | « Je ne m'en souviens pas… je ne vais pas les inventer » |
| **Rejeu sans état, config strictement identique** (appel forcé) | **550** (+184) | **oui** | rappelle `generate_interaction` : pas de réponse en texte possible |
| `previous_response_id`, `tool_choice: "none"` | 364 | non | idem, aucune trace |
| `previous_response_id`, question dans la sortie d'outil, `"auto"` | 357 | non | répète la réplique |
| Question portée par un outil de réponse (boucle d'outils) | = historique visible | non | « je ne peux pas restituer ma réflexion privée » |
| `function_call` rejoué **sans** son item `reasoning` | — | — | **400** : l'item de raisonnement est obligatoire |

Autres constats :

- Le résumé lisible (`reasoning.summary: "auto"`) est revenu **1 fois sur 5** sur l'ensemble des
  sondes (518 caractères, en anglais). Il dit bien ce que le modèle a choisi (« un garde qui
  surveille la forge »). Les quatre modèles GPT-6 (`astra`, `sol`, `terra`, `luna`) acceptent le
  paramètre sans erreur ; à effort par défaut et sur une consigne simple, 6.1/6.2 ne raisonnent
  parfois pas du tout (0 token) et ne produisent donc aucun résumé.
- La doc OpenAI annonce que GPT-5.6+ réinjecte le raisonnement des tours précédents
  (`reasoning.context: "all_turns"`, présent par défaut dans nos réponses). La mesure montre
  que ce n'est vrai que si le préfixe (instructions, outils, `tool_choice`) ne bouge pas.
- Les réponses sont conservées 30 jours chez OpenAI (`store: true` par défaut) : un chaînage
  par `previous_response_id` expirerait de toute façon.

## Options

| Option | Ce que l'IA retrouve | Verdict |
|---|---|---|
| A. Rejeu natif (items chiffrés ou `previous_response_id`) | Rien de plus que B en conversation (mesuré) ; 30 jours max ; OpenAI seulement | Écartée |
| **B. Rejeu textuel de l'instantané + résumé lisible** | Contexte exact, réponse exacte, résumé de réflexion si fourni ; tous fournisseurs | **Retenue, livrée** |
| C. « Notes d'intention » capturées à la génération (champ dans la sortie structurée, non exporté vers Unity) | La seule justification produite **avec** le raisonnement en contexte, fiable à 100 % | **Décision produit à prendre** : ~100–200 tokens de sortie par nœud (≈ 0,001–0,002 $ en 6.2 Sol), change le contrat de génération et peut peser sur la qualité |
| D. Explication demandée juste après la génération, même config | Impossible : la config identique force un nouvel appel `generate_interaction` (ligne 2 de la sonde) | Écartée |

## Architecture livrée (back-end)

**Traçabilité** — chaque appel LLM reçoit un `call_id` unique ; `update()` cible ce `call_id`.
La provenance passe par deux `ContextVar` (`services/llm_call_provenance.py`) : le router ouvre
un dict partagé `node_id → call_id`, et chaque site qui crée des nœuds capture, **dans sa propre
tâche asyncio**, l'appel qui les a produits. Les routers annotent ensuite chaque nœud sur son
record (generate-node, regenerate, job batch au fil des parents, expand-tree), en une écriture
groupée hors boucle d'événements, et **seulement si l'utilisateur peut modifier le dialogue
visé** : sinon un autre rédacteur pourrait planter la génération que rejouerait votre
conversation.

**Réflexions lisibles** — les modèles GPT-5.6/6.x reçoivent `reasoning.summary: "auto"` par
défaut (l'effort reste au défaut de l'API).

**Conversations** — SQLite (`ai_conversations`, `ai_conversation_messages`), service
`AIConversationService` à **sujets enfichables** (un résolveur par `kind`), API :

| Route | Rôle |
|---|---|
| `POST /api/v1/ai-conversations` | Crée une conversation sur un sujet (`{"kind": "dialogue_node", "dialogue_id", "node_id"}`) |
| `GET /api/v1/ai-conversations` | Liste les conversations de l'utilisateur (filtres sujet) |
| `GET /api/v1/ai-conversations/{id}` | Détail : trace de génération (sortie, résumé de réflexion) + messages |
| `POST /api/v1/ai-conversations/{id}/messages` | Pose une question, renvoie la réponse |
| `DELETE /api/v1/ai-conversations/{id}` | Supprime |

À la création, la génération est **copiée** dans la conversation (instantané), avec le nœud
**tel qu'il est aujourd'hui** dans le dialogue quand il est lisible : l'IA voit ce que l'auteur
a retouché. Une régénération du nœud ou la rotation des journaux ne change pas une discussion
en cours. L'accès au dialogue est revérifié à chaque lecture et à chaque message ; une
conversation est privée à son auteur ; un invité ne peut pas écrire. Le modèle est celui de la
génération (repli configuré compris) ; un modèle demandé inconnu est refusé (422), un modèle
retiré depuis est remplacé par le modèle par défaut. Les tours d'une même conversation passent
un par un.

## Vérification de bout en bout (réelle, 2026-11-19)

Génération réelle en sortie structurée sur `gpt-6.2-sol` (contenu synthétique, ~7,6 k tokens),
relue par le parseur de trace, puis conversation de deux tours par le service, l'auteur ayant
retouché la réplique entre-temps :

| Étape | Tokens d'entrée | Relus en cache | Coût |
|---|---|---|---|
| Génération | 7 588 | — | 0,0226 $ |
| Tour 1 | 5 377 | 0 (écrits en cache, 1,25 ×) | 0,0167 $ |
| Tour 2 | 5 731 | 5 355 | 0,0042 $ |

Le tour rejoué coûte moins que la génération (plus de schéma d'outil) ; le premier tour ne
relit rien de la génération (instructions et outils diffèrent), les suivants relisent presque
tout. Pour un vrai nœud du graphe (~12–13 k tokens), compter ≈ 0,03 $ le premier tour puis
≈ 0,005 $ les suivants. Plafond : 40 messages par conversation ; contrôle de budget avant
chaque appel.

Qualité observée : le modèle distingue ce qui « venait directement des fiches » de ce qu'il
reconstruit, et compare sa réplique à celle que l'auteur a retouchée. Aucun résumé de
réflexion n'est revenu sur cette génération.

## Limites connues

- Le nœud START créé par « Générer » n'est relié à aucun dialogue (le dialogue n'existe pas
  encore au moment de l'appel) : pas de conversation possible sur lui tant que le front ne
  transmet pas le lien à la première sauvegarde.
- Un nœud généré avant que le dialogue ait un nom de fichier, ou sur un dialogue que
  l'utilisateur ne peut pas modifier, n'est pas annoté (pas de conversation possible).
- Les records antérieurs à ce chantier gardent leurs liens faux pour les requêtes multi-appels
  (pas de réparation rétroactive possible : les données écrasées sont perdues). Quand un tel
  record pourrait être la copie d'un nœud frère, la conversation est refusée (404) plutôt que
  d'expliquer le mauvais nœud.
- Le résumé de réflexion est souvent en anglais et pas toujours fourni.

## Extensions envisagées (même socle, un résolveur de sujet chacune)

| Sujet | Graine de conversation | Point d'attention |
|---|---|---|
| Recherche GDD (`gdd_query`) | Requête + extraits trouvés par `ContextBuilder` ; à terme, outils de recherche appelables par le modèle | Budget de tokens, fraîcheur du cache GDD |
| Questions sur l'interface (`ui_help`) | Guides `docs/guides/` + description de l'écran courant fournie par le front | Aucun accès au code nécessaire |
| Assistance qui corrige le code (`code_assist`) | La conversation produit un **ticket** (constat, reproduction) confié à un agent de code **isolé** (worktree ou agent cloud) qui ouvre une PR | Jamais d'exécution de code ni d'accès aux secrets depuis l'API de prod ; jamais de push direct ; revue humaine obligatoire |

Front (étape suivante) : panneau « Discuter avec l'IA » sur le nœud, affichage du résumé de
réflexion, et décision sur l'option C.
