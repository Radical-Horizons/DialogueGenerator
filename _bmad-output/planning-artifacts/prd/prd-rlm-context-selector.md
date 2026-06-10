---

## workflowType: 'prd'
date: 2026-01-18
user_name: Marc
project_name: DialogueGenerator
feature: "RLM Context Selector"
related_adr: "ADR-005"
classification:
  epic_priority: "Nice to Have"
  epic_scope: "New Feature - Optional Service"
  phase: "V1 - Post-MVP Enhancement"

# Product Requirements Document - RLM Context Selector

**Author:** Marc  
**Date:** 2026-01-18  
**Status:** Proposed  
**Related ADR:** ADR-005 (RLM Context Selector - Autonomous Context Selection)

---

## Executive Summary

**Vision:** Réduire la friction cognitive de sélection manuelle de contexte GDD en permettant une sélection autonome intelligente par un agent LLM (paradigme RLM), tout en préservant le contrôle utilisateur via toggle on/off, override et lock.

**Problème clé:** La sélection manuelle de sous-sections et sous-parties de fiches GDD est cognitivement coûteuse et error-prone. Les contextes de 20k+ tokens causent "context rot" (dégradation attention, dépendances longues brouillées, rappel précis dégradé) observé en test.

**Solution:** Service optionnel RLM (Recursive Language Models) qui explore programmatiquement le GDD via function calling, sélectionne intelligemment les éléments pertinents (fiches, sous-sections, sous-parties), et réduit le contexte de 20k+ → 12-15k tokens (Phase 1) → 6-10k tokens (Phase 2) sans perte de pertinence.

**Différenciateur:** Granularité fine (sous-sections → sous-parties) via paradigme RLM, pas juste sélection de fiches. Templates et mots-clés simples ne peuvent pas couvrir cette granularité.

---

## Success Criteria

### User Success

**Phase 1 (MVP):**

- Réduction friction: Toggle "Auto Selection" à gauche du bouton "Générer" → sélection automatique en 1 clic
- Réduction tokens: 20k+ → 12-15k tokens sans perte de pertinence mesurable
- Expliquabilité: Justifications affichées (utilisateur comprend pourquoi élément inclus/exclu)
- Contrôle: Override/lock fonctionnels (utilisateur peut forcer/ajouter éléments même en auto)

**Critère de succès:** Utilisateur active toggle et accepte sélection auto >70% du temps (vs sélection manuelle).

**Phase 2 (Amélioration):**

- Granularité chunks ciblés: 6-10k tokens (réduction supplémentaire via field_filters)
- Cache sélections: TTL 24h (sélections réutilisables)
- Apprentissage: Système apprend des préférences utilisateur (overrides fréquents)

### Business Success

**Objectif:** Service optionnel nice-to-have pour améliorer expérience utilisateur avancée (power users).

**Métriques Phase 1:**

- Taux activation toggle: >40% utilisateurs
- Taux override (ajout/force éléments): <30% sélections
- Réduction tokens moyenne: 15-20k → 12-15k (objectif -25% minimum)
- Qualité dialogues générés: Pas de dégradation vs sélection manuelle (score subjectif 1-5)

---

## Product Scope

### MVP (Phase 1)

**Fonctionnalités:**

- Toggle "Auto Selection" dans UI contexte (à gauche du bouton "Générer", panneau de droite)
- Service RLM `RLMContextSelector` avec sélection autonome (fiches + sous-sections via `section_filters`)
- Outils GDD exposés au LLM via function calling (`GDDToolsProvider`)
- Extension `ContextFieldManager.filter_fields_by_section_filters()` avec `include/exclude`
- Endpoint API `/api/v1/context/select-context` (POST)
- Affichage justifications dans UI (format compact, détails on-demand)
- Mode override: Ajout/force éléments même en auto
- Mode lock: Verrouiller éléments (toujours inclus)
- Fallback gracieux: Si RLM échoue, retourner hints uniquement (pas d'erreur)

**Exclusions MVP:**

- Granularité chunks ciblés (`field_filters` avec `get_relation_chunks`) → Phase 2
- Cache sélections (TTL 24h) → Phase 2
- Apprentissage préférences utilisateur → Phase 2

### Vision (Phase 2)

**Fonctionnalités additionnelles:**

- Granularité chunks ciblés: `field_filters` avec `get_relation_chunks()` (ex: Relations communes entre 2 personnages, 200 tokens vs 2000 tokens)
- Cache sélections: TTL 24h (hash `user_instructions + sorted(hints) + expansion_radius + max_tokens_target`)
- Apprentissage utilisateur: Mémoire des préférences (overrides fréquents) pour ajuster suggestions
- Analytics: Métriques toggle (taux ON/OFF, raisons override)

---

## User Journeys

### Journey 1: Power User Active Auto Selection (Happy Path)

**Acteur:** Marc (power user, sélection manuelle fastidieuse)

1. **Setup:** Ouvre panneau génération, voit toggle "Auto Selection" à gauche de "Générer"
2. **Activation:** Active toggle "Auto Selection" → système démarre exploration GDD via RLM
3. **Feedback:** Indicateur de progression affiché ("Exploration du GDD... 2/50 appels outils")
4. **Résultat:** Sélection automatique affichée avec justifications cliquables
5. **Validation:** Consulte justifications (format compact), valide sélection
6. **Override optionnel:** Ajoute élément manquant via override (lock si récurrent)
7. **Génération:** Clique "Générer" → contexte optimisé (12-15k tokens) → dialogue de qualité

**Émotions:** Confiance (comprend pourquoi éléments sélectionnés), Efficacité (1 clic vs 10+ clics manuels)

### Journey 2: Power User Active Override (Control Path)

**Acteur:** Marc (sélection auto insuffisante)

1. **Setup:** Active toggle "Auto Selection"
2. **Sélection auto:** Système propose sélection automatique
3. **Évaluation:** Consulte justifications, identifie élément manquant
4. **Override:** Ajoute élément manquant via mode override (force inclusion)
5. **Lock optionnel:** Si élément critique récurrent, verrouille (toujours inclus)
6. **Génération:** Clique "Générer" → contexte hybride (auto + override) → dialogue de qualité

**Émotions:** Contrôle (override facile), Confiance (système apprend préférences Phase 2)

### Journey 3: User Désactive Auto (Fallback Path)

**Acteur:** Utilisateur préfère sélection manuelle

1. **Setup:** Toggle "Auto Selection" désactivé par défaut
2. **Sélection manuelle:** Utilise sélection manuelle existante (non impactée)
3. **Expérimentation optionnelle:** Active toggle ponctuellement pour tester
4. **Retour manuel:** Désactive toggle si préférence manuelle confirmée

**Émotions:** Liberté (choix utilisateur), Non-intrusion (service optionnel)

---

## Functional Requirements

### FR1: Toggle Auto Selection UI

**FR1.1:** Toggle "Auto Selection" visible dans panneau génération, positionné à gauche du bouton "Générer".

**FR1.2:** Toggle désactivé par défaut (sélection manuelle préservée).

**FR1.3:** Toggle synchronisé avec état `generationStore.autoSelection` (boolean).

### FR2: Service RLM Context Selection

**FR2.1:** Service `RLMContextSelector.select_context()` accepte `user_instructions`, `hints` (optionnel), `hints_mode` (optionnel), `exclude` (optionnel), `expansion_radius`, `max_tokens_target`, `seed` (optionnel).

**FR2.2:** Service explore GDD via outils exposés (`GDDToolsProvider`): `search_bm25`, `get_related`, `get_snippet`, `get_node`, `list_ids`, etc.

**FR2.3:** Service produit `ContextSelectionResult` avec `selected_elements` (fiches + modes + `section_filters`), `justifications` (raison + preuve), `trace` (outils appelés, décisions).

**FR2.4:** Service respecte limites: `MAX_TOOL_CALLS = 50`, `MAX_EXPLORATION_TOKENS = 100000` (budget séparé, modèle GPT-5-mini).

**FR2.5:** Service respecte hints explicites (toujours inclus, mode full par défaut).

### FR3: Outils GDD pour LLM (GDDToolsProvider)

**FR3.1:** Abstraction `GDDToolsProvider` expose outils GDD au LLM via function calling.

**FR3.2:** Outils disponibles: `get_node(id)`, `get_fields(id, fields[])`, `list_ids(type, where_field_exists, limit)`, `schema_overview()`, `search_bm25(query, top_k, filter_type)`, `search_regex(pattern, field, top_k)`, `search_by_key_value(key, value, exact)`, `get_snippet(id, field, max_chars, around)`, `get_related(id, relation_keys, depth)`, `count(filter)`, `group_by(field, filter)`, `build_table(ids, columns)`, `diff(id_a, id_b, fields)`.

**FR3.3:** (Phase 2) Outil `get_relation_chunks(source_id, target_id, relation_field)` pour chunks ciblés (intersection relations communes).

### FR4: Extension ContextFieldManager

**FR4.1:** Méthode `ContextFieldManager.filter_fields_by_section_filters()` accepte `section_filters` avec `include` (sous-sections à inclure), `exclude` (sous-sections à exclure).

**FR4.2:** Méthode combine règles statiques (`context_config.json`) + règles dynamiques (`section_filters`).

**FR4.3:** Méthode ne bypass pas le DSL de champs existant.

**FR4.4:** (Phase 2) Méthode accepte `field_filters` pour granularité chunks ciblés.

### FR5: Endpoint API /select-context

**FR5.1:** Endpoint POST `/api/v1/context/select-context` accepte `SelectContextRequest` (`user_instructions`, `hints`, `hints_mode`, `exclude`, `expansion_radius`, `max_tokens_target`, `seed`).

**FR5.2:** Endpoint exécute Phase 1 (RLM sélection automatique) → Phase 2 (`build_context_json()` inchangé).

**FR5.3:** Endpoint retourne `SelectContextResponse` (`selected_elements`, `context`, `trace`).

### FR6: Affichage Justifications UI

**FR6.1:** Justifications affichées dans UI contexte (format compact par défaut).

**FR6.2:** Justifications cliquables → détails on-demand (raison + preuve + trace exploratoire).

**FR6.3:** Justifications incluent icône visuelle du type de raison (`hint_explicit`, `deduction_context_cosmologique`, `mentioned_explicitly`, etc.).

### FR7: Mode Override

**FR7.1:** Utilisateur peut forcer inclusion élément même si non sélectionné par RLM (override).

**FR7.2:** Utilisateur peut verrouiller élément (lock) → toujours inclus dans sélections futures.

**FR7.3:** Override/lock préservés même si toggle désactivé puis réactivé.

### FR8: Fallback Gracieux

**FR8.1:** Si RLM échoue (budget dépassé, erreur LLM, limite tool calls), système retourne hints uniquement (pas d'erreur).

**FR8.2:** Utilisateur informé via message non-bloquant ("Sélection automatique indisponible, utilisation hints uniquement").

---

## Non-Functional Requirements

### NFR1: Performance

**NFR1.1:** Sélection automatique ajoute délai <5 secondes (90e percentile) avant génération.

**NFR1.2:** Exploration outillée utilise modèle GPT-5-mini (coût réduit, qualité suffisante pour sélection).

**NFR1.3:** Budget exploration séparé (100k tokens max, modèle mini, coût négligeable).

### NFR2: Usability

**NFR2.1:** Toggle "Auto Selection" accessible (position visible, label clair).

**NFR2.2:** Justifications compréhensibles (langage utilisateur, pas technique).

**NFR2.3:** Mode override intuitif (ajout élément facile, pas de friction).

### NFR3: Reliability

**NFR3.1:** Fallback gracieux si RLM échoue (hints uniquement, pas d'erreur).

**NFR3.2:** Service optionnel (toggle désactivé par défaut) ne casse pas sélection manuelle existante.

**NFR3.3:** Limites RLM respectées (`MAX_TOOL_CALLS`, `MAX_EXPLORATION_TOKENS`) → pas de boucles infinies.

### NFR4: Testability

**NFR4.1:** Service `RLMContextSelector` testable avec mocks LLM (pas besoin LLM réel pour tests unitaires).

**NFR4.2:** Tests intégration avec mini-GDD (fixtures synthétiques, pas besoin GDD complet).

**NFR4.3:** Tests E2E workflow complet (auto-selection → build_context → génération).

### NFR5: Reproducibility

**NFR5.1:** Seed optionnel pour reproductibilité (même sélection pour mêmes inputs).

**NFR5.2:** Trace exploratoire incluse dans réponse (traçabilité décisions RLM).

**NFR5.3:** (Phase 2) Cache sélections TTL 24h (hash inputs) pour reproductibilité + performance.

### NFR6: Compatibility

**NFR6.1:** Service s'intègre avec `ContextBuilder` sans casser invariants (pas de bypass `build_context_json()`).

**NFR6.2:** Service compatible `ContextFieldManager`, `ContextTruncator`, `ContextSerializer` existants.

**NFR6.3:** Service optionnel (toggle on/off) → fallback sélection manuelle si désactivé.

---

## Domain Requirements

**Aucun** (outil développeur, pas de domaine spécifique requis).

---

## Innovation Analysis

**Paradigme RLM (Recursive Language Models):**

- Innovation: Navigation programmatique du GDD, lecture récursive, mémoire de travail compacte, agrégation progressive.
- Différenciateur vs RAG classique: Granularité fine (sous-sections → sous-parties), pas juste sélection de fiches.
- Référence académique: arXiv:2512.24601 (RLM), Hong et al. 2025 (Context Rot).

**Avantage compétitif:**

- Sélection contextuelle intelligente (réduction tokens sans perte pertinence) → meilleure qualité dialogues générés (moins context rot).

---

## Project-Type Requirements

**Developer Tool / Web App:**

- Service optionnel (toggle on/off) → pas de breaking changes.
- Fallback gracieux (sélection manuelle préservée si RLM indisponible).
- Tests robustes (mocks LLM, mini-GDD) → pas de dépendance LLM réel pour tests unitaires.

---

## Open Questions (Résolues)

1. **Modèle LLM pour sélection ?** ✅ **GPT-5-mini** recommandé (coût réduit, qualité suffisante pour sélection vs génération).
2. **Budget exploration ?** ✅ **100k tokens max** (modèle mini, coût très faible, séparé de budget génération).
3. **Cache sélections ?** ✅ **TTL 24h** recommandé (Phase 2) (hash `user_instructions + sorted(hints) + expansion_radius + max_tokens_target`).
4. **Section filters granularité ?** ✅ **Sous-section pour MVP** (Phase 1), **Chunks ciblés pour Phase 2** (field_filters avec get_relation_chunks).
5. **Intégration embeddings ?** ✅ **BM25 suffit pour MVP** (vector search = V2.0 si recall insuffisant).
6. **Position toggle UI ?** ✅ **À gauche du bouton "Générer"** (panneau de droite).

---

## References

- **ADR-005:** RLM Context Selector (Autonomous Context Selection) - Architecture Decision Record
- **Recursive Language Models (RLM)** - arXiv:2512.24601 - Alex L. Zhang, Tim Kraska, Omar Khattab
- **Context Rot** - Hong et al., 2025

---

## Epic Readiness

**Prêt pour génération Epic:** ✅

**FRs extraits:** 8 FRs (FR1-FR8) avec sous-requirements détaillés.

**NFRs extraits:** 6 NFRs (NFR1-NFR6) avec sous-requirements détaillés.

**User Journeys:** 3 journeys documentés (Happy Path, Control Path, Fallback Path).

**Success Criteria:** Métriques Phase 1 définies (taux activation toggle >40%, réduction tokens -25% minimum, pas de dégradation qualité).

**Dependencies:** Aucune (service optionnel, peut être développé indépendamment).