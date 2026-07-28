---
description: Discipline d'appel shell et d'outils — évite les prompts de permission évitables
globs: []
alwaysApply: true
---

# Discipline shell et outils (agents)

Les règles d'autorisation de `.claude/settings.json` sont matchées **par préfixe de commande**. Un appel préfixé par `cd` ne matche donc **aucune** entrée `allow` : `cd F:/… && npm run test:backend:smoke` ne correspond pas à `Bash(npm run test:*)` et redemande une permission à chaque fois.

- **Jamais de `cd` en préfixe.** Le répertoire de travail persiste entre les appels Bash. Utiliser des chemins absolus, et `npm --prefix frontend <script>` plutôt que `cd frontend && npm <script>`.
- **Outil dédié avant shell** : `Grep` plutôt que `grep`/`rg`, `Glob` plutôt que `find`, `Read` plutôt que `cat`/`head`/`tail`. Ces outils sont aussi les seuls à respecter le `deny` sur `Read(./.env)`, qu'un `cat` contournerait.
- **Une commande par appel.** Pas de chaînage `;` ou `&&` de commandes hétérogènes : un refus sur un maillon fait perdre tout le lot, et la commande composée ne matche aucun `allow`.
- **Exception** : le chaînage reste correct quand les commandes forment une seule opération atomique (`git add . && git commit …`).

Si une commande légitime et non destructive déclenche un prompt de façon répétée, l'ajouter à `permissions.allow` dans `.claude/settings.json` — périmètre **lecture seule** uniquement, jamais `cat`, `find`, `grep` (couverts par les outils dédiés) ni `gh api` / `node -e` (trop larges).

Windows / PowerShell : ne pas piper la sortie Vitest vers `Select-Object` — voir `.claude/rules/workflow.md`.
