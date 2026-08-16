---
title: 'Story 6.5 — Configurer templates anti-context-dropping (FR59)'
type: 'feature'
created: '2026-08-16'
status: 'done'
baseline_commit: '8f80fa557d2d45242f1eebcefbecd7710d59b02f'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-4-fournir-templates-pre-built-alteir-fr58.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les règles anti-drop sont globales (4.10). Un template Confrontation et un template Révélation partagent le même profil — on ne peut pas standardiser explicite vs subtil par scène.

**Approach:** Chaque template porte une **copie complète** du schéma 4.10. Charger pose un overlay de session : le panneau graphe et la génération (clause prompt + post-detect) l’utilisent, **sans** écrire le JSON global.

## Boundaries & Constraints

**Always:**
- Champ optionnel `contextDroppingRules` sur `TemplateConfiguration` (même forme que `ContextDroppingRulesSchema` : `rules_profile` strict/light, `tolerance`, `mandatory_info`, `dialogue_type_overrides`). JSON custom existant sans la clé = **hériter 4.10** (pas d’overlay).
- Créer / éditer : éditeur **parité 4.10** (profil, seuil, infos obligatoires, surcharges par type). Mode contrôlé : valeur locale, **jamais** `PUT /validation/rules/context-dropping`. Initialiser le formulaire create depuis un GET 4.10 (copie, pas un lien).
- **Charger** (6.3 / 6.4) pose l’overlay session si le snapshot a des règles ; sinon clear overlay. `GraphContextDroppingPanel` envoie `options` = overlay (sinon fichier global). Génération nœud : injecter une clause anti-drop dérivée de l’overlay dans l’appel (`user_instructions` enrichi **à l’envoi**, pas en réécrivant le textarea) ; après nœud appliqué, `detect-context-dropping` avec les mêmes `options`. Warnings visibles (toast / panneau) — **pas** d’échec Unity, **pas** de 422 génération.
- Pré-built : tamponner des règles par défaut (strict : `confrontation`, `negociation`, `test-caracteristique` ; light : `salutation`, `revelation`, `recrutement`, `cutscene` ; `mandatory_info` / overrides vides). Copier emporte `configuration` y compris les règles. Auth guest JWT OK. Narrow : tokens chrome existants.

**Ask First:**
- Changer l’heuristique 4.9 (labels GDD) pour exiger DD / deltas numériques dans le JSON.
- Overlay aussi sur les **presets**.
- Bloquer Générer si le post-detect a des cas.

**Never:**
- `TemplateSelector.tsx`, marketplace, A/B, partage, logs `template_id`.
- Écrire le fichier 4.10 depuis un modal template. Brancher le CD dans le validateur Unity (Epic 5).
- Casser CRUD 6.1–6.2, apply 6.3, pré-built 6.4, presets. Muter le JSON pré-built via l’UI.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Create/edit | règles 4.10 complètes | persistées dans le JSON template | 422 schéma invalide |
| Legacy | template sans clé | hérite 4.10 ; pas d’overlay | N/A |
| Charger avec règles | apply 6.3/6.4 | overlay session ; detect graphe envoie `options` | N/A |
| Charger sans règles | apply legacy / overlay clear | detect graphe = fichier global | N/A |
| Générer | overlay actif | clause prompt + post-detect ; nœud quand même créé | warnings UI, pas 422 |
| Pré-built / copie | 7 fiches tamponnées | copy custom garde les règles | N/A |
| Guest | create + apply + detect | 200 / 201 | N/A |
| Éditeur 4.10 graphe | PUT global | inchangé ; n’écrase pas les templates | N/A |

</frozen-after-approval>

## Code Map

- `api/schemas/template.py` / `frontend/src/types/template.ts` -- `contextDroppingRules` optionnel
- `api/schemas/validation_rules.py` -- réutiliser le schéma, ne pas forker
- `frontend/src/components/graph/ContextDroppingRulesEditor.tsx` -- extraire un mode contrôlé (pas de PUT)
- `frontend/src/components/generation/TemplateCreatorModal.tsx` / `TemplateEditorModal.tsx` -- section règles
- `frontend/src/hooks/usePresetManagement.ts` / store session -- overlay au Charger
- `frontend/src/components/graph/GraphContextDroppingPanel.tsx` -- passer `options` si overlay
- `frontend/src/store/slices/generationSlice.ts` -- clause à l’envoi + post-detect après apply
- `config/prebuilt_templates.json` -- tampon 7 fiches
- `api/routers/graph_quality.py` -- merge `options` déjà en place ; ne pas écrire le JSON global
- Tests : `tests/api/test_templates_crud.py`, Vitest modals / panel, `e2e/` template + detect

## Tasks & Acceptance

**Execution:**
- [x] `template.py` + types -- champ optionnel aligné 4.10
- [x] `ContextDroppingRulesEditor` contrôlé + modals create/edit
- [x] overlay session + panel `options` + apply 6.3/6.4
- [x] `generationSlice` -- clause prompt + post-detect (warnings)
- [x] `prebuilt_templates.json` -- tampon strict/light
- [x] pytest / Vitest / E2E matrice I/O ; lint + typecheck

**Acceptance Criteria:**
- Given je crée ou édite un template, when j’ouvre les règles anti-drop, then je règle profil, seuil, infos obligatoires et surcharges par type ; Enregistrer les met dans le JSON template, pas dans 4.10.
- Given un template avec règles, when je le charge puis je lance detect graphe ou une génération nœud, then ces règles s’appliquent (options / clause / post-detect) ; un template sans clé suit encore 4.10.
- Given les 7 pré-built, when je copie Confrontation, then le custom a `rules_profile: strict` ; Révélation → `light`.

## Design Notes

Réutiliser `ContextDroppingRulesSchema` et le merge `options` > fichier global (`graph_quality.py`). Overlay session, pas un PUT déguisé. `rules_profile` strict = Explicite, light = Subtil — l’heuristique 4.9 (labels dans le texte) ne change pas. Clause prompt = guidance LLM, le post-detect reste la validation. Post-detect **après** `applyGenerateNodeResponse` (nœud accepté), pour éviter les faux positifs pending.

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest tests/api/test_templates_crud.py tests/api/test_graph_detect_context_dropping.py -q` -- expected: passed
- `cd frontend && npx vitest run src/__tests__/TemplateCreatorModal.test.tsx src/__tests__/TemplateEditorModal.test.tsx src/components/graph/ContextDroppingRulesEditor.test.tsx src/__tests__/usePresetManagement.templates.test.ts src/components/graph/GraphContextDroppingPanel.test.tsx src/__tests__/generationSlice.contextDropping.test.ts src/utils/contextDroppingOverlay.test.ts --reporter=dot` -- expected: passed
- `npm --prefix frontend run lint` -- expected: zéro erreur
- `npm --prefix frontend run typecheck` -- expected: zéro erreur

**Manual checks (if no CLI):**
- `npm run dev` → create template : règles éditables ; PUT 4.10 graphe inchangé ; Charger Confrontation puis detect graphe = strict ; Générer un nœud → warnings possibles, JSON Unity non bloqué.

## Suggested Review Order

**Schéma et tampon**

- Champ optionnel, copie 4.10, absent = héritage.
  [`template.py:37`](../../api/schemas/template.py#L37)

- Confrontation / négociation / test-caractéristique en strict.
  [`prebuilt_templates.json:55`](../../config/prebuilt_templates.json#L55)

**Overlay session**

- Charger un template pose ou clear l’overlay ; un preset le clear.
  [`usePresetManagement.ts:211`](../../frontend/src/hooks/usePresetManagement.ts#L211)

- Detect graphe envoie `options` seulement si overlay.
  [`GraphContextDroppingPanel.tsx:50`](../../frontend/src/components/graph/GraphContextDroppingPanel.tsx#L50)

**Création / édition sans PUT 4.10**

- Mode contrôlé : jamais GET/PUT du fichier global.
  [`ContextDroppingRulesEditor.tsx:28`](../../frontend/src/components/graph/ContextDroppingRulesEditor.tsx#L28)

- Create initialise depuis GET 4.10, attend la copie avant Enregistrer.
  [`TemplateCreatorModal.tsx:383`](../../frontend/src/components/generation/TemplateCreatorModal.tsx#L383)

- Edit héritage jusqu’à Personnaliser.
  [`TemplateEditorModal.tsx:443`](../../frontend/src/components/generation/TemplateEditorModal.tsx#L443)

**Génération**

- Clause à l’envoi seulement ; post-detect après apply, ignoré si overlay changé.
  [`generationSlice.ts:248`](../../frontend/src/store/slices/generationSlice.ts#L248)

- Overlay de session, pas un champ preset.
  [`generationStore.ts:59`](../../frontend/src/store/generationStore.ts#L59)

