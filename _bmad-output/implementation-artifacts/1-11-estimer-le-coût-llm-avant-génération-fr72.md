# Story 1.11: Estimer le coût LLM avant génération (FR72)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur générant des dialogues**,
I want **voir une estimation du coût LLM avant de lancer la génération**,
so that **je peux gérer mon budget et décider si je veux procéder avec la génération**.

## Acceptance Criteria

1. **Given** j'ai configuré un contexte GDD et des instructions
   **When** je clique sur "Estimer le coût" (bouton avant "Générer")
   **Then** une estimation s'affiche avec : coût estimé (€), tokens estimés (prompt + completion), provider sélectionné
   **And** l'estimation se calcule en <1 seconde (pas de latence perceptible)

2. **Given** je modifie le contexte GDD (ajout personnage)
   **When** le contexte change
   **Then** l'estimation est recalculée automatiquement
   **And** le nouveau coût estimé s'affiche (mise à jour en temps réel)

3. **Given** je change de provider LLM (OpenAI → Mistral)
   **When** le provider change
   **Then** l'estimation est recalculée avec les prix du nouveau provider
   **And** la différence de coût est affichée (ex: "Mistral: -30% vs OpenAI")

4. **Given** je lance une génération batch (5 nœuds)
   **When** j'estime le coût
   **Then** l'estimation affiche le coût total (5 × coût single nœud)
   **And** un breakdown par nœud est disponible (déplier pour voir détails)

5. **Given** l'estimation dépasse mon budget (90% ou 100%)
   **When** j'estime le coût
   **Then** un warning s'affiche "Budget atteint à 90%" ou "Budget dépassé - génération bloquée" (voir Epic 0 Story 0.7)
   **And** le bouton "Générer" est désactivé si budget 100% dépassé

## Tasks / Subtasks

- [x] Task 1: Implémenter TokenEstimationService (AC: #1, #2)
  - [x] Étendre `services/token_estimation_service.py` (actuellement stub `class TokenEstimationService: pass`)
  - [x] Méthode `estimate_tokens(prompt_text: str, model_id: str) -> Tuple[int, int]` (prompt_tokens, completion_tokens estimés)
  - [x] Réutiliser tiktoken ou logique existante (voir `api/routers/dialogues.py` endpoint `/estimate-tokens` pour pattern)
  - [x] Intégrer avec `PromptEngine` / contexte GDD pour construire le prompt représentatif sans appeler le LLM

- [x] Task 2: Endpoint API estimate-cost (AC: #1, #3, #4)
  - [x] Créer `POST /api/v1/unity-dialogues/graph/estimate-cost` dans `api/routers/graph.py` (même namespace que `/generate-node`)
  - [x] Body: même structure que GenerateNodeRequest (dialogue_id, parent_node_id, instructions, context, provider/model_id, generate_all_choices, target_choice_indices)
  - [x] Réponse: `{ estimated_cost_eur: number, prompt_tokens: number, completion_tokens: number, model_id: string, provider: string, batch_count?: number, per_node_breakdown?: array }`
  - [x] Utiliser `TokenEstimationService` + `LLMPricingService` (existant) pour calcul coût ; pas d'appel LLM réel
  - [x] Pour batch: calculer N × estimation single (même prompt base, completion estimée par nœud)

- [x] Task 3: Cache estimation (AC: #1 — <1s)
  - [x] Cache par hash (contexte GDD + instructions + model_id) pour éviter recalculs
  - [x] Option: cache en mémoire (TTL court) ou invalidation à changement contexte

- [x] Task 4: Composant CostEstimationBadge (AC: #1, #2, #3, #5)
  - [x] Créer `frontend/src/components/graph/CostEstimationBadge.tsx`
  - [x] Affiche: coût estimé (€), tokens (prompt + completion), provider
  - [x] Bouton "Estimer le coût" déclenche appel API estimate-cost
  - [x] Affichage conditionnel warning 90% / 100% (intégration `useCostGovernance()`)
        - [x] Recalcul auto au changement contexte (debounce 400 ms via useEffect)

- [x] Task 5: Intégration AIGenerationPanel (AC: tous)
  - [x] Intégrer `CostEstimationBadge` dans `AIGenerationPanel.tsx` (au-dessus ou à côté du bouton "Générer")
  - [x] Passer en props: parentNodeId, userInstructions, selections (contexte), llmModel, generateAllChoices, targetChoiceIndex / count
  - [x] Désactiver bouton "Générer" si budget 100% dépassé (réutiliser `checkBudget()` + état dérivé de l'estimation)
        - [x] Pour batch: afficher coût total + lien "Voir détail" pour breakdown par nœud

- [x] Task 6: Intégration Epic 0.7 cost governance (AC: #5)
  - [x] Réutiliser `useCostGovernance()` et `CostGovernanceService` pour warning 90% / blocage 100%
  - [x] Après estimation, comparer estimated_cost_eur avec budget restant ; afficher message si seuil dépassé

- [x] Task 7: Tests (AC: tous)
  - [x] Unit: `TokenEstimationService.estimate_tokens()` (mock tiktoken/prompt length)
  - [x] Unit: calcul coût avec `LLMPricingService` (modèle connu)
  - [x] Integration: API `POST /api/v1/unity-dialogues/graph/estimate-cost` (body valide, réponse format)
  - [ ] E2E: ouvrir AIGenerationPanel → cliquer "Estimer le coût" → vérifier affichage estimation

## Dev Notes

### Contexte Epic et Story

**Epic 1: Amélioration et peaufinage de la génération de dialogues**
- **Objectif:** Améliorer l'expérience utilisateur et la robustesse de la génération existante.
- **Valeur:** Donner le contrôle sur le budget avant de lancer une génération coûteuse.
- **Statut:** Story 1.10 ready-for-dev ; Story 1.11 priorité B (UI manquante).

**Story 1.11: Estimer le coût LLM avant génération (FR72)**
- **Priorité:** 🟡 PRIORITÉ B
- **Note epic:** L'estimation existe dans le middleware / coûts réels, mais il manque une UI dédiée pour afficher l'estimation **avant** génération.
- **Dépendances:** Epic 0 Story 0.7 (cost governance) — DONE. Story 1.1 (génération) — DONE.

### Vérification Codebase Existant

**✅ Fichiers/Services à Étendre (pas de création ex nihilo):**

1. **`services/token_estimation_service.py`** (EXISTE — stub vide)
   - **Décision:** Implémenter la classe (actuellement `class TokenEstimationService: pass`).
   - **Justification:** Le projet a déjà `api/routers/dialogues.py` avec `/estimate-tokens` pour un autre flux (dialogues standalone). Pour le graphe, l’estimation doit s’appuyer sur le même type de logique (longueur prompt + completion typique) sans appeler le LLM.
   - **Modifications:** Méthode d’estimation des tokens (tiktoken ou formule) à partir du texte du prompt et du model_id ; retour (prompt_tokens, completion_tokens).

2. **`services/llm_pricing_service.py`** (EXISTE)
   - **Décision:** Réutiliser tel quel.
   - **Justification:** `get_model_pricing(model_name)` et `calculate_cost(model_name, prompt_tokens, completion_tokens)` déjà présents. Les prix sont en USD dans le code ; documenter ou convertir en € si l’UI affiche en € (voir config `llm_pricing.json`).

3. **`api/routers/graph.py`** (EXISTE)
   - **Décision:** Ajouter endpoint `POST /estimate-cost` dans le même router (prefix `/api/v1/unity-dialogues/graph`).
   - **Justification:** Cohérent avec `/generate-node`, même contexte (parent_node_id, dialogue_id, instructions, provider).
   - **Modifications:** Nouveau schema `EstimateCostRequest` / `EstimateCostResponse` dans `api/schemas/graph.py` ; handler qui construit un prompt représentatif (sans appeler LLM), appelle `TokenEstimationService` + `LLMPricingService`, retourne coût + tokens.

4. **`frontend/src/components/graph/AIGenerationPanel.tsx`** (EXISTE)
   - **Décision:** Intégrer le composant d’estimation (CostEstimationBadge) et désactiver "Générer" si budget 100% dépassé.
   - **Justification:** C’est le panneau de génération depuis le graphe (pas `GenerationPanel.tsx` qui est standalone). Déjà utilise `useCostGovernance()` pour `checkBudget()` avant génération.
   - **Modifications:** Rendre `<CostEstimationBadge ... />` avec les props nécessaires ; optionnel : recalcul auto (debounce) quand contexte / instructions / modèle changent.

5. **`frontend/src/hooks/useCostGovernance.ts`** (EXISTE)
   - **Décision:** Réutiliser pour warning 90% et blocage 100%.
   - **Justification:** Déjà utilisé dans AIGenerationPanel pour la modale budget dépassé.

**❌ Fichiers/Composants à Créer:**

1. **`frontend/src/components/graph/CostEstimationBadge.tsx`** (NOUVEAU)
   - Affiche estimation (€, tokens, provider) + bouton "Estimer le coût".
   - Gère états: idle, loading, success, error.
   - Affiche warning 90% / 100% (texte ou style) en s’appuyant sur les infos de coût + budget.

2. **`api/schemas/graph.py`** (MODIFIER)
   - Ajouter `EstimateCostRequest` (aligné sur les champs utiles de `GenerateNodeRequest`).
   - Ajouter `EstimateCostResponse` (estimated_cost_eur, prompt_tokens, completion_tokens, model_id, provider, batch_count?, per_node_breakdown?).

**Référence endpoint existant (tokens sans coût):**
- `POST /api/v1/dialogues/estimate-tokens` dans `api/routers/dialogues.py` — construit un prompt et retourne token count. Ne pas confondre avec le namespace graphe : le nouvel endpoint est `/api/v1/unity-dialogues/graph/estimate-cost`.

### Architecture et Patterns

**Backend:**
- Pas d’appel LLM dans estimate-cost : construire un prompt "représentatif" (même logique que pour generate-node mais sans envoyer au LLM), puis estimer les tokens (TokenEstimationService) et le coût (LLMPricingService).
- Injection: `TokenEstimationService` et `LLMPricingService` via `api/dependencies.py` si pas déjà exposés pour le router graph.
- Prix: `config/llm_pricing.json` ; vérifier si les montants sont en USD ou EUR et documenter dans la story ou le schéma de réponse.

**Frontend:**
- Client API: ajouter une fonction dans `frontend/src/api/` (ex. `graph.ts` ou `unityDialogues.ts`) pour `POST .../graph/estimate-cost`.
- Éviter de dupliquer la logique de construction de la requête (parent, instructions, contexte) entre "Estimer" et "Générer" ; partager au maximum (même payload que generate-node pour les champs communs).

**Risque bug nœuds invisibles (1.17):** Aucun — cette US ne modifie pas les nœuds ni le canvas, uniquement l’UI du panneau de génération.

### Project Structure Notes

- **Backend:** `api/routers/graph.py`, `api/schemas/graph.py`, `services/token_estimation_service.py`, `services/llm_pricing_service.py` (réutilisé).
- **Frontend:** `frontend/src/components/graph/AIGenerationPanel.tsx`, `frontend/src/components/graph/CostEstimationBadge.tsx` (nouveau), `frontend/src/hooks/useCostGovernance.ts` (réutilisé).
- **Alignement:** Namespace graph `/api/v1/unity-dialogues/graph` respecté ; pas de nouveau router.

### Testing Standards

- **Unit (backend):** TokenEstimationService (estimation tokens), calcul coût avec LLMPricingService.
- **Integration:** `POST /api/v1/unity-dialogues/graph/estimate-cost` — body valide, réponse conforme au schéma, pas d’appel LLM réel.
- **E2E:** Ouvrir panneau génération depuis un nœud → "Estimer le coût" → vérifier affichage (coût, tokens, provider) et comportement si budget dépassé.

### References

- **FR72:** Estimer le coût LLM avant génération
- **Epic 0 Story 0.7:** Cost governance (budget, warning, blocage)
- **Story 1.1:** Génération single (contexte parent, endpoint generate-node)
- **Source:** `_bmad-output/planning-artifacts/epics/epic-01.md#story-111`
- **project-context:** `_bmad-output/project-context.md` (règles stack, tests, pas de secrets en dur)

## Dev Agent Record

### Agent Model Used

Amelia (Dev Agent) — workflow dev-story.

### Debug Log References

Aucune erreur bloquante.

### Completion Notes List

- TokenEstimationService: implémenté avec ContextTruncator (tiktoken ou fallback //4), `estimate_tokens(prompt_text, model_id)` → (prompt_tokens, completion_tokens). DEFAULT_COMPLETION_TOKENS_PER_NODE = 350. model_id-aware : char/4 pour Mistral (tiktoken incompatible).
- Endpoint `POST /api/v1/unity-dialogues/graph/estimate-cost`: schémas EstimateCostRequest, EstimateCostResponse, EstimateCostPerNodeBreakdown ; prompt représentatif = contexte + parent line + instructions ; batch_count et per_node_breakdown pour generate_all_choices.
- Cache: TTLCache 60s par hash(representative_prompt|model_id|batch_count). Réinitialisé entre chaque test (fixture autouse).
- Conversion USD→EUR: `_USD_TO_EUR_RATE = 0.92` appliqué sur tous les montants retournés (H2).
- Comparaison inter-providers (AC #3): champs `alternative_provider`, `alternative_model_id`, `alternative_cost_eur`, `cost_difference_pct` dans EstimateCostResponse. Modèles Mistral ajoutés à llm_pricing.json.
- CostEstimationBadge: bouton manuel + recalcul auto debounce 400ms (AC #2), affichage comparaison provider (AC #3), breakdown expandable batch (AC #4), warning 90% / 100% via getBudget() (AC #5).
- AIGenerationPanel: estimateRequest wrappé dans useMemo pour référence stable (évite boucles useEffect).
- Tests frontend: CostEstimationBadge.test.tsx couvre idle, loading, success, error, warning 90%/100%, debounce annulation, breakdown, comparaison provider.

### File List

**Backend (nouveau/modifié):**
- `services/token_estimation_service.py` (implémenté)
- `api/routers/graph.py` (endpoint `POST /estimate-cost` + cache TTL)
- `api/schemas/graph.py` (EstimateCostRequest, EstimateCostResponse, EstimateCostPerNodeBreakdown)
- `api/dependencies.py` (get_token_estimation_service, get_llm_pricing_service)

**Frontend (nouveau/modifié):**
- `frontend/src/components/graph/CostEstimationBadge.tsx` (nouveau)
- `frontend/src/components/graph/AIGenerationPanel.tsx` (intégration badge + budgetExceededByEstimate)
- `frontend/src/api/graph.ts` (estimateCost)
- `frontend/src/types/graph.ts` (EstimateCostRequest, EstimateCostResponse, EstimateCostPerNodeBreakdown)

**Tests:**
- `tests/services/test_token_estimation_service.py` (nouveau)
- `tests/api/test_graph_estimate_cost.py` (nouveau — +4 tests : modèle inconnu, comparaison provider, conversion EUR, clear cache)
- `frontend/src/components/graph/CostEstimationBadge.test.tsx` (nouveau — 9 tests unitaires)
- E2E estimation coût : non ajouté (optionnel)
