---
name: cursor-skills-authoring
description: >-
  Procédure complète pour créer des Agent Skills (SKILL.md, scripts, references) :
  structure dossier, frontmatter, paths, vs rules, anti-patterns, checklist.
  Use when creating or editing .cursor/skills, migrating rules via /migrate-to-skills,
  or when the user asks how to write agent skills.
paths:
  - ".cursor/skills/**"
  - ".agents/skills/**"
---

# Rédaction des Agent Skills

Références : [Cursor Docs — Skills](https://cursor.com/docs/skills) · [agentskills.io](https://agentskills.io/) · rule légère : `.cursor/rules/cursor_skills_authoring.mdc`

## Principe rule vs skill (ce dépôt)

| | Rule `.mdc` | Skill `SKILL.md` |
|---|-------------|------------------|
| Rôle | Contraintes **persistantes** | **Workflow** multi-étapes, scripts, checklists |
| Taille cible | < 50 lignes (cœur) | < 500 lignes ; détails en `references/` |
| Déclenchement | alwaysApply / globs / description / `@rule` | description + contexte ; `/name` ; `paths` |

Migrer une rule « intelligent » sans globs : `/migrate-to-skills` (Cursor 2.4+). Rules avec `globs` ou `alwaysApply: true` **restent** des rules.

## Emplacements

| Portée | Chemin |
|--------|--------|
| Projet | `.cursor/skills/<nom>/SKILL.md` ou `.agents/skills/` |
| Utilisateur | `~/.cursor/skills/<nom>/SKILL.md` |
| **Interdit** | `~/.cursor/skills-cursor/` |

- Sous-dossiers OK : `.cursor/skills/workflow/deploy/SKILL.md` — identité = dossier parent de `SKILL.md`.
- Anciens fichiers plats (`test-runbook.md`) : les **nouveaux** skills = dossier + `SKILL.md`.

## Arborescence

```text
nom-skill/
├── SKILL.md
├── references/   # doc à la demande (1 niveau de lien depuis SKILL.md)
├── scripts/        # exécutables
└── assets/         # templates, données
```

## Frontmatter

```yaml
---
name: nom-skill          # = nom du dossier ; kebab-case ; ≤ 64 car.
description: ...         # ≤ 1024 car. ; 3ᵉ personne ; QUOI + QUAND
paths:                   # optionnel — scope fichiers (pas globs legacy)
  - "frontend/**/*.tsx"
disable-model-invocation: false   # true = slash only
---
```

| Champ | Notes |
|-------|--------|
| `name` | Minuscules, chiffres, tirets uniquement |
| `description` | Critique pour découverte automatique |
| `paths` | Skill surfacé seulement sur fichiers matchés |
| `disable-model-invocation` | `true` pour commandes type slash explicites |

### Exemples de description

✅ « Génère des messages de commit conventional commits. Use when the user asks to commit, review staged changes, or write a commit message. »

❌ « Aide avec git » · ❌ « I can help you… »

## Corps du skill

1. **Spécifique projet** — pas de tutoriel générique.
2. **Progressive disclosure** : essentiel dans `SKILL.md`, détails dans `references/`.
3. **Workflows** : étapes numérotées ; checklist copiable si long.
4. **Scripts** : `scripts/foo.py` — préciser **exécuter** vs **lire** ; erreurs explicites.
5. **Verbatim** : texte exact fourni par l’utilisateur → recopier tel quel.
6. **Degré de liberté** : prose souple si jugement ; script/template si fragile.

## Patterns utiles

- **Template** : bloc markdown de sortie attendue.
- **Examples** : entrée utilisateur → sortie attendue (2–3 cas).
- **Conditional** : branche « création » vs « édition ».
- **Feedback loop** : valider (`npm test`, script) avant étape suivante.

## Anti-patterns

- Noms vagues : `helper`, `utils`, `tools`.
- Dupliquer une rule `.mdc` entière dans le skill.
- Chemins `scripts\foo.py` (préférer `/`).
- Dates « avant X » — section deprecated si legacy.
- Liste de 5 libs équivalentes sans défaut.

## Spécifique DialogueGenerator

- Pointer `workflow.mdc`, `test-tiers.md`, `AGENTS.md` — ne pas recopier les grilles T0–T3.
- Skills exécutables : commandes npm réelles (`npm run test:backend:smoke`, `npm run deploy:check`, …).
- Après nouveau skill : rule métier associée = **1–3 lignes** + lien `/nom-skill`.

## Workflow création

1. Confirmer que c’est un **workflow** (pas une simple contrainte → rule).
2. Choisir `nom-skill` (kebab-case) et portée (projet vs user).
3. Rédiger `description` (QUOI + QUAND).
4. Remplir `SKILL.md` ; extraire détails vers `references/` si > ~100 lignes.
5. Ajouter `scripts/` seulement si exécution répétable.
6. Rule légère associée si invariant permanent à rappeler hors skill.
7. Tester invocation `/nom-skill` et pertinence auto sur tâche type.

## Checklist avant commit

- [ ] `name` = dossier parent
- [ ] `description` : 3ᵉ personne, QUOI + QUAND, mots-clés
- [ ] `SKILL.md` < 500 lignes ; références 1 niveau
- [ ] Pas de doublon inutile avec une rule
- [ ] `disable-model-invocation` choisi sciemment
- [ ] Rule liée allégée si elle existait en version longue
