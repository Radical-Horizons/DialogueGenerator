# Story DT-1: Refactor GraphEditorHeader — tri-state toolbar (dette technique)

Status: backlog

## Story

*Reportée depuis Epic 17 — Story 17.9 (hors périmètre livraison mobile/responsive). Epic : `_bmad-output/planning-artifacts/epics/epic-dette-technique.md`.*

As a **développeur**,
I want **découper `GraphEditorHeader.tsx` en sous-composants et isoler la logique tri‑state (narrow/compact/full)**,
so that **les évolutions responsive/tactiles restent sûres, testables, et sans réintroduire des bugs de double-mount / overflow**.

## Acceptance Criteria

1. Desktop large / compact / narrow : comportement et UI équivalents après refactor (tolérance CSS minime).
2. Mode compact desktop : rangées status/tools explicites ; pas de double-mount des composants sensibles (`SaveStatusIndicator`).
3. `GraphEditorHeader.tsx` réduit à orchestration/wiring ; JSX principal dans sous-composants dédiés.

## Tasks / Subtasks

- [ ] **DT-1.A** — Extraction UI (`GraphToolbarStatusRow`, `GraphToolbarToolsRow`, `GraphToolbarTitleBlock`)
- [ ] **DT-1.B** — Extraction logique (`useGraphToolbarTriState` ou équivalent) + tests contrat
- [ ] **DT-1.C** — Hardening mocks + test anti double-mount `SaveStatusIndicator`

## Test Plan

- `npm --prefix frontend test -- src/__tests__/GraphEditorHeader.desktopToolbar.test.tsx src/__tests__/GraphEditorHeader.searchRow.test.tsx src/__tests__/GraphEditorHeader.undoRedo.test.tsx src/__tests__/GraphEditor.multiSelection.test.tsx`
- `npm --prefix frontend run lint`
- Preuve UI : full → compact → narrow → full (validée en équipe pour Epic 17 ; à rejouer si structure toolbar change)

## Dev Notes

- Refactor **sans** changement produit — livraison Epic 17 considérée close sans cette story.
- Fichier actuel ~1380 lignes ; tri-state via deux `useNarrowInlineSize` (640 / 1100 px).

## References

- [Source: `_bmad-output/planning-artifacts/epics/epic-dette-technique.md` — Story DT-1]
- [Origine: `_bmad-output/planning-artifacts/epics/epic-17.md` — Story 17.9 reportée]
