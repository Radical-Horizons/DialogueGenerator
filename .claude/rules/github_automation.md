---
paths:
  - ".github/workflows/**"
---
# Automatisation GitHub (PR)

Trois workflows, tous déterministes. **Aucune clé API payante en CI** — voir la note en fin
de fichier.

| Déclencheur | Workflow | Effet |
|---|---|---|
| PR vers `main`/`dev`, push sur `main`, `workflow_dispatch` | `ci.yml` | Backend pytest, Vitest, ESLint, `tsc --noEmit`. T2 sur PR, T3 sur push `main`. |
| Push sur une PR vers `main` | `pr-merge-main-prefer-head-data.yml` | Merge `main`, arbitre les conflits `data/` en faveur de la PR. |
| Ouverture / push d'une PR | `pr-diff-gdd-split.yml` | Commente le diff séparé GDD vs code. **Informatif** : ni correctif ni réponse attendus — lire la colonne « hors GDD », ignorer l'autre (`.claude/rules/git_commit.md`). |

## ⚠️ Un push direct sur `dev` ne déclenche AUCUNE CI — c'est voulu

`push:` s'arrête à `main`. Les commits poussés directement sur `dev` ne voient donc
aucun run, et **ce n'est pas un oubli à réparer** : `dev` est une branche
d'intégration où atterrissent de petits correctifs, et son propriétaire ne veut pas
attendre un run à chaque poussée. La CI se paie sur les PR et à la porte `main`.

Le piège est réel et a déjà été activé (août 2026) : un agent a relevé « trois
commits arrivés sur `dev` sans CI », l'a traité comme un défaut, et a ajouté
`push: branches: [main, dev]`. Commit **revert**. Ne pas le refaire — constater
l'absence de run sur `dev` n'est pas un diagnostic, c'est le comportement attendu.

Corollaire pour les agents : quand on pousse sur `dev`, la preuve est **locale**
(`.claude/rules/workflow.md`), et elle vaut. Ne pas la présenter comme un manque.

## Trois invariants

**1. Un push fait avec `GITHUB_TOKEN` ne déclenche aucun workflow.** Tout workflow qui
pousse doit donc relancer la CI explicitement :

```
gh workflow run ci.yml --ref <branche>
```

`workflow_dispatch` est l'un des rares événements exemptés de cette restriction.
`pr-merge-main-prefer-head-data.yml` s'appuie dessus : sans ce relais, la CI resterait verte
sur le HEAD d'**avant** le merge et le commit réellement mergé ne serait jamais testé. Ne pas
retirer le déclencheur `workflow_dispatch` de `ci.yml`, ni l'étape de relais. Corollaire :
les steps de test de `ci.yml` sont conditionnés par `github.event_name != 'push'` pour le
tier T2, pas par `== 'pull_request'` — sinon un run relancé n'exécuterait rien.

**2. La famille `pull_request` s'exécute depuis la branche de la PR.** `pull_request`,
`pull_request_review` et `pull_request_review_comment` lisent le fichier de workflow présent
sur la branche de la PR, pas sur `main` : un workflow de cette famille est **actif dès qu'il
est poussé**, avant tout merge. À l'inverse `issue_comment`, `workflow_run` et `schedule`
lisent toujours la branche par défaut. Cette asymétrie décide de ce qui est testable depuis
une PR — et de ce qui peut consommer des ressources avant qu'on l'ait validé.

**3. `paths-ignore` utilise `*.md` et non `**/*.md`.** Dans les filtres GitHub, `**`
traverse les `/`, donc `**/*.md` exclurait tout `.claude/` (agents, commandes, règles), qui
est intégralement en markdown — une PR ne touchant que des prompts ne déclencherait aucun
run.

⚠️ **Corollaire à vérifier en protection de branche** : une PR qui ne touche que `docs/**` ou
un `*.md` racine ne produit **aucun** run. Si `Backend (pytest)` / `Frontend (Vitest)` /
`Frontend lint (ESLint)` sont des checks requis, ces PR restent bloquées en « Waiting for
status ».

## Garde fork

`pr-merge-main-prefer-head-data.yml` tourne en `contents: write` et pousse sur la branche de
la PR. Il exige `github.event.pull_request.head.repo.full_name == github.repository` : sans
ce test, une PR de fork ferait résoudre `head.ref` **dans le dépôt de base**, et une
collision de nom de branche enverrait le job écrire sur la mauvaise branche. Tout nouveau
workflow en écriture déclenché par une PR doit porter le même garde.

## Pas de clé API en CI

**Aucun workflow ne consomme d'API payante.** Pas de `ANTHROPIC_API_KEY` ni d'équivalent dans
les secrets du dépôt : un job qui appelle une API facturée dépense sans plafond et sans
signal — le coût n'apparaît nulle part dans l'onglet Actions.

Les `OPENAI_API_KEY: sk-dummy` de `ci.yml` sont des **littéraux factices**, pas des secrets :
le backend retombe sur `DummyLLMClient` sans clé valide. Un `grep API_KEY` sur les workflows
les remonte — ils ne consomment rien.

Un dispositif de revue / `@claude` / réparation CI automatique a été prototypé sur ce principe
(PR #54, #55) puis **retiré** : ~40 $ de crédits en une journée, sans rapport avec la valeur
rendue. La clé a été révoquée. Ne pas réintroduire de workflow appelant une API payante sans
plafond de dépense explicite et mesure du coût par PR.

Deux pièges découverts alors, à connaître avant toute nouvelle tentative :

- **L'anti-récursion `GITHUB_TOKEN` ne couvre que ce que postent les workflows.** Une session
  d'agent qui commente sous un compte utilisateur (PAT) est un utilisateur normal aux yeux de
  GitHub et réveille les workflows. Mesuré sur #55 : 0 run déclenché par les commentaires du
  bot, 8 par ceux d'une session postant sous le compte du mainteneur.
- **Une garde anti-boucle qui lit `git log` doit utiliser `--no-merges --first-parent`.**
  Sans `--first-parent`, `git log` traverse les deux parents d'un commit de merge et rend le
  commit non-merge le plus récent *toutes branches confondues* : un commit venu de `main`
  suffit à rouvrir la boucle.
