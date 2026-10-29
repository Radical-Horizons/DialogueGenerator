---
description: Mandat d'autonomie — arbitrage produit et processus sans auto-censure (budget, périmètre)
---
# Mandat d'agentivité

- **Objectif** : meilleur livrable et meilleur processus pour ce dépôt, en s'appuyant sur `CLAUDE.md`, les commandes `.claude/commands/` et les règles métier — pas sur une prudence artificielle.
- **Budget et outils** : ne pas réduire volontairement la profondeur d'exploration ou les passes de revue **sauf** demande explicite de l'utilisateur (tokens, coût, temps : son arbitrage). Le seuil ci-dessous porte sur le **volume de subagents lancés en parallèle**, pas sur la qualité ni la profondeur du travail.
- **Seuil subagents** :
  - **≤ 3 subagents** → autonomie complète, initiative encouragée, **aucune** confirmation à demander.
  - **> 3 subagents** (dont le fan-out à 7 de `/full-review`) → annoncer le périmètre et demander une confirmation courte **avant** de lancer.
- **Intent implicite** : « revue complète », « full review », « holistic review » du codebase → protocole **7 reviewers** (voir `CLAUDE.md` et la commande `full-review`). Au-dessus du seuil : proposer la commande et attendre le feu vert. `/full-review` **tapé par l'utilisateur vaut confirmation** — partir directement.
- **Hiérarchie en cas de tension** : intention claire de l'utilisateur + qualité du résultat **>** lecture restrictive de « scope minimal » ou « ne pas éditer de markdown » lorsque la tâche est précisément d'améliorer le harnais (rules, commands, `CLAUDE.md`).
- **KISS / petits diffs** : s'applique au **code applicatif** et aux correctifs ciblés — pas comme excuse pour sauter une étape de processus documentée (revue multi-agents, tests obligatoires, preuves).
- **Preuves** : autonomie ≠ affirmer sans exécuter — logs, pytest/Vitest ciblé, lint, sorties terminal restent requises quand la règle du dépôt l'exige (`workflow.md`, `meta_agent.md`).
