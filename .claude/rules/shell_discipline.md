---
description: Discipline d'appel shell et d'outils — outils dédiés, lisibilité, portée des permissions
globs: []
alwaysApply: true
---

# Discipline shell et outils (agents)

- **Pas de `cd` en préfixe.** Le répertoire de travail persiste entre les appels Bash. Préférer un chemin absolu, `git -C <repo> …`, `npm --prefix frontend <script>`.

  ⚠️ **Portée réelle, vérifiée empiriquement (juillet 2026)** : en session interactive avec permissions automatiques, un préfixe `cd` ne coûte **aucun** prompt. Ne pas justifier cette règle par « ça évite une demande de validation » — c'est faux dans ce mode. Ce qui reste vrai : les entrées `permissions.allow` sont matchées **par préfixe**, donc `cd … && npm run test:x` ne matche pas `Bash(npm run test:*)` — ce qui compte uniquement là où les permissions sont réellement appliquées : **agents cloud, exécutions headless, CI, nouveau contributeur** (cf. skill `cloud-agent-runbook`).
- **Outil dédié avant shell** : `Grep` plutôt que `grep`/`rg`, `Glob` plutôt que `find`, `Read` plutôt que `cat`/`head`/`tail`. Ces outils sont ceux qui appliquent les règles `deny` de `.claude/settings.json` ; ils intègrent aussi les liens de fichiers cliquables et évitent le buffering PowerShell sous Windows.
- **Une commande par appel**, pour l'isolation des erreurs et la lisibilité de la sortie — **pas** pour les permissions : les chaînes `;` passent sans problème (vérifié). Le chaînage reste correct pour une opération atomique (`git add . && git commit …`).

- **`.env`** : le fichier est protégé par un `deny` et par `.gitignore`. Quand son contenu est nécessaire, **demander à l'utilisateur** — voir `.claude/rules/env.md`.

Les entrées `permissions.allow` de `.claude/settings.json` sont un filet pour les exécutions **non interactives** ; elles sont largement inertes en mode automatique. Périmètre **lecture seule** uniquement, jamais `cat`, `find`, `grep` (couverts par les outils dédiés) ni `gh api` / `node -e` (trop larges).

Windows / PowerShell : ne pas piper la sortie Vitest vers `Select-Object` — voir `.claude/rules/workflow.md`.
