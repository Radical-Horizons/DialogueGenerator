---
title: 'Story 6.9 — Suggérer templates selon le scénario (FR63)'
type: 'feature'
created: '2026-08-17'
status: 'done'
baseline_commit: 'f958c4778'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-8-partager-templates-avec-membres-équipe-fr62.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le sélecteur empile pré-built, custom, partagés et marketplace : le writer doit tout scanner pour trouver le gabarit du scénario (brief, persos, lieu).

**Approach:** Bouton **Suggestions** → modal plein écran. `POST /templates/suggestions` classe les candidats lisibles (score 0–100 + raisons). Un clic **Charger** applique (6.3). Scorer déterministe Python + miroir TS. Usage perso SQLite + `usageCount` marketplace.

## Boundaries & Constraints

**Always:**
- Routes **avant** `/{id}` : `POST /suggestions` (contexte → liste classée) ; `POST /suggestions/used` `{source, id}` (compteur perso). Guest OK. Pas de LLM.
- Candidats = `list_visible` 6.8 + pré-built + listings marketplace. Jamais un custom hors ACL. Dédup : si `sourceTemplateId` est déjà un custom visible, garder le live (boost market quand même).
- Corps POST : `instructions`, `sceneType`, `characters[]`, `locations[]`, `rencontreInitialeByCharacter` (texte `extract_rencontre_initiale` des fiches **déjà** dans `contextStore.characters[].data` — pas de rechargement GDD / Flags.json).
- Scorer pur partagé (FR94) : mêmes fixtures Python/TS → mêmes scores. Le modal affiche la réponse API (ACL + compteurs serveur).
- Score = min(100, kw≤40 + gdd≤25 + rencontre≤20 + perso≤15 + market≤10). Drop score 0 ; max 10. `rencontre` = +20 si au moins un texte non vide **et** candidat première rencontre (`sceneTypeHint==rencontre_initiale` ou nom/catégorie salutation / première rencontre). `perso` = min(use_count,10)*1.5. `market` = min(usageCount,50)/5 (listing ; custom via `source_template_id`).
- **Charger** : custom/shared/legacy → `handleTemplateLoaded` ; pré-built → `handlePrebuiltLoaded` ; marketplace → apply snapshot **sans** `POST /use` (pas de copie). Chaque apply réussi (sélecteur ou modal) → `POST /suggestions/used`.
- Table **010** `template_suggestion_usage` PK `(user_id, source, candidate_id)`, `use_count` ; **pas** de FK `users` (guest `"guest"`). UI : bouton à côté de Marketplace ; gabarit `TemplateMarketplaceModal` ; badge « Suggéré pour votre contexte », score %, raisons, source, **Charger**. Narrow. Client API sans `use`.

**Ask First:**
- Auto-appliquer le top 1. Poids du scorer hors formule ci-dessus. Flags.json / runtime Unity. Compter uniquement les clics du modal (pas les cartes du sélecteur).

**Never:**
- LLM, `TemplateSelector.tsx`, WebSocket, `GET /users`, copie silencieuse marketplace, trou ACL A/B 6.7 (`POST /ab-test` sans `require_readable`). Casser 6.1–6.8 / presets / overlay 6.5. Recharger le GDD pour le flag. Tests hardcodés sur persos/lieux Alteir réels.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Brief | « confrontation au port » | pré-built Confrontation en tête, score + raison mots-clés | N/A |
| GDD overlap | perso/lieu du POST = snapshot template | boost gdd ; raison contexte | N/A |
| Rencontre | section non vide dans le map | boost Salutation / `rencontre_initiale` | pas de boost si section absente (extrait) |
| Usage | 5 Chargers perso | score > jumeau jamais chargé | N/A |
| Market | listing `usageCount` élevé | boost market ; pas de copie au Charger | N/A |
| ACL / dédup | custom non lisible ; listing + live même source | absent ; une carte live | N/A |
| Vide | brief vide, 0 perso/lieu, 0 section | empty state modal | N/A |
| Charger | clic custom / pré-built / listing | 6.3 ; listing sans `/use` ; used++ | 404 hors visibilité |
| Guest | POST suggestions + used | 200 | pas de 403 |

</frozen-after-approval>

## Code Map

- `services/template_suggestion_service.py` + `frontend/src/utils/templateSuggestionScore.ts` -- scorer pur (miroir FR94)
- `services/scene_instruction_loader.py` -- réutiliser `extract_rencontre_initiale`
- `010_template_suggestion_usage.sql` + repository -- compteur perso
- `api/schemas/template.py` + `api/routers/templates.py` -- POST avant `/{id}`
- `api/container.py` / `api/dependencies.py` -- injection
- `frontend/src/api/templates.ts` + `types/template.ts` -- client
- `TemplateSuggestionsModal.tsx` + `PresetSelector.tsx` + `usePresetManagement.ts` -- bouton, modal, Charger + used
- Tests : `tests/api/test_templates_suggestions.py`, `tests/services/test_template_suggestion_score.py`, Vitest scorer + modal, `e2e/templates-suggestions.spec.ts`

## Tasks & Acceptance

**Execution:**
- [x] `010_template_suggestion_usage.sql` + repository -- usage perso (guest sans FK)
- [x] scorer Python + miroir TS + golden identiques -- formule Always
- [x] service + schémas + router + wiring -- candidats ACL / pré-built / market, dédup
- [x] client + `TemplateSuggestionsModal` + bouton PresetSelector -- UI
- [x] `usePresetManagement` -- apply 6.3 + `POST /suggestions/used` ; listing sans copie
- [x] pytest / Vitest / E2E matrice I/O ; lint + typecheck

**Acceptance Criteria:**
- Given brief « confrontation » + un perso dont la fiche chargée a `rencontre_initiale`, when j’ouvre Suggestions, then Confrontation et Salutation apparaissent avec score % et raison ; un custom non partagé n’y est pas.
- Given je clique Charger sur un listing marketplace, when l’apply réussit, then le formulaire est rempli (6.3) sans nouvelle copie Mes templates ; un second POST suggestions le remonte via usage perso.
- Given un guest, when il ouvre le modal et charge un pré-built, then 200 sur suggestions et used.

## Design Notes

`kw` = recouvrement de tokens normalisés (brief + `sceneType`) sur nom, description, catégorie, `sceneTypeHint`, `configuration.sceneType`, instructions. Extraire la section côté front depuis `character.data` (même forme que `extract_rencontre_initiale`) ; n’envoyer que les persos sélectionnés. Clé usage : `source` ∈ `custom` \| `prebuilt` \| `marketplace`.

Golden : brief « confrontation », template hint `confrontation` vs `cutscene`, 0 GDD / 0 usage → score confrontation > cutscene (écart dû à `kw` seul).

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest tests/api/test_templates_suggestions.py tests/services/test_template_suggestion_score.py --tb short` -- expected: passed
- `npx vitest run src/utils/templateSuggestionScore.test.ts src/__tests__/TemplateSuggestionsModal.test.tsx src/__tests__/PresetSelector.test.tsx --reporter=dot` -- expected: passed
- `npx playwright test e2e/templates-suggestions.spec.ts --grep "@smoke"` -- expected: passed
- `npm --prefix frontend run lint` + `npm --prefix frontend run typecheck` -- expected: 0 erreur

**Manual checks (if no CLI):**
- `npm run dev` → Suggestions : brief confrontation, perso avec section, Charger listing sans copie, guest OK.

## Suggested Review Order

**API et classement**

- Point d’entrée : contexte → liste classée, routes avant `/{id}`
  [`templates.py:183`](../../api/routers/templates.py#L183)

- Compteur perso (guest `"guest"`, pas de FK)
  [`templates.py:211`](../../api/routers/templates.py#L211)

- Ignore `Generic`, vide si aucun signal de scénario
  [`template_suggestion_service.py:34`](../../services/template_suggestion_service.py#L34)

- Pool ACL + pré-built + market, dédup live + boost
  [`template_suggestion_service.py:116`](../../services/template_suggestion_service.py#L116)

- Formule kw/gdd/rencontre/perso/market (miroir TS)
  [`template_suggestion_score.py:127`](../../services/template_suggestion_score.py#L127)

- Table 010, PK `(user_id, source, candidate_id)`
  [`010_template_suggestion_usage.sql:1`](../../services/repositories/sqlite/migrations/010_template_suggestion_usage.sql#L1)

**UI et apply**

- Bouton Suggestions à côté de Marketplace
  [`PresetSelector.tsx:671`](../../frontend/src/components/generation/PresetSelector.tsx#L671)

- Strip `Generic` + `rencontre_initiale` des fiches déjà en store
  [`PresetSelector.tsx:105`](../../frontend/src/components/generation/PresetSelector.tsx#L105)

- Modal plein écran : Escape, reset à l’ouverture, Charger ne ferme que si apply OK
  [`TemplateSuggestionsModal.tsx:80`](../../frontend/src/components/generation/TemplateSuggestionsModal.tsx#L80)

- Apply 6.3 + `POST /suggestions/used` ; listing sans copie
  [`usePresetManagement.ts:329`](../../frontend/src/hooks/usePresetManagement.ts#L329)

**Périphériques**

- Client API sans préfixe `use`
  [`templates.ts:261`](../../frontend/src/api/templates.ts#L261)

- Miroir TS du scorer
  [`templateSuggestionScore.ts:65`](../../frontend/src/utils/templateSuggestionScore.ts#L65)

- Schémas POST
  [`template.py:319`](../../api/schemas/template.py#L319)
