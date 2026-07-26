---
description: Protocole Meta-Agent — Diagnostic par preuves, analyse contre-factuelle et évolution des règles (inspiré de Meta-Harness)
alwaysApply: true
---

# Protocole Meta-Agent

Ce protocole impose une rigueur de diagnostic et d'auto-amélioration basée sur les preuves réelles du système (logs, terminaux, historique), plutôt que sur des suppositions.

## 0. Autonomie (avec `agentivity.md`)

- Mettre à jour `CLAUDE.md`, `.claude/rules/*.md` ou `.claude/commands/*` quand une session révèle une ambiguïté ou une erreur de processus — **sans** attendre une phrase magique si l'intention est claire (ex. après un échec de revue ou de workflow).
- Ne pas reporter l'évolution du harnais sous prétexte de « ne pas toucher au markdown » : ces fichiers **sont** le produit du workflow agent.

## 1. Diagnostic par Preuves (Evidence-Based)

AVANT de proposer un correctif pour un bug ou un échec de test :
- **Logs Bruts** : Lire les logs JSON récents dans `data/logs/logs_YYYY-MM-DD.json`. Ne pas se fier uniquement au résumé de la console.
- **État du Terminal** : Réexécuter la commande incriminée dans le terminal intégré pour voir la sortie réelle (état du shell, variables d'environnement, sortie complète). Ne pas se contenter d'un résumé de sortie tronquée.
- **Traces d'Exécution** : Si le bug est intermittent ou complexe, ajouter des logs temporaires (`logger.debug`) pour tracer l'état interne avant de tenter une correction définitive.

## 2. Analyse de Contre-factualité (Counterfactual)

Si une première tentative a échoué :
- **Pourquoi l'échec ?** : Analyser explicitement pourquoi la proposition précédente n'a pas fonctionné en consultant les nouveaux logs générés.
- **Preuve d'Échec** : Identifier la ligne de code ou la condition logique exacte qui a causé l'échec dans la trace d'exécution.
- **Pivot** : Ne pas répéter la même approche avec des variations mineures ; changer de stratégie basée sur la preuve d'échec.

## 3. Évolution du Harnais (Harness Evolution)

Le "Harnais" de l'agent est constitué des fichiers `.claude/rules/*.md` et `CLAUDE.md`.
- **Règles Obsolètes** : Si une règle a induit en erreur ou a manqué de précision, la mettre à jour immédiatement.
- **Nouvelles Connaissances** : Toute découverte structurelle sur le projet (ex: "ne pas utiliser tel pattern avec telle lib") doit être immortalisée dans une règle MDC.
- **Auto-Correction** : Si l'agent fait une erreur de workflow (ex: oubli du venv), mettre à jour `workflow.md` pour renforcer la contrainte.

## 4. Recherche Historique (Long-Horizon Context)

- **Transcripts Passés** : Utiliser `python scripts/peek_cursor_transcript.py search "erreur ou pattern"` pour retrouver comment des problèmes similaires ont été résolus dans des sessions précédentes.
- **10M Tokens de Contexte** : Ne pas hésiter à fouiller massivement le filesystem (logs, anciens fichiers, historiques) pour construire un diagnostic solide.

## 5. Commande de Diagnostic

Utiliser `scripts/meta-diagnostic.ps1` (si disponible) pour collecter rapidement les preuves après un échec.
