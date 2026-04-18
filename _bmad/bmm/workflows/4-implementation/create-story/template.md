# Story {{epic_num}}.{{story_num}}: {{story_title}}

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a {{role}},
I want {{action}},
so that {{benefit}}.

## Acceptance Criteria

1. [Add acceptance criteria from epics/PRD]

## Tasks / Subtasks

<!-- Each task = one independently testable behavior (SM territory: WHAT, not HOW).
     Dev Notes contains WHERE/HOW context. Implementation details are the dev's job.

     Checkbox discipline (dev-story): flip ONE subtask line at a time — 🔴 [x] only after failing test run,
     🟢 [x] only after minimal implementation passes tests, 🔵 [x] only after refactor criteria met.
     Never check 🟢 or 🔵 before 🔴; never check parent Task until all three lines are [x].
     Emoji (🔴🟢🔵) labels each phase inside the markdown checkbox line. -->

- [ ] Task 1 : [Behavior description] (AC: #)
  - [ ] 🔴 Test échoue : [behavioral assertion — observable outcome, not implementation detail]
  - [ ] 🟢 Implémenter [component/area] pour passer 🔴 (voir Dev Notes)
  - [ ] 🔵 Refactor : [chantier principal — visible uniquement sur code complet, pas pendant le GREEN. Ex: renommer X→Y pour aligner vocabulaire métier, éliminer duplication entre A et B, clarifier nommage des cas de test]. Si applicable : [chantiers secondaires].

- [ ] Task 2 : [Behavior description] (AC: #)
  - [ ] 🔴 Test échoue : [behavioral assertion]
  - [ ] 🟢 Implémenter [component/area] pour passer 🔴 (voir Dev Notes)
  - [ ] 🔵 Refactor : [chantier principal — visible uniquement sur code complet, pas pendant le GREEN. Ex: renommer X→Y pour aligner vocabulaire métier, éliminer duplication entre A et B, clarifier nommage des cas de test]. Si applicable : [chantiers secondaires].

## Dev Notes

<!-- Constraints and context only — NOT implementation steps or prescription.
     DO: guardrails, what to reuse, quality bar (what to test), conventions.
     DO NOT: exhaustive file/method lists, step-by-step "create this" instructions. -->

- Architecture guardrails : what must not be violated, ADRs applicable
- What to reuse : existing components, actions, or endpoints (brief; key references only, not an exhaustive list)
- Quality bar : what behaviors must be covered by tests (outcomes), not how to write them
- Refactor bar (defaults) : dev-story REFACTOR QUALITY CRITERIA — e.g. max ~300 lines per source file touched in a task, ~60 lines per function, no non-trivial duplication, domain naming, single responsibility of exported units; override here if the story needs different numeric limits
- Fichiers chauds : [fichiers pré-existants > 500 lignes qui seront touchés — indiquer la taille actuelle et la contrainte explicite, ex: "`api/routers/graph.py` (1653 L) — handler ≤ 30 lignes, toute logique dans le service". Laisser vide si aucun fichier chaud concerné.]
- Conventions : naming, where similar code lives, constraints (e.g. persist via existing save)

### Project Structure Notes

- Relevant paths or modules only when it avoids wrong locations; naming conventions; detected conflicts or variances (with rationale)

### References

- Cite key sources with paths/sections where they add real context, e.g. [Source: docs/<file>.md#Section]. Prefer few precise refs over long lists.

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
