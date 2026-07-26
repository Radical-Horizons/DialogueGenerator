---
description: >-
  Automatisation GitHub des PR — revue Claude, @mention, réparation CI, merge auto.
  Invariants à connaître avant de modifier un workflow sous .github/workflows/.
globs:
  - ".github/workflows/**"
alwaysApply: false
---

# Automatisation GitHub (PR)

Tout se règle **sur la PR**, sans repasser par une session locale. Les trois workflows
Claude sont inertes — job vert, aucun blocage — si le secret `ANTHROPIC_API_KEY` disparaît.

| Déclencheur | Workflow | Effet |
|---|---|---|
| Ouverture de PR (ou passage en *ready*) | `claude-review.yml` | Revue par les subagents touchés par le diff, routés via `.claude/commands/pr-review.md`. **Lecture seule** : commente, ne pousse rien. |
| `@claude …` en commentaire | `claude-mention.yml` | Répond, **peut modifier le code et pousser** sur la branche. |
| CI en échec sur une branche de PR | `claude-ci-fix.yml` | Diagnostique, reproduit en local, **pousse un correctif** si la cause est mécanique — sinon commente et rend la main. |
| Push sur une PR vers `main` | `pr-merge-main-prefer-head-data.yml` | Merge `main`, arbitre les conflits `data/` en faveur de la PR. |

## Trois invariants

**1. Un push fait avec `GITHUB_TOKEN` ne déclenche aucun workflow.** Tout workflow qui
pousse doit donc relancer la CI explicitement :

```
gh workflow run ci.yml --ref <branche>
```

`workflow_dispatch` est l'un des rares événements exemptés de cette restriction. Trois
workflows s'appuient dessus ; ne pas retirer le déclencheur `workflow_dispatch` de `ci.yml`,
et ne pas retirer ces étapes de relais. Corollaire : les steps de test de `ci.yml` sont
conditionnés par `github.event_name != 'push'` pour le tier T2, pas par
`== 'pull_request'` — sinon un run relancé n'exécuterait rien.

**2. Les déclencheurs non liés à une branche s'exécutent depuis la branche par défaut.**
`issue_comment`, `workflow_run`, `schedule` lisent toujours le fichier de workflow présent
sur `main`, jamais celui de la PR. Conséquence : `@claude` et la réparation CI ne peuvent
pas être testés depuis une PR — ils ne s'activent qu'une fois mergés. Seul
`claude-review.yml` (`pull_request`) s'exécute depuis la branche de la PR.

**3. `.claude/` est restauré depuis la branche de base** par `claude-code-action`, avec
`CLAUDE.md`, `.mcp.json` et `.husky` (« PR head is untrusted »). C'est une protection
anti-injection : le contenu d'une PR ne doit pas pouvoir redéfinir les agents qui la
relisent. Conséquence : une PR qui modifie le harnais est toujours relue avec la version de
`main`, jamais la sienne — et une PR qui *introduit* un agent ne peut pas l'utiliser.

## Garde anti-boucle

`claude-ci-fix.yml` ne retente pas si le dernier commit de la branche vient déjà de
`github-actions[bot]` : une tentative automatique par commit humain, jamais de ping-pong
correctif → échec → correctif. Il commente alors pour demander une intervention.

## Filtres de chemins

`paths-ignore` utilise `*.md` et **non** `**/*.md` : dans les filtres GitHub, `**` traverse
les `/`, donc `**/*.md` exclurait tout `.claude/` (agents, commandes, règles), qui est
intégralement en markdown — une PR ne touchant que des prompts ne déclencherait aucun run.

## Authentification

Les workflows passent `github_token: ${{ secrets.GITHUB_TOKEN }}` à `claude-code-action`.
Sans cette entrée, l'action échange un jeton OIDC contre un token d'App et exige que l'App
GitHub Claude soit installée sur le dépôt (`401 — Claude Code is not installed on this
repository`). Contrepartie du choix actuel : les commentaires sont signés
`github-actions[bot]`, et les pushs ne déclenchent pas la CI — d'où l'invariant 1.
