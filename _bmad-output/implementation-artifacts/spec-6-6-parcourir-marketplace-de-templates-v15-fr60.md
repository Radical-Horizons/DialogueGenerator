---
title: 'Story 6.6 — Parcourir le marketplace de templates (V1.5+, FR60)'
type: 'feature'
created: '2026-08-16'
status: 'done'
baseline_commit: 'a88eaa14856ff3063f9632ca915fa416f17c17ee'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-5-configurer-templates-anti-context-dropping-subtilite-lore-vs-explicite-fr59.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un writer ne peut ni publier un template vers les autres comptes Epic 7, ni découvrir / noter / copier les leurs.

**Approach:** Catalogue SQLite de snapshots custom : publier, parcourir/filtrer/trier dans un modal plein écran, copier en Mes templates, noter 1–5, compter les usages.

## Boundaries & Constraints

**Always:**
- `shared_templates` (snapshot JSON schéma 6.5, `author_id` FK `users`, `source_template_id`, `usage_count`, `created_at`) + `template_ratings` (`listing_id`+`user_id` unique, stars 1–5). Migration `008`. Popularité = `usage_count`. Moyenne `AVG`, `null` si 0 note.
- Routes **avant** `/{id}` : `GET /marketplace` (nom, description, auteur username, usages, note, aperçu instructions + IDs contexte) ; `GET /marketplace/{id}` ; `POST /marketplace` `{templateId}` (`require_non_guest`) ; `POST /marketplace/{id}/use` → `create_template` nom `{name} (copie)`, `usage_count++`, guest OK ; `PUT /marketplace/{id}/rating` `{stars}` (`require_non_guest`, pas soi-même) ; `DELETE /marketplace/{id}` (auteur ou admin).
- Republier le même custom+auteur = upsert snapshot (id / notes / usages conservés). Custom reste `data/templates/custom/` (pas de scoping per-user). Guest : GET + Utiliser ; Publier / Noter / Retirer masqués (403).
- `PresetSelector` → bouton Marketplace → modal plein écran (gabarit `GenerationOptionsModal`). Filtres 6.1.2 (`filterTemplates` via mapping listing→Template) **et** tri usage / date / note. **Utiliser** = copie, pas apply 6.3. Writer : **Publier** sur une carte Mes templates. `get_current_user` partout. Narrow : tokens chrome.

**Ask First:**
- Scoper Mes templates par `user_id`. Marketplace anonyme, commentaires texte, seed officiel hors pré-built.

**Never:**
- `TemplateSelector.tsx`. A/B 6.7, partage équipe 6.8, suggestions 6.9, logs `template_id`. Casser 6.1–6.5 / presets. Muter le JSON pré-built. Scorer les fiches via LLM.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Vide | 0 fiche | empty state | N/A |
| Publier | writer + custom | listing + username | 404 absent |
| Guest publish | POST | 403 | 403 |
| Republier | même custom+auteur | snapshot à jour, même id | N/A |
| Utiliser | POST use | copie custom, usage++ | 404 |
| Noter | PUT 1–5 autre | upsert + moyenne | 403 guest ; 400 soi ; 422 hors 1–5 |
| Filtrer/trier | nom+cat+contexte + tri | AND 6.1.2 + tri (front après GET) | N/A |
| Retirer | DELETE auteur/admin | listing+notes disparus | 403 autre ; 404 |

</frozen-after-approval>

## Code Map

- `services/repositories/sqlite/migrations/008_template_marketplace.sql` + `shared_templates_repository.py` -- SQLite
- `services/template_marketplace_service.py` + `api/schemas/template.py` + `api/routers/templates.py` -- API `/marketplace*`
- `api/container.py` / `api/dependencies.py` -- injection
- `frontend/src/api/templates.ts` + `frontend/src/types/template.ts` -- client
- `frontend/src/utils/templateGroups.ts` -- mapping + tri
- `frontend/src/components/generation/TemplateMarketplaceModal.tsx` + `PresetSelector.tsx` -- UI
- Tests : `tests/api/test_templates_marketplace.py`, Vitest modal/filtres, `e2e/templates-marketplace.spec.ts`

## Tasks & Acceptance

**Execution:**
- [x] migration `008` + repository -- persistance
- [x] service + schémas + router + wiring -- API
- [x] client + types + `templateGroups` -- front data
- [x] modal + PresetSelector -- Publier / parcourir / Utiliser / noter
- [x] pytest / Vitest / E2E matrice I/O ; lint + typecheck

**Acceptance Criteria:**
- Given un writer publie un custom, when un autre compte ouvre Marketplace, then il voit nom, description, auteur, usages, note, aperçu ; Utiliser crée `{name} (copie)` dans Mes templates.
- Given le modal, when je filtre nom/catégorie/contexte et trie par usage, date ou note, then la liste suit 6.1.2 (AND) plus le tri.
- Given un guest, when il ouvre le marketplace, then GET + Utiliser marchent ; Publier et Noter sont refusés.

## Design Notes

Déclarer `/marketplace` avant `/{id}` (sinon 422 UUID). Snapshot figé jusqu’à republication. Copie = chemin 6.4, pas un second store. Clé auteur = `users.id`.

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest tests/api/test_templates_marketplace.py tests/services/repositories/sqlite/test_migrations.py -q` -- expected: passed
- `cd frontend && npx vitest run src/__tests__/templateGroups.test.ts src/__tests__/PresetSelector.test.tsx src/__tests__/TemplateMarketplaceModal.test.tsx --reporter=dot` -- expected: passed
- `npm --prefix frontend run lint` -- expected: zéro erreur
- `npm --prefix frontend run typecheck` -- expected: zéro erreur

**Manual checks (if no CLI):**
- `npm run dev` → A publie ; B filtre, trie, note, Utiliser ; guest sans Publier/Noter/Retirer.

## Suggested Review Order

**Persistance SQLite**

- Tables `shared_templates` + `template_ratings`, FK `users`, CASCADE notes.
  [`008_template_marketplace.sql:1`](../../services/repositories/sqlite/migrations/008_template_marketplace.sql#L1)

**Service métier**

- Publier = upsert snapshot (même id, notes/usages conservés).
  [`template_marketplace_service.py:75`](../../services/template_marketplace_service.py#L75)

- Utiliser = `create_template` + `usage_count++`, nom tronqué à 120.
  [`template_marketplace_service.py:123`](../../services/template_marketplace_service.py#L123)

- GET ignore un snapshot JSON/schéma cassé au lieu d’un 500 catalogue.
  [`template_marketplace_service.py:54`](../../services/template_marketplace_service.py#L54)

**API**

- `/marketplace*` déclaré avant `/{id}` (sinon 422 UUID).
  [`templates.py:157`](../../api/routers/templates.py#L157)

- DTO listing : auteur, usages, moyenne `null` si zéro note.
  [`template.py:210`](../../api/schemas/template.py#L210)

**UI**

- Modal plein écran : filtres 6.1.2, tri, Utiliser / Noter / Retirer.
  [`TemplateMarketplaceModal.tsx:207`](../../frontend/src/components/generation/TemplateMarketplaceModal.tsx#L207)

- Bouton Marketplace + Publier sur les cartes Mes templates.
  [`PresetSelector.tsx:555`](../../frontend/src/components/generation/PresetSelector.tsx#L555)

- Filtre AND + tri usage/date/note côté client après GET.
  [`templateGroups.ts:138`](../../frontend/src/utils/templateGroups.ts#L138)

**Tests**

- Matrice I/O API (guest 403, upsert, snapshot figé, notes).
  [`test_templates_marketplace.py:128`](../../tests/api/test_templates_marketplace.py#L128)

