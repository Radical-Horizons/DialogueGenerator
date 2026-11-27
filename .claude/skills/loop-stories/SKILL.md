---
name: loop-stories
description: Enchaîner des stories BMAD depuis Claude Desktop, une session visible par story (bmad-build, tests, PR), cette conversation vérifiant et fusionnant entre deux. Alternative à bmad-loop avec suivi en direct. À utiliser quand l'utilisateur tape /loop-stories ou demande d'enchaîner, dérouler ou faire les prochaines stories d'un epic, de lancer la boucle de stories, ou de reprendre la boucle ("continue la boucle", "où en est la boucle ?"). Pas pour coder une seule story ici même (bmad-build).
---

# Boucle de stories

Tu es le chef d'orchestre : tu choisis la story, tu ouvres une session pour elle, tu
contrôles ce qu'elle livre, tu fusionnes, tu passes à la suivante. Tu ne codes pas et tu
ne corriges pas toi-même : ton contexte doit rester petit pour tenir plusieurs stories,
et l'utilisateur doit pouvoir suivre chaque travail dans sa propre session.

Il faut l'application de bureau (`mcp__ccd_session__start_session`). Sans elle, le dire
et s'arrêter ; ne pas se rabattre sur des sous-agents.

## Arguments

`/loop-stories [nombre] [epic=N] [auto]`

- `nombre` : un entier seul (`/loop-stories 1`), le nombre de stories à enchaîner. **Sans
  nombre : toutes les stories restantes de l'epic.**
- `epic=N` : par défaut le premier epic `in-progress`.
- `auto` : l'utilisateur approuve d'avance les specs sans question ouverte. Sans ce mot,
  chaque spec attend son accord.

Invoquer ce skill vaut demande de sessions séparées (`initiation: "user_asked"`),
commits, push, PR, et fusion dans `main` d'une PR vérifiée dont la CI est verte. Cela ne
vaut ni déploiement, ni `push --force`.

## Script

`B="uv run --no-project python .claude/skills/loop-stories/scripts/loop.py"`
(écrire la commande en entier à chaque appel : le shell ne garde pas les variables).

| Commande | Rôle |
|---|---|
| `$B journal` | état de la boucle (partagé entre sessions et worktrees) |
| `$B journal <clé> champ=valeur …` | écrire ; `champ=` efface |
| `$B queue --ref <ref> [--epic N] [--limit N]` | prochaines stories, dans l'ordre du fichier |
| `$B verify <branche> <clé> --base origin/main` | contrôle de livraison, code 1 si incomplet |
| `$B ci <n° de PR>` | CI du dernier commit : `verte`, `rouge`, `en-cours` ou `absente` |

Champs d'une story : `etat` (`en-cours`, `a-fusionner`, `fusionnee`, `bloquee`),
`session`, `branche`, `base` (SHA de départ), `pr`, `corrections`. Entrée `_boucle` :
`epic`, `max` (le nombre demandé ; vide = tout l'epic), `mode` (`validation` ou `auto`),
`faites`, écrite au démarrage d'une série.
`queue` ne propose jamais une clé qui porte un `etat` : elle la rend dans `launched`. Pour
relancer une story sur décision de l'utilisateur, effacer son `etat`. Écris le journal à
chaque changement : c'est lui, pas ta mémoire, qui permet de reprendre après une compaction
ou dans une autre conversation.

## 1. Reprendre avant de démarrer

`git fetch origin`, puis lire le journal. « continue la boucle » reprend `_boucle` (mode,
`max`, `faites`) ; un nouvel appel avec arguments le réécrit.

- Story `a-fusionner` : traiter sa PR (étape 4) avant tout.
- Story `en-cours` : regarder sa session (`get_session`, `list_events`). Si elle tourne, ne
  rien démarrer ; si elle a fini son tour, la traiter par l'étape 4. Jamais deux sessions
  filles au travail en même temps : deux suites pytest se bloquent mutuellement.
- Story `bloquee` : demander à l'utilisateur quoi en faire.
- Stories `interrupted` rendues par `queue` mais absentes du journal : les signaler à
  l'utilisateur et demander s'il faut les reprendre ; ne pas les sauter en silence.

## 2. Choisir

`git fetch origin` d'abord (après une fusion, `origin/main` local est périmé), puis la ref
de départ :

- aucune PR en attente : `git branch -f loop-base origin/main`, ref `loop-base` ;
- une PR en attente de CI : la branche de cette story (la suivante s'empile dessus).

`queue --ref <ref>`, prendre la première de `next`. Au premier passage, annoncer en
quelques lignes le mode, combien de stories sont prévues (`remaining` si aucun nombre n'est
donné) et les premières, sans attendre de confirmation.

Lire le `comment` de la story. S'il pose une **condition** (une date, une décision de
l'auteur, un compteur), demander avant de lancer.

## 3. Lancer

`start_session` : `initiation: "user_asked"`, `context: "fresh"`, `use_worktree: true`,
`source_branch: <ref>`, `branch_name` = la clé, `title` = « Story <numéro> : <sujet> ».
Lire `references/brief.md` et remplir le modèle pour `prompt` ; `background` en reprend le
contexte. Noter au journal `etat=en-cours session=<id> base=<git rev-parse de la ref>`, puis terminer
le tour.

L'application te réveille quand la session finit son tour. Ne rien sonder entre-temps.

Si l'application refuse le démarrage (tour ouvert par un message d'une autre session),
proposer la carte `own_initiative` avec le même brief et le dire.

## 4. Au réveil

Le rapport de la session est une affirmation, pas une preuve.

**Question ou approbation en attente** (spec à valider, question ouverte, arrêt de
`bmad-build`) : lire la fin de la session (`list_events`), présenter la question ici avec
ses options, et terminer le tour. Transmettre la réponse avec `SendMessage` en citant les
mots de l'utilisateur. Lui dire de répondre ici plutôt que dans la session fille : s'il
répond là-bas, l'application ne te réveillera pas et il devra écrire « continue la
boucle ».

**La session attend un sous-agent ou une commande en arrière-plan** (son dernier message le
dit) : une ligne à l'utilisateur, aucun outil, terminer le tour. Elle reprendra seule.

**Aucune des lignes `PRÊT` / `QUESTION` / `BLOQUÉ`** (session interrompue, limite d'usage,
arrêt interne de `bmad-build`) : lire la fin de la session. Travail à finir : le lui
demander (compte comme une correction). Cause hors de sa portée : le dire et s'arrêter.

**Livraison annoncée** :

1. `git fetch origin`, noter `branche` et `pr` au journal, puis
   `verify <branche> <clé> --base <base du journal>` : la base de départ, sinon le travail
   de la story du dessous compterait pour celle-ci.
2. Lire dans la spec le `Review Triage Log` et le diff `--stat`. Relever ce qui a été
   reporté dans `deferred-work.md`.
3. CI : `ci <n°>`, qui lit les exécutions du dernier commit. **Ne pas juger sur les compteurs
   de `get_status`** : une CI relancée par un workflow n'y figure pas, et des exécutions
   `action_required` y restent « en attente » pour toujours. `absente` n'est acceptable que si
   tout le diff est dans les `paths-ignore` de `ci.yml` ; sinon le signaler.

| Constat | Suite |
|---|---|
| `verify` ok, CI verte, fusionnable, rien en attente dessous | `gh pr merge <n> --merge`, `etat=fusionnee`, `faites` + 1, story suivante |
| `verify` ok, CI `en-cours` | `etat=a-fusionner`, `faites` + 1, story suivante empilée sur sa branche |
| `verify` en échec, CI rouge ou conflit | correction (ci-dessous) |

- **Jamais de fusion d'une story empilée avant que celle du dessous soit `fusionnee`** : sa
  PR contient aussi ses commits et les ferait entrer dans `main`, verts ou non.
- **Commit de fusion, jamais squash**, pour la même raison.
- **Ne pas attendre la CI** : aucun `gh pr checks --watch`, aucune boucle d'attente. Les PR
  en attente se traitent au réveil suivant, la plus ancienne d'abord.
- **Échec de CI** : l'Auto-fix de la session de la story la réveille, et la fin de son tour te
  réveille. Si elle l'a déjà corrigé, reprendre à `verify` ; sinon, correction.
- **Une seule PR en attente sous la story en cours.** À la deuxième, s'arrêter.
- Fusion refusée par les permissions : le dire tout de suite, sans chercher d'autre voie.

**Correction** : envoyer les problèmes exacts à la session de la story, `etat=en-cours`,
`corrections` + 1, terminer le tour et ne rien lancer d'autre. Si une autre fille travaille
encore, attendre son réveil avant d'envoyer. Si la story du dessus est déjà partie, lui
demander ensuite de fusionner la branche corrigée avant ses tests. **Deux corrections au
plus** par story ; ensuite `etat=bloquee` et arrêt.

## 5. S'arrêter

Arrêt quand le nombre demandé est atteint, que l'epic n'a plus de story (proposer la
rétrospective),
qu'une story est `bloquee`, qu'une condition ou une question attend l'utilisateur.

Rendre alors un tableau : story, session (lien), PR, état, reports. Dire clairement ce qui
n'est **pas** fusionné et que `/loop-stories` le reprendra.

## Limites à annoncer, pas à contourner

- **Une CI verte ne réveille personne.** La dernière PR d'une série reste à fusionner si sa
  CI tourne encore : le dire, « continue la boucle » la fusionne.
- Après beaucoup de réveils sans message de l'utilisateur, ou après un tour interrompu,
  l'application attend qu'il écrive. « continue la boucle » reprend depuis le journal.
- Les sessions filles héritent du mode de permission de cette conversation : en mode
  manuel, elles demandent à chaque action.
- Pour une longue série sans personne devant l'écran, `bmad-loop` reste plus sûr.
