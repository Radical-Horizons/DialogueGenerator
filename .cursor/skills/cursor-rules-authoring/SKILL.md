---
name: cursor-rules-authoring
description: >-
  Procédure complète pour créer ou modifier des Project Rules Cursor (.mdc) :
  modes d'activation, choix globs vs intelligent, contenu, anti-patterns, checklist.
  Use when creating, editing, or reviewing .cursor/rules, AGENTS.md harness, or when
  the user asks how to write cursor rules.
paths:
  - ".cursor/rules/**"
  - "AGENTS.md"
---

# Rédaction des Project Rules

Références : [Cursor Docs — Rules](https://cursor.com/docs/rules) · rule légère : `.cursor/rules/cursor_rules_authoring.mdc`

## Principe rule vs skill (ce dépôt)

| Fichier | Contenu |
|---------|---------|
| **Rule** `.mdc` | Invariants courts, contraintes toujours vraies quand la rule s’applique |
| **Skill** | Checklists, tableaux, workflows, anti-patterns détaillés |

La rule reste **< 50 lignes** ; ce skill porte la procédure.

## Avant d’ajouter une rule

1. **Un sujet** par fichier (graphe, GDD, API…) — pas de méga-rule.
2. **Mettre à jour** une rule existante si le sujet chevauche.
3. **Ne pas dupliquer** : linter, `AGENTS.md`, `workflow.mdc`, docs longues — lier le canonique.
4. **`alwaysApply: true`** : max 1–3 rules, courtes, universelles (coût tokens permanent).

## Format fichier

```markdown
---
description: QUOI + QUAND + mots-clés (si mode intelligent)
globs: pattern1, pattern2   # optionnel
alwaysApply: false
---

# Titre

Corps concis…
```

- Extension **`.mdc`**, dossier `.cursor/rules/`.
- Pour « intelligent » : **omettre** `globs` (pas `globs: []`).

## Modes d’activation

| Mode | Configuration | Déclenchement |
|------|---------------|---------------|
| Always Apply | `alwaysApply: true` | Chaque session ; globs et description **ignorés** |
| Fichiers ciblés | `globs` + `alwaysApply: false` | Fichiers matchés **dans le contexte** ; description **ne déclenche pas** |
| Intelligent | `description` riche, **sans** `globs` | Agent juge via description |
| Manuel | sans `description` ni `globs` | `@nom-rule` |

### Choisir globs vs intelligent

**Intelligent** (pas de `globs`) si le sujet est transversal et la liste de fichiers serait incomplète — ex. déploiement, chemins GDD, classification champs, process agent.

**Globs** si la convention est ancrée à des chemins stables — ex. `frontend/src/components/graph/**`, `tests/**/*.py`, `api/**/*.py`.

Si `globs` : couvrir **code + tests + utils** liés (ex. `mergeNodeEditorForm.ts` si la rule cite ce flux).

### Description (mode intelligent)

- **3ᵉ personne**, phrase complète.
- **QUOI** + **QUAND** + termes métier (Notion sync, graph store, pytest T2…).
- ❌ « Standards backend » · ✅ « Conventions FastAPI api/routers et schemas Pydantic. Apply when adding routes, DTOs, or OpenAPI contracts. »

## Corps de la rule

- Puces impératives ; pas de narration.
- `@fichier/canonical.ts` plutôt que copier du code.
- Exemples ✅/❌ seulement pour erreurs récurrentes de l’agent.
- Si procédure > ~15 lignes ou checklist longue → **skill** + rule qui pointe `/nom-skill`.

### À éviter dans une rule

- Style guide complet, toutes les commandes npm, tutoriel générique LLM/React.
- Cas rares jamais rencontrés en session.
- Secrets, chemins machine-specific.

## Spécifique DialogueGenerator

- Français OK pour rules métier.
- Cohérence harnais : `AGENTS.md`, `.cursor/commands/`, `.cursor/agents/`.
- Rule tests/workflow → aligner `.cursor/commands/test-tiers.md`.
- Évolution harness : `meta_agent.mdc` (preuves, mise à jour rules après échec répété).

## Workflow création

1. Définir sujet + mode d’activation (tableau ci-dessus).
2. Rédiger corps court (invariants).
3. Si besoin de procédure → créer `.cursor/skills/<nom>/SKILL.md` et une ligne dans la rule.
4. Vérifier doublons dans `.cursor/rules/` (grep `description` / sujet).
5. Commit avec le code si la rule documente un changement d’architecture.

## Checklist avant commit

- [ ] Un sujet ; pas de doublon
- [ ] Trigger cohérent : globs **xor** intelligent (globs ⇒ description non utilisée pour déclencher)
- [ ] Globs complets (tests, utils) si mode fichiers
- [ ] Rule < 50 lignes cœur ; skill pour le reste
- [ ] Liens vers sources de vérité à jour
- [ ] Pas de secret
