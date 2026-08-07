---
description: Subagents — liste, usage et bonnes pratiques pour ce repo
paths:
  - ".claude/agents/**"
---
## Subagents disponibles (`.claude/agents/`)

| Nom | Modèle | Scope principal | Quand l'utiliser |
|-----|--------|-----------------|------------------|
| `api-operator` | sonnet | Appels REST live (sync GDD, contexte, health) | Exécuter un endpoint ; skill `api-runbook` |
| `api-contracts-reviewer` | sonnet | `api/routers/`, `api/schemas/`, `frontend/src/api/` | Drift schema/router/client, status codes |
| `graph-editor-reviewer` | inherit | `frontend/src/store/*Slice*`, `components/graph/` | Zustand, React Flow, flush NodeEditorPanel |
| `llm-pipeline-reviewer` | sonnet | `core/llm/`, `services/llm_*`, `api/routers/streaming.py` | Streaming SSE, coûts, token counting |
| `context-gdd-reviewer` | sonnet | `core/context/`, `services/context_*`, `services/gdd_*` | Cache GDD, budget token, pipeline contexte |
| `security-reviewer` | sonnet | `api/middleware/`, auth, secrets | JWT, CORS, secrets, injection |
| `backend-services-reviewer` | sonnet | `services/`, `api/container.py` | Logique métier, Notion sync, Unity export |
| `test-coverage-reviewer` | sonnet | `tests/`, `frontend/src/__tests__/` | Couverture manquante, qualité tests ; tout test **lent** doit avoir `@pytest.mark.slow` / `integration` et être classé T0–T3 (`/test-tiers`) |
| `transcript-history-researcher` | sonnet | Sessions passées Claude Code + archive Cursor (hors git) | Grep/mining sur JSONL pour rétro **comportement agent / règles** |
| `playwright-e2e-specialist` | sonnet | `e2e/`, `playwright.config.ts`, graphe/auth E2E | **Exécute** Playwright, corrige specs/helpers (écriture autorisée) |

**Revue complète du repo** : pas d'agent orchestrateur dédié — **7 appels `Agent` dans le même message** (les 7 reviewers, hors `api-operator`, `playwright-e2e-specialist` et `transcript-history-researcher`). Le parent synthétise ensuite. Un seul appel multi-rôles ≠ 7 contextes isolés. Commande : `/full-review`.

**Seuil d'engagement** (`.claude/rules/agentivity.md`) :

- **≤ 3 subagents** → autonomie complète, initiative encouragée, aucune confirmation.
- **> 3 subagents** → annoncer le périmètre et demander une confirmation courte avant de lancer.

**Déclencheurs implicites** : une demande de revue **globale** / **complète** / **holistique** du codebase (y compris en anglais) appelle ce protocole 7× — donc au-dessus du seuil : proposer et attendre le feu vert. **`/full-review` tapé par l'utilisateur vaut confirmation** : partir directement. Si l'utilisateur précise un périmètre réduit ou un seul domaine, rester sous le seuil et agir seul.

**Coût** : une fois le feu vert obtenu, ne pas substituer une passe unique « généraliste » aux sept reviewers — la confirmation porte sur le **volume**, jamais sur la profondeur.

## Invocation

Les subagents de `.claude/agents/` sont exposés comme `subagent_type` de l'outil `Agent` — pas besoin de contournement.

```
# Explicite — un seul subagent
Agent(subagent_type: "graph-editor-reviewer", prompt: "vérifie les slices Zustand")

# Revue large — 7 appels Agent dans un seul message, puis synthèse parent

# Naturel
Use the security-reviewer subagent on the auth module
```

## Règles de délégation

- **Isoler** les tâches longues (exploration multi-dossiers, revue profonde) dans un subagent → contexte séparé.
- **Paralléliser** : plusieurs appels `Agent` dans le même message quand les zones sont indépendantes.
- **Playwright E2E** : par défaut viser **T1/T2** (`npm run test:e2e:smoke` ou liste de specs) ; **T3** (suite entière) = parent ou CI **une fois**. En parallèle : **chemins `e2e/*.spec.ts` explicites** dans chaque prompt, jamais `npx playwright test` nu. Voir `/playwright-e2e-parallel`.
- **`model: inherit`** pour les reviewers qui ont besoin du même raisonnement que le parent (ex. `graph-editor-reviewer`) ; `sonnet` sinon.
- **Lecture seule** : les reviewers se déclarent `tools: Read, Grep, Glob, Bash` — ils lisent, ils ne modifient pas. Exceptions assumées : `api-operator` et `playwright-e2e-specialist`, qui héritent de tous les outils.

## Création d'un nouveau subagent

Fichier `.claude/agents/<nom>.md` avec frontmatter YAML :

```yaml
---
name: nom-du-subagent
description: Rôle précis. Use when [condition spécifique].
tools: Read, Grep, Glob, Bash    # omettre pour hériter de tous les outils
model: sonnet                    # sonnet | opus | haiku | inherit
---
```

Le champ `description` est critique — c'est ce que lit l'agent parent pour décider de déléguer. Détail : `.claude/rules/claude_harness_authoring.md`.

## Anti-patterns à éviter

- Ne pas créer de subagents génériques (« helper », « assistant »).
- Ne pas dupliquer la logique des slash commands pour des tâches simples one-shot.
- Ne pas lancer la suite de tests complète depuis un subagent (`vitest run` sans filtre = interdit) — voir `.claude/rules/workflow.md`.
- Playwright : éviter N agents sur le même spec si les tests partagent un id de document non isolé ; préférer des **fichiers ou groupes disjoints**.
