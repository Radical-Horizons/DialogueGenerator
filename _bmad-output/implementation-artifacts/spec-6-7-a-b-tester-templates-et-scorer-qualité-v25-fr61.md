---
title: 'Story 6.7 — A/B tester templates et scorer qualité (V2.5+, FR61)'
type: 'feature'
created: '2026-08-16'
status: 'done'
baseline_commit: 'fd23b9e74b7a8b9a599132adb6a93ce1c154b17c'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-6-parcourir-marketplace-de-templates-v15-fr60.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un writer ne peut pas comparer deux templates sur des dialogues Unity complets, ni voir l’historique, un pouce humain, ou l’effet d’une retouche.

**Approach:** Job async : N arbres A/B en alternance (`expand-tree`, juge 4.7, coûts), modal plein écran, historique + graphiques CSS, pouces, relance liée au run parent.

## Boundaries & Constraints

**Always:**
- Pipeline = `DialogueTreeExpansionService.expand` (`persist=false`, Luna imposé comme `expand-tree`) puis `LLMQualityJudgeService.evaluate_graph`. Pas `generate-node` / `unity-dialogue` un nœud. Alternance A1,B1,A2,B2… N défaut **3** (1–5), `max_depth` défaut **2** (1–4), `max_choices` du snapshot template sinon 3. Même modèle pour A et B (on compare les templates).
- Gagnant = moyenne `overall_score` la plus haute (4 critères 4.7 affichés, non pondérables). Égalité : pas de vainqueur unique + note variance ±1. Pouces **hors** calcul du gagnant.
- `data/ab-tests/{test_id}/results.json` (pas SQLite, pas Mes documents). Routes **avant** `/{id}` : `POST /ab-test` (202 job, guest OK) ; `GET /ab-test` historique ; `GET /ab-test/{id}` ; `PATCH /ab-test/{id}/feedback` `{generationId, thumb: up|down|none}` ; `POST /ab-test/{id}/rerun` → nouveau test `parent_test_id`. Pas de `require_non_guest`.
- IDs : UUID custom **ou** `prebuilt:{slug}`. Snapshot de chaque template (instructions + contexte GDD). Lieu manquant ou instructions vides → 400 avant le job. Listing marketplace : copier d’abord (6.6).
- UI : `PresetSelector` → **A/B tester** → modal plein écran (gabarit Marketplace / `GenerationOptionsModal`). Rapport : scores, coûts, durées, pouces, barres CSS (pas de lib charts). Historique + évolution d’un template. Relance : overlay vs parent. Chrome narrow. Guest lance (consomme du LLM).
- Tests : DummyLLM / mocks expansion+juge — **zéro** appel LLM réel. Nom client API sans préfixe `use`.

**Ask First:**
- Gagnant composite (pouces ou coût). Persister les arbres dans Mes documents. A/B direct d’un listing marketplace. Autre modèle que Luna. Scoping historique par user.

**Never:**
- 6.8, 6.9, `TemplateSelector.tsx`, second juge, lib charts, logs `template_id`, PUT règles 4.10. Casser 6.1–6.6 / presets / overlay 6.5. Ouvrir GraphEditor sur les arbres A/B.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lancer | 2 IDs distincts, N, lieu+instructions OK | 202 + test_id ; job running → completed ; gagnant + totaux | 400 même ID / N hors 1–5 / lieu ou brief manquant |
| Guest | POST /ab-test | job identique (LLM consommé) | pas 403 |
| Une gen échoue | expand ou juge KO | entrée `error` ; suite continue ; gagnant si ≥1 score/côté | 200 completed partiel |
| Historique | GET /ab-test | liste tests (paire, scores, gagnant, date, parent) | vide = empty state |
| Pouce | PATCH up/down/none | persisté, UI à jour, gagnant inchangé | 404 test/gen |
| Relance | POST rerun après édition | nouveau test lié ; overlay scores vs parent | 404 parent |
| Pré-built | `prebuilt:salutation` vs UUID | résolu, run OK | 404 slug inconnu |
| Collision route | GET `/ab-test` | liste, pas 422 UUID | N/A |

</frozen-after-approval>

## Code Map

- `services/template_ab_testing_service.py` -- `run_ab_test` + résolution IDs + agrégats + thumbs + rerun
- `api/services/template_ab_test_job_manager.py` -- job mémoire (gabarit `InMemoryBatchJobManager`)
- `api/schemas/template.py` + `api/routers/templates.py` -- routes `/ab-test*` avant `/{id}`
- `api/container.py` / `api/dependencies.py` -- injection
- `services/dialogue_tree_expansion_service.py` + `services/llm_quality_judge_service.py` -- réutiliser, ne pas forker
- `frontend/src/api/templates.ts` + `frontend/src/types/template.ts` -- client
- `frontend/src/components/generation/TemplateABTestingModal.tsx` + `PresetSelector.tsx` -- UI
- `frontend/src/utils/abTestCharts.ts` -- totaux / gagnant / séries historique (pur)
- Tests : `tests/api/test_templates_ab_test.py`, Vitest modal+utils, `e2e/templates-ab-test.spec.ts` (N=1)

## Tasks & Acceptance

**Execution:**
- [x] `services/template_ab_testing_service.py` + job manager -- run alterné, JSON disque, thumbs, parent
- [x] `api/schemas/template.py` + `api/routers/templates.py` + container -- API `/ab-test*`
- [x] `frontend/src/api/templates.ts` + types + `abTestCharts.ts` -- contrat + agrégats UI
- [x] `TemplateABTestingModal.tsx` + `PresetSelector.tsx` -- lancer, rapport, historique, pouces, relance
- [x] pytest / Vitest / E2E matrice I/O ; lint + typecheck

**Acceptance Criteria:**
- Given deux templates avec lieu+brief, when je lance N=1, then chaque côté a un arbre Unity + score 4.7 + coût, et un gagnant (ou égalité) s’affiche avec barres.
- Given des tests passés, when j’ouvre l’historique, then je vois la liste et l’évolution des scores d’un template.
- Given un run terminé, when je mets un pouce, then il est persisté et le gagnant juge ne change pas.
- Given j’ai édité un template, when je relance depuis un test, then un nouveau run `parent_test_id` compare overlay vs l’ancien.
- Given un guest, when il ouvre A/B tester, then il peut lancer ; pas de 403.

## Design Notes

Body POST : `{templateAId, templateBId, generationsPerTemplate, maxDepth?}`. Résultats : par génération `id, templateId, overallScore, criteria[], costEur, durationMs, thumb, error`. Totaux par template. Job poll GET `{id}` (`queued|running|completed|failed` + `current/total`). E2E : DummyLLM, N=1, `max_depth=1`. `endpoint` usage = `templates_ab_test` pour sommer les coûts du run.

## Verification

**Commands:**
- `npm run test:backend:fast -- tests/api/test_templates_ab_test.py` -- expected: passed
- `npx vitest run src/components/generation/TemplateABTestingModal.test.tsx src/utils/abTestCharts.test.ts src/components/generation/PresetSelector.test.tsx` -- expected: passed
- `npx playwright test e2e/templates-ab-test.spec.ts --grep @smoke` -- expected: passed
- `npm --prefix frontend run lint` + `npm --prefix frontend run typecheck` -- expected: 0 erreur

## Suggested Review Order

**Pipeline A/B (expand Luna + juge 4.7)**

- Alternance A1,B1…, snapshots figés, gagnant = moyenne overall uniquement
  [`template_ab_testing_service.py:299`](../../services/template_ab_testing_service.py#L299)

- Expand Luna, `allow_partial=False` ; échec d’une gen n’arrête pas le run
  [`template_ab_testing_service.py:419`](../../services/template_ab_testing_service.py#L419)

- Pouces persistés sans recalcul du gagnant ; refus si le test n’est pas fini
  [`template_ab_testing_service.py:239`](../../services/template_ab_testing_service.py#L239)

- UUID only pour le chemin disque (anti path-traversal)
  [`template_ab_testing_service.py:503`](../../services/template_ab_testing_service.py#L503)

**API jobs et routes `/ab-test*` avant `/{id}`**

- POST 202 guest-ok, job BackgroundTasks, mark_failed si le schedule casse
  [`templates.py:438`](../../api/routers/templates.py#L438)

- GET merge job mémoire (`running` / `failed`) sur le JSON disque
  [`templates.py:489`](../../api/routers/templates.py#L489)

- Job manager gabarit batch, clé = test_id disque
  [`template_ab_test_job_manager.py:8`](../../api/services/template_ab_test_job_manager.py#L8)

- Body sans `Field(ge/le)` : 400 métier, pas 422 Pydantic
  [`template.py:253`](../../api/schemas/template.py#L253)

**Coûts LLM**

- Clients Luna/juge étiquetés `templates_ab_test` pour sommer le run
  [`templates.py:378`](../../api/routers/templates.py#L378)

- `endpoint=` optionnel sur l’usine LLM du router
  [`graph_router_helpers.py:44`](../../api/routers/graph_router_helpers.py#L44)

**UI modal**

- Entrée PresetSelector, gabarit Marketplace, guest peut lancer
  [`PresetSelector.tsx:578`](../../frontend/src/components/generation/PresetSelector.tsx#L578)

- Rapport 4.7, barres CSS, historique, overlay relance, chrome narrow
  [`TemplateABTestingModal.tsx:72`](../../frontend/src/components/generation/TemplateABTestingModal.tsx#L72)

- Gagnant affiché : « — » / « Pas de vainqueur » / « Égalité » selon le statut
  [`abTestCharts.ts:6`](../../frontend/src/utils/abTestCharts.ts#L6)

- Client API sans préfixe `use` (ESLint hooks)
  [`templates.ts:165`](../../frontend/src/api/templates.ts#L165)

**Tests**

- Matrice I/O API : égalité, depth, juge KO, pouce, Luna, 404 UUID
  [`test_templates_ab_test.py:237`](../../tests/api/test_templates_ab_test.py#L237)

- Modal + barres + overlay relance ; bouton A/B dans PresetSelector
  [`TemplateABTestingModal.test.tsx:104`](../../frontend/src/components/generation/TemplateABTestingModal.test.tsx#L104)

- E2E fumée, réseau mocké, N=1
  [`templates-ab-test.spec.ts:8`](../../e2e/templates-ab-test.spec.ts#L8)

