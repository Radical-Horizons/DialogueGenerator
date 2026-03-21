# V1.0 Architectural Decisions (ADRs)

### ADR-001: Progress Feedback Modal (Streaming LLM)

**Context:**  
UI "gel" pendant génération LLM (30s+), pas de feedback utilisateur → UX critique bloquante

**Decision:**  
Modal centrée avec streaming SSE (Server-Sent Events)

**Technical Design:**

**Frontend:**
- Nouveau composant `GenerationProgressModal.tsx`
- State : Zustand slice `useGenerationStore` (état streaming)
- API : EventSource SSE vers `/api/v1/generate/stream`
- UI : 2 zones (sortie LLM stream + étapes/logs), 2 actions (Interrompre/Réduire)

**Backend:**
- Nouveau router `/api/v1/generate/stream` (SSE endpoint)
- Pattern : `async def` generator avec `yield` (chunks SSE)
- LLM : `stream=True` sur `responses.create()` (GPT-5.2)
- Format : `data: {"type": "chunk", "content": "..."}\n\n`

**Constraints:**
- **DOIT** utiliser Zustand (pattern existant state management)
- **DOIT** respecter format SSE (`data: ...\n\n`)
- **NE DOIT PAS** modifier panneau Détails (trop étroit, modal nécessaire)
- **DOIT** gérer interruption propre (AbortController frontend + cleanup backend)

**Rationale:**
- SSE > WebSocket (unidirectionnel, plus simple, fallback HTTP)
- Modal > panneau intégré (340px insuffisant, focus utilisateur)
- Streaming natif GPT-5.2 Responses API (pas de polling)

**Risks:**
- SSE timeout long génération (mitigation : keep-alive pings)
- Gestion erreurs stream interrompu (mitigation : error events SSE)

**Tests Required:**
- Unit : `useGenerationStore` state transitions
- Integration : `/api/v1/generate/stream` SSE format
- E2E : Modal affichage + interruption mid-stream

**Acceptance Criteria:**
- [ ] Modal visible dès clic "Générer"
- [ ] Sortie LLM streamée en temps réel (<500ms latency)
- [ ] Bouton "Interrompre" arrête génération proprement
- [ ] Fermeture modal restaure UI précédente

---

### ADR-002: Presets système (Configuration sauvegarde/chargement)

**Context:**  
Cold start friction : 10+ clics pour premier dialogue (sélection personnages, lieux, instructions)

**Decision:**  
Système presets avec sauvegarde/chargement configurations complètes

**Technical Design:**

**Data Model:**
```typescript
interface Preset {
  id: string;
  name: string;
  icon: string; // emoji
  metadata: {
    created: Date;
    modified: Date;
  };
  configuration: {
    characters: string[];      // IDs sélectionnés
    locations: string[];
    region: string;
    subLocation?: string;
    sceneType: string;         // "Première rencontre", etc.
    instructions: string;      // Brief scène
  };
}
```

**Frontend:**
- Nouveau composant `PresetBar.tsx` (barre compacte au-dessus "Scène Principale")
- 2 boutons : "📋 Charger preset ▼" (dropdown) + "💾 Sauvegarder preset"
- Modal sauvegarde : nom, icône emoji, aperçu lecture seule
- State : Zustand slice `usePresetStore`

**Backend:**
- Nouveau router `/api/v1/presets` (CRUD)
- Storage : Fichiers JSON locaux `data/presets/{preset_id}.json`
- Service : `PresetService` (validation, persistence)

**Constraints:**
- **DOIT** capturer configuration complète (personnages + lieux + instructions)
- **DOIT** valider IDs références (personnages/lieux existent dans GDD)
- **NE DOIT PAS** stocker contenu GDD (seulement IDs)
- **DOIT** gérer preset obsolète (références GDD supprimées)

**Rationale:**
- Cold start → 1 clic (objectif efficiency V1.0)
- Stockage local (pas besoin DB, Git-friendly)
- Validation lazy (au chargement, pas à la sauvegarde)

**Risks:**
- GDD updates rendent presets obsolètes (mitigation : validation chargement + warning)
- Synchronisation multi-utilisateurs (hors scope MVP, V2.0 RBAC)

**Tests Required:**
- Unit : `PresetService` validation + persistence
- Integration : API `/api/v1/presets` CRUD
- E2E : Workflow complet sauvegarde → chargement → génération

**Acceptance Criteria:**
- [ ] Bouton "Sauvegarder preset" capture configuration actuelle
- [ ] Modal sauvegarde : nom + icône + aperçu
- [ ] Dropdown "Charger preset" liste presets disponibles
- [ ] Chargement preset restaure configuration complète
- [ ] Warning si références GDD invalides

---

### ADR-003: Graph Editor Fixes (DisplayName vs stableID)

**Context:**  
Bug critique : DisplayName utilisé comme ID au lieu de stableID → corruption graphe

**Decision:**  
Correction immédiate + tests régression

**Technical Design:**

**Root Cause:**
- React Flow utilise `node.id` comme identifiant unique
- Code actuel : `node.id = displayName` (peut changer, collisions)
- Correct : `node.id = stableID` (UUID immuable)

**Fix:**
```typescript
// Avant (BUGGY)
const node = {
  id: dialogue.displayName,  // ❌ Mutable, collisions
  data: { ... }
};

// Après (CORRECT)
const node = {
  id: dialogue.stableID,      // ✅ UUID immuable
  data: { 
    displayName: dialogue.displayName,  // Affiché dans UI
    ...
  }
};
```

**Impact Analysis:**
- Fichiers : `frontend/src/components/graph/GraphEditor.tsx`
- Composants : Node rendering, edge connections
- State : Zustand store `useGraphStore`

**Constraints:**
- **DOIT** migrer données existantes (stableID manquants → génération UUID)
- **NE DOIT PAS** casser graphes existants (backward compatibility)
- **DOIT** ajouter tests régression (collision displayName)

**Rationale:**
- Stabilité identifiants = graphe robuste
- Séparation ID technique (UUID) vs display (nom éditable)

**Risks:**
- Migration données existantes (mitigation : script migration + backup)
- Edge cases (nœuds sans stableID) (mitigation : génération UUID automatique)

**Tests Required:**
- Unit : `generateStableID()` unicité
- Integration : Graph serialization/deserialization
- E2E : Renommer dialogue ne casse pas connexions

**Acceptance Criteria:**
- [ ] `node.id` utilise `stableID` (UUID)
- [ ] Renommer dialogue preserve connexions
- [ ] Aucun graphe existant corrompu après migration
- [ ] Tests régression collisions displayName

---

### ADR-004: Multi-Provider LLM Support (Mistral Small Creative)

**Context:**  
Actuellement, DialogueGenerator utilise uniquement OpenAI GPT-5.2. Besoin d'ajouter Mistral Small Creative comme alternative sélectionnable pour offrir plus de flexibilité et réduire la dépendance à un seul provider.

**Decision:**  
Implémenter abstraction multi-provider avec support OpenAI (GPT-5.2) + Mistral (Small Creative) en V1.0. Utilisateur peut sélectionner le modèle via UI.

**Technical Design:**

**Backend Abstraction:**
- Interface `IGenerator` existante étendue pour supporter multiple providers
- Nouveau service `services/llm/mistral_client.py` implémentant `IGenerator`
- Factory pattern : `LLMFactory.create(provider: str, model: str)` retourne client approprié
- Configuration : `config/llm_config.json` définit providers disponibles + modèles

**Provider-Specific Implementations:**
- **OpenAI** : `OpenAIClient` (existant, Responses API GPT-5.2)
- **Mistral** : `MistralClient` (nouveau, Chat Completions API, Small Creative)
  - SDK : `mistralai` Python package
  - Streaming : Support natif via `stream=True`
  - Structured outputs : Via `response_format` (JSON Schema)

**Frontend Model Selection:**
- Nouveau composant `components/generation/ModelSelector.tsx` (dropdown)
- State : Zustand `generationStore.selectedModel` (provider + model)
- Options affichées : "OpenAI GPT-5.2", "Mistral Small Creative"
- Persistence : Préférence sauvegardée dans localStorage

**API Changes:**
- Endpoint `/api/v1/generate/stream` accepte paramètre `model` (optionnel, défaut: OpenAI)
- Format : `?provider=openai&model=gpt-5.2` ou `?provider=mistral&model=small-creative`
- Backward compatible : Si `model` absent, utilise OpenAI (comportement actuel)

**Constraints:**
- **DOIT** maintenir backward compatibility (OpenAI reste défaut)
- **DOIT** utiliser abstraction `IGenerator` (pas de code provider-spécifique dans routers)
- **DOIT** supporter streaming pour tous providers (SSE format identique)
- **DOIT** gérer structured outputs pour tous providers (JSON Schema)
- **NE DOIT PAS** exposer différences providers à l'utilisateur (abstraction complète)

**Rationale:**
- **Flexibilité** : Utilisateur choisit modèle selon besoins (qualité vs coût vs vitesse)
- **Réduction dépendance** : Pas de vendor lock-in, fallback si OpenAI down
- **Cost optimization** : Mistral Small Creative potentiellement moins cher
- **Abstraction propre** : Pattern IGenerator déjà en place, extension naturelle

**Risks:**
- **Différences API** : OpenAI Responses API vs Mistral Chat Completions (mitigation : abstraction IGenerator)
- **Structured outputs** : Formats différents (mitigation : normalisation JSON Schema)
- **Streaming** : Implémentations différentes (mitigation : wrapper uniforme SSE)
- **Cost tracking** : Prix différents par provider (mitigation : cost service multi-provider)

**Tests Required:**
- Unit : `MistralClient` implémente `IGenerator` correctement
- Unit : `LLMFactory` retourne bon client selon provider
- Integration : `/api/v1/generate/stream?provider=mistral` fonctionne
- Integration : Streaming Mistral produit format SSE identique
- E2E : Sélection modèle dans UI → génération avec bon provider

**Acceptance Criteria:**
- [ ] Dropdown "Modèle" dans UI génération
- [ ] Sélection Mistral Small Creative → génération fonctionne
- [ ] Streaming SSE identique pour OpenAI et Mistral
- [ ] Structured outputs fonctionnent pour les deux providers
- [ ] Cost tracking différencié par provider
- [ ] Préférence modèle persistée (localStorage)

---

### ADR-005: RLM Context Selector (Autonomous Context Selection)

**Context:**  
Sélection manuelle de contexte GDD est **cognitivement coûteuse et error-prone** :
- Scène "minimale" (2 personnages + 1 lieu) fait déjà **15-20k tokens** en mode full
- Utilisateur doit décider manuellement quelles fiches inclure et en quel mode (full/excerpt)
- Risque d'oublier éléments pertinents (liens cosmologiques, factions, objets rituels)
- Granularité trop grossière : fiche "full" = 6-8k tokens, même si seule une section est pertinente

**Problème fondamental :** Avec des contextes de 20k+ tokens, même avec fenêtres 128k, les effets de dégradation OOLONG apparaissent (attention diluée, dépendances longues brouillées, rappel précis dégradé). Le vrai problème n'est pas "comment choisir quelles fiches charger" mais **"comment raisonner sur un univers dont la scène active pèse déjà 20k tokens"**.

**Decision:**  
Implémenter une **couche optionnelle (on/off) de LLM "sélecteur autonome de contexte"** inspirée du paradigme **Recursive Language Models (RLM)** (arXiv:2512.24601) :
- Le système devient l'agent de sélection (exploration programmatique + déductions)
- L'utilisateur devient superviseur (valide/ajuste, avec mode override)
- Réduction contextuelle intelligente : 20k+ tokens → 12-15k tokens sans perte de pertinence

**Technical Design:**

**Phase 1. Context Selection (RLM Agent)**

**Service Backend:**
```python
# services/rlm_context_selector.py
class RLMContextSelector:
    async def select_context(
        self,
        user_instructions: str,  # Instructions de Scène
        hints: Optional[Dict[str, List[str]]] = None,  # Optionnel : verrouiller éléments
        hints_mode: Optional[Dict[str, str]] = None,  # {"character_A": "full"}
        exclude: Optional[List[str]] = None,  # IDs à exclure
        expansion_radius: int = 1,  # 0=aucune, 1=graphe direct, 2=indirect
        max_tokens_target: int = 15000,  # Budget global
        seed: Optional[int] = None,  # Reproductibilité
    ) -> ContextSelectionResult:
        # 1. Parse user_instructions pour extraire entités explicites
        # 2. Exploration outillée (search_bm25, get_related, get_snippet, etc.)
        # 3. Déductions (liens cosmologiques, factions, objets rituels, etc.)
        # 4. Décision full/excerpt + section_filters pour chaque fiche
        # 5. Budget check (si dépassement, passer plus en excerpt ou exclure)
        # 6. Retourner selected_elements + justifications + trace
```

**Outils GDD (exposés au LLM via function calling):**
```python
# Outils de navigation JSON
- get_node(id) -> json
- get_fields(id, fields[]) -> json
- list_ids(type=None, where_field_exists=None, limit=...)
- schema_overview() -> stats + exemples

# Outils de recherche
- search_bm25(query, top_k=20, filter_type=None) -> [{id, score, snippet}]
- search_regex(pattern, field=None, top_k=20) -> matches
- search_by_key_value(key, value, exact=True)

# Outils d'extraction contrôlée
- get_snippet(id, field, max_chars=2000, around=None)
- get_related(id, relation_keys=[...], depth=1)

# Outils d'agrégation
- count(filter...)
- group_by(field, filter...)
- build_table(ids, columns) -> rows
- diff(id_a, id_b, fields)
```

**Output Phase 1:**
```python
{
  "selected_elements": {
    "characters": {
      "Uresaïr": {
        "mode": "full",
        "section_filters": {
          "include": ["Psychologie", "Arc.Actuel", "Relations.Akthar"],
          "exclude": ["Rôle cosmologique complet", "Histoire complète"],
          "reason": "Focus sur dynamique relationnelle et état émotionnel"
        },
        "justification": {
          "reason": "hint_explicit",
          "proof": None
        }
      },
      "Akthar": {
        "mode": "full",
        "section_filters": {
          "include": ["Psychologie", "Relations.Uresaïr", "Croyances"],
          "exclude": ["Rôle cosmologique complet"]
        },
        "justification": {
          "reason": "hint_explicit",
          "proof": None
        }
      }
    },
    "locations": {
      "Nef Centrale": {
        "mode": "full",
        "section_filters": {...},
        "justification": {
          "reason": "mentioned_explicitly",
          "proof": "Scène se déroule dans la Nef Centrale"
        }
      },
      "Léviathan Pétrifié": {
        "mode": "excerpt",
        "justification": {
          "reason": "deduction_context_cosmologique",
          "proof": "Léviathan mentionné comme cadre cosmologique dans Uresaïr.sections.Rôle",
          "search_trace": ["get_related('Uresaïr')", "search_by_key_value('type', 'lieu_cosmologique')"]
        }
      }
    }
  },
  "trace": {
    "tools_called": ["search_bm25", "get_related", "get_snippet", ...],
    "decisions": [...],
    "total_tokens_estimated": 12000  # Optimisé vs 20k+ en manuel
  }
}
```

**Phase 2. Context Build (inchangé mais enrichi)**

**Integration avec ContextFieldManager:**
```python
# services/context_field_manager.py
def filter_fields_by_section_filters(
    self,
    element_type: str,
    fields_to_include: List[str],
    section_filters: Optional[Dict[str, List[str]]] = None  # <-- NOUVEAU
) -> List[str]:
    # Combine règles statiques (context_config.json) + règles dynamiques (section_filters)
    # Sans bypasser le DSL de champs existant
```

**Backend API:**
```python
# api/routers/context.py
@router.post("/select-context", response_model=SelectContextResponse)
async def select_context_auto(
    request_data: SelectContextRequest,
    rlm_selector: Annotated[RLMContextSelector, Depends(get_rlm_context_selector)],
) -> SelectContextResponse:
    # Phase 1 : RLM sélection automatique
    selection_result = await rlm_selector.select_context(
        user_instructions=request_data.user_instructions,
        hints=request_data.hints,
        ...
    )
    # Phase 2 : build_context_json (inchangé)
    structured_context = context_builder.build_context_json(
        selected_elements=selection_result.selected_elements,
        scene_instruction=request_data.user_instructions,
        ...
    )
    return SelectContextResponse(
        selected_elements=selection_result.selected_elements,
        context=structured_context,
        trace=selection_result.trace
    )
```

**Frontend UI:**
- Toggle "Auto Selection" (on/off) dans panneau contexte
- Affichage "Contexte auto-sélectionné" avec justifications cliquables
- Mode "Override" : utilisateur peut forcer/ajouter des éléments même en auto
- Mode "Lock" : utilisateur peut verrouiller certains éléments (toujours inclus)

**Constraints:**
- **DOIT** être optionnel (on/off), avec fallback vers sélection manuelle
- **DOIT** rester compatible avec `ContextFieldManager`, `ContextTruncator`, `ContextSerializer`
- **NE DOIT PAS** bypasser `build_context_json()` (Option A, pas Option B)
- **DOIT** produire `selected_elements` avec `section_filters` enrichis
- **DOIT** inclure `justification` et `trace` pour traçabilité
- **DOIT** respecter hints explicites (toujours inclus, mode full par défaut)
- **DOIT** être reproductible (seed optionnel) ou au minimum traçable
- **DOIT** gérer fallback gracieux (si RLM échoue, retourner hints uniquement, pas d'erreur)

**Rationale:**
- **Réduction friction** : Plus besoin de sélection manuelle laborieuse (10+ clics → 1 clic "Auto")
- **Amélioration recall** : RLM trouve éléments pertinents que l'utilisateur aurait oubliés
- **Granularité adaptative** : Sélection fine de sous-sections (ex: Uresaïr 6k → 2-3k tokens) sans perte pertinence
- **Paradigme RLM** : Navigation programmatique du GDD, lecture récursive, mémoire de travail compacte, agrégation progressive
- **Compatible existant** : S'intègre proprement avec `ContextBuilder` sans casser invariants

**Risks:**
- **Non-déterminisme** : Agent peut choisir trajectoire différente (mitigation : seed + cache + traçabilité)
- **Sélection inattendue** : RLM peut inclure éléments non souhaités (mitigation : override + lock + exclusions)
- **Coût LLM** : Exploration outillée = plusieurs appels LLM (mitigation : budget séparé + cache + modèle "cheap" pour sélection)
- **Latence** : Sélection automatique ajoute délai avant génération (mitigation : cache + streaming progress)
- **Tests** : Agent loop difficile à tester sans fixtures synthétiques (mitigation : tests avec mini-GDD + mocks LLM)

**Tests Required:**
- Unit : `RLMContextSelector.select_context()` avec mocks LLM
- Unit : `ContextFieldManager.filter_fields_by_section_filters()` combine règles
- Integration : `/api/v1/context/select-context` avec vrai LLM (tests coûteux, limiter)
- Integration : Fallback gracieux si RLM échoue
- E2E : Workflow complet auto-selection → build_context → génération

**Acceptance Criteria:**
- [ ] Toggle "Auto Selection" dans UI contexte
- [ ] RLM produit `selected_elements` avec `section_filters`
- [ ] Phase 2 `build_context_json()` utilise `section_filters` correctement
- [ ] Réduction tokens : 20k+ → 12-15k sans perte pertinence
- [ ] Justifications affichées (utilisateur peut comprendre pourquoi élément inclus)
- [ ] Mode override fonctionne (ajout/force éléments même en auto)
- [ ] Fallback gracieux si RLM échoue (pas d'erreur, retourne hints uniquement)
- [ ] Traçabilité complète (trace contient trajectoire agent)

**Open Questions:**
- Modèle LLM pour sélection ? (GPT-5-mini pour coût vs GPT-5.2 pour qualité)
- Budget exploration ? (5-10k tokens max pour phase 1 vs budget global génération)
- Cache sélections ? (même `user_instructions` + `hints` = résultat identique)
- Section filters granularité ? (niveau champ vs niveau sous-section vs niveau paragraphe)

---

### ADR-006: Autosave immédiat, zéro perte, seq + atomique (Graph Editor)

**Context:**  
Auto-save actuel : debounce 1,2 s, pas de journal local, écriture fichier directe. Risques : perte à la fermeture d’onglet/crash, fichier JSON tronqué si crash pendant write, requêtes réordonnées peuvent écraser un état plus récent. Contrainte UX : délai max 0,1 s acceptable, 1,2 s non.

**Decision:**  
Store = document (une seule source de vérité en mémoire). Pas de mode draft/save ; tout est “enregistré” localement et synchronisé. Résilience : journal local IndexedDB + seq monotone côté client/serveur + écriture atomique côté serveur (tmp → fsync → rename). Micro-batch envoi 100 ms max.

**Technical Design:**

**Frontend:**
- À chaque modification : mutation dans le store **en premier** (aucune exception), puis append dans journal IndexedDB (par documentId), puis envoi vers serveur en micro-batch 100 ms (ou immédiat selon option).
- **Pas de brouillon dans les formulaires** : les champs éditables (panneau Détails : speaker, line, choix, etc.) doivent pousser vers le store à la saisie (debounce court ≤ 100 ms ou immédiat). Un flush uniquement au changement de nœud ou au blur est **non conforme** — fermeture d’onglet ou crash sans quitter le nœud entraînerait une perte.
- Journal IndexedDB : scope par document (documentId = filename ou id stable). Contenu : dernier snapshot après ack + queue des mutations non ackées (ou dernier état complet en attente). Au chargement : dernier snapshot + pending, puis sync avec serveur (seq).
- Chaque envoi porte un **seq** monotone (client-assigné, incrémenté à chaque envoi).
- UI statut : “Synced (seq …)” / “Offline, N changes queued” / “Error” ; pas de bouton “Sauvegarder” ; optionnel “Synchroniser maintenant”.

**Backend:**
- Requête contient **seq** (optionnel en v1 pour rétrocompat : si absent, appliquer sans garde-fou).
- Serveur conserve **last_seq** par document (persisté en fichier sidecar ou en base pour survivre au redémarrage).
- Règles : **seq ≤ last_seq** → ignorer (réponse 200 + ack(last_seq)) ; **seq > last_seq** → appliquer payload, persister, **last_seq = seq**, répondre **ack(seq)**.
- Persistance fichier : écrire dans **file.tmp**, fsync, rename atomique **file.tmp** → **file.json**. Optionnel : **file.prev.json** (N-1) pour recovery.

**Constraints:**
- **DOIT** garantir délai perçu ≤ 0,1 s (micro-batch 100 ms max).
- **DOIT** éviter perte à fermeture onglet/crash/navigation (journal IndexedDB).
- **DOIT** éviter fichier tronqué (écriture atomique serveur).
- **DOIT** éviter qu’un envoi ancien écrase un récent (seq / last_seq).
- **NE DOIT PAS** conserver de brouillon dans les formulaires : toute modification éditable doit être poussée vers le store (debounce ≤ 100 ms ou immédiat), puis journal + sync. **Aucune exception** — flush uniquement au changement de nœud ou au blur = non conforme.
- **NE DOIT PAS** introduire co-édition (multi-onglets non garanti ; documenter).

**Rationale:**
- Seq + last_seq = garde-fou minimal sans OT/CRDT.
- IndexedDB = résilience locale sans dépendre au blur.
- Atomic write = pratique standard (tmp + rename) sur Windows/Linux.

**Risks:**
- Persistance last_seq côté serveur (mitigation : sidecar ou fichier par document).
- Identité document stable (documentId) partagée front/back (mitigation : filename ou id dérivé).

**Tests Required:**
- Unit : journal IndexedDB (écriture/replay), seq incrément, micro-batch 100 ms.
- Integration : API save-and-write avec seq / last_seq, écriture atomique (tmp → rename).
- E2E : modification → fermeture onglet → réouverture → état restauré ; statut Synced/Offline/Error.

**Acceptance Criteria:**
- [ ] Store = document ; pas de bouton “Sauvegarder”.
- [ ] Aucun brouillon dans les formulaires : speaker, line, choix, etc. poussés vers le store (debounce ≤ 100 ms ou immédiat) ; pas de flush uniquement au changement de nœud.
- [ ] Délai regroupement ≤ 100 ms (pas 1,2 s).
- [ ] Journal IndexedDB par document ; rechargement = dernier snapshot + pending puis sync.
- [ ] Serveur : seq ≤ last_seq → ignore ; seq > last_seq → applique, écriture atomique, ack(seq).
- [ ] UI : “Synced (seq …)” / “Offline, N changes queued” / “Error”.

**Référence spécification détaillée :** spécification consolidée “autosave immédiat, zéro perte, seq + atomique” (principes, protocole serveur, journal local, micro-batching, UI statut).

---

### ADR-007: React Flow en mode controlled (source unique nodes/edges)

**Context:**  
Le canvas graphe utilise aujourd'hui les hooks React Flow `useNodesState` / `useEdgesState` : l'état affiché est géré en interne par React Flow, le store Zustand sert à la persistance et à la logique métier. Cette double source de vérité (état RF + store) provoque des désynchronisations (étiquettes qui scintillent, liens qui disparaissent au clic), des correctifs fragiles (comparaisons, refs de stabilisation) et empêche une cohérence fiable pour l'autosave, l'undo/redo, la synchro serveur et la collaboration future.

**Decision:**  
React Flow est utilisé en **mode controlled** : les `nodes` et `edges` passés au composant `<ReactFlow>` proviennent **uniquement** du store Zustand (graphStore). Aucun état local pour nodes/edges dans le canvas (pas de `useNodesState` / `useEdgesChange`). Les handlers `onNodesChange` et `onEdgesChange` ne font qu'appeler des actions du store. Le **viewport** (zoom, pan, position de la caméra) reste en état **local** à React Flow (non persisté, hors store document).

**Technical Design:**

**Frontend (GraphCanvas / couche graphe) :**
- **Source des props** : `nodes` et `edges` sont dérivés du store (ex. `useGraphStore()` → `storeNodes`, `storeEdges`), enrichis si besoin (validation, highlight) via `useMemo` à partir du store, puis passés tels quels à `<ReactFlow nodes={…} edges={…} />`.
- **Handlers** : `onNodesChange` et `onEdgesChange` appliquent **tous** les types de changement (position, dimension, remove, **select**, etc.) **uniquement** via des actions du store (ex. `updateNodePosition`, `deleteNode`, `setSelectedNode`, etc.). Les changements de type **`select`** dans `onNodesChange` doivent mettre à jour le store (pas seulement `onNodeClick`), afin qu'aucune sélection ne reste uniquement dans l'état interne de React Flow. Utiliser `applyNodeChanges` / `applyEdgeChanges` côté store ou dans les handlers pour produire le nouvel état, puis `setState` store — jamais de `setNodes` / `setEdges` local.
- **Sélection** : La sélection (nœud(s) sélectionné(s)) vit dans le store (ex. `selectedNodeId` / `selectedNodeIds`). Les `nodes` passés à React Flow reflètent cette sélection (ex. `node.selected = (node.id === selectedNodeId)`). Les changements de sélection dans `onNodesChange` (type `select`) mettent à jour le store.
- **Viewport** : Non stocké dans le store. React Flow gère zoom/pan en interne ; pas de persistance viewport exigée par cette ADR.
- **Compatibilité React Flow** : Respecter le pattern "controlled" documenté (React Flow : parent state + `onNodesChange` / `onEdgesChange` mettent à jour ce state). Le conteneur parent doit avoir une largeur et une hauteur définies ; la feuille de style React Flow doit être importée.

**Périmètre :**
- ADR-007 s'applique au canvas **éditeur** (GraphCanvas). Le composant **GraphView** (vue read-only, source = prop `json_content`, pas de graphStore) est hors périmètre : il peut rester en mode uncontrolled ou être migré en controlled avec état parent dérivé des props ; le choix est laissé à l'implémentation tant qu'il n'y a pas de persistance ni de double source de vérité.

**Constraints:**
- **DOIT** avoir une seule source de vérité pour les nodes et edges affichés : le store (graphStore).
- **NE DOIT PAS** utiliser `useNodesState` ni `useEdgesState` (ni équivalent état local pour nodes/edges) dans le composant qui rend `<ReactFlow>` pour l'éditeur de graphe.
- **DOIT** faire en sorte que tout changement utilisateur (drag, clic, connexion, suppression) remonte au store via `onNodesChange` / `onEdgesChange` / `onConnect`, sans mise à jour d'un état local nodes/edges.
- **DOIT** garder le viewport (zoom/pan) en état local à React Flow (pas dans le store document).
- **DOIT** refléter la sélection affichée depuis le store (pas d'état de sélection uniquement interne à React Flow pour les nœuds/edges document).

**Rationale:**
- Alignement avec ADR-006 : le store est déjà la source de vérité du document ; le canvas doit en être une vue stricte.
- Autosave, undo/redo, synchro serveur et future collaboration reposent sur un état document unique et prévisible.
- Suppression des bugs de sync (scintillement, disparition d'edges) et du code de contournement (refs, comparaisons "position seule").
- **Export PNG/SVG** : en mode controlled, l'instance React Flow reflète le store ; l'export visuel reflète donc l'état document.
- **Undo/redo (zundo)** : la restauration du store suffit ; l'affichage suit automatiquement car le canvas est piloté par le store.

**Risks:**
- Performance pendant le drag : chaque mouvement peut déclencher une mise à jour du store et un re-render. Mitigation : mises à jour store légères (ex. uniquement positions) ; debounce/throttle déjà en place pour la persistance (journal/API) ; si besoin, throttler les appels `updateNodePosition` pendant le drag (ex. `requestAnimationFrame`).

**Tests Required:**
- Régression : après clic sur un nœud, les edges restent visibles et cohérents.
- Régression : après drag d'un nœud, les positions dans le store correspondent à l'affichage.
- Unitaire / intégration : sélection mise à jour dans le store lors des événements de sélection React Flow.
- Optionnel : E2E "édition → refresh / reload → état restauré" (déjà couvert par ADR-006 ; controlled n'ajoute pas de perte).

**Acceptance Criteria:**
- [ ] Les `nodes` et `edges` passés à `<ReactFlow>` proviennent exclusivement du store (ou de dérivations du store, ex. enrichissement validation/highlight).
- [ ] Aucun `useNodesState` / `useEdgesState` dans le composant principal du canvas graphe (éditeur).
- [ ] `onNodesChange` et `onEdgesChange` ne mettent à jour que le store (via actions graphStore).
- [ ] La sélection affichée (nœud sélectionné) est lue depuis le store et les changements de sélection mettent à jour le store. Tout changement de sélection (clic, multi-select, programmatique) met à jour le store via `onNodesChange` ou handlers dédiés.
- [ ] Le viewport (zoom/pan) n'est pas persisté dans le store document.
- [ ] Aucune régression : edges visibles après clic sur un nœud ; pas de scintillement des étiquettes lors du drag (avec optimisations si besoin).

**Référence :** React Flow "controlled" pattern (état dans le parent, handlers mettent à jour cet état) ; doc projet `docs/architecture/state-management-frontend.md`, `docs/architecture/graph-conversion-architecture.md`.

---

### ADR-008: Pipeline document canonique Unity JSON (Backend propriétaire, SoT document, choiceId, layout partagé)

**Context:**  
Le pipeline actuel (Unity ⇄ Backend Python ⇄ Front React Flow) a évolué avec une SoT en mémoire = nodes/edges (store) et une conversion backend (JSON → graphe au load, graphe → JSON au save). Le stakeholder exige que le **document canonique** soit le **Unity Dialogue JSON** partout ; le backend doit en être le propriétaire ; le frontend ne doit plus envoyer nodes/edges mais le document ; les identités (choiceId) doivent être stables pour éviter les bugs de mapping et de réordonnancement. Une revue architecte consultant externe a produit une recommandation consolidée ; six décisions associées ont été validées (propriétaire document, layout partagé, schemaVersion, Unity, refus sans choiceId, cible perf).

**Decision:**  
Un seul **format de document canonique** partagé par tout le pipeline : **Unity Dialogue JSON** (schéma v1.1.0), validé/normalisé de façon cohérente, projeté en UI (React Flow) sans devenir une seconde source de vérité. Le **backend** possède le document (source canonique, persistance, revision, arbitrage des conflits). Le **frontend** est un client éditeur ; **Unity** est un consommateur/éditeur du même format. Le document inclut `schemaVersion` (ex. 1.1.0) et `choices[].choiceId` (requis, identité stable). Le **layout** (positions, zoom) est un artefact distinct, **partagé** par document, persisté côté backend (ex. sidecar), soumis aux mêmes règles de concurrence. L’API parle uniquement en « document canonique » (et layout si applicable) : pas d’échange nodes/edges ; endpoints type GET/PUT par document (path|id) avec `revision` pour contrôle de concurrence. La validation distingue « draft » (non bloquant, autosave autorisé) et « export » (bloquant). Migration : outil one-shot pour ajouter `choiceId` aux documents existants ; lecture tolérante courte ; à partir de `schemaVersion >= 1.1.0`, l’absence de `choiceId` est refusée.

**Technical Design:**

**Modèle de données :**
- Document : Unity Dialogue JSON v1.1.0 avec `schemaVersion` requis, `choices[].choiceId` requis (format libre, stable). `node.id` reste SCREAMING_SNAKE_CASE. Pseudo-nœud END documenté si référencé.
- Layout : artefact séparé (ex. `*.layout.json` ou équivalent), même règles de revision/concurrence que le document.

**Backend :**
- Valide et normalise le document sans casser `choiceId`, ordre des `choices[]`, `node.id`. Ne reconstruit plus un document à partir d’un graphe UI.
- Endpoints (cible P0) : GET /documents/{path|id} → { document, schemaVersion, revision } ; PUT /documents/{path|id} avec payload { document, revision } → { revision, validationReport }. Conflit → 409 + dernier état.

**Frontend :**
- SoT contenu = `document` (Unity JSON) ; SoT layout = `layout`. Nodes/edges = projection dérivée uniquement.
- Identités UI stables : node id = `node.id` ; choice handle = `choice:${choiceId}` ; TestNode id = `test:${choiceId}` ; edge ids basés sur la sortie (ex. `e:${nodeId}:choice:${choiceId}:target`), jamais sur la destination seule.
- Saisie : form local + debounce/throttle/blur inchangé ; la projection ne doit pas provoquer de reset du panel.

**Unity :**
- DTO étendus pour inclure `choiceId` (et tout champ requis) ; sérialisation/normalisation préservent ces champs (pas de perte JsonUtility).

**Décisions associées (hypothèses validées) :**
1. Backend = propriétaire du document (source canonique, revision, conflits).
2. Layout = partagé par document, persisté backend, même concurrence.
3. `schemaVersion` dans le JSON ; sémantique partagée frontend/backend/Unity.
4. Unity ne perd aucun champ (même format strict, DTO alignés).
5. Refus document sans `choiceId` conditionné par `schemaVersion >= 1.1.0` ; migration one-shot puis format courant uniquement.
6. Cible perf : plusieurs milliers de nœuds ; tests avec borne confort/stress et règles métier (4 choix cinéma, 8+ hors cinéma).

**Constraints:**
- Le frontend NE DOIT PLUS envoyer nodes/edges au backend pour le save ; il envoie le document (et optionnellement le layout).
- Le backend NE DOIT PAS reconstruire le document à partir d’un graphe UI ; il valide/normalise le document reçu.
- Toute identité éditable/liaisonnable (choice, etc.) DOIT avoir un identifiant stable (choiceId) ; pas d’index seul comme identité durable pour les edges/handles.

**Rationale:**
- Alignement avec l’exigence stakeholder « JSON = source de vérité » et avec la revue consultant.
- Une seule source canonique (document) évite les dérives et les doubles conversions.
- Identités stables (choiceId) évitent les bugs de sélection, focus, drag, undo et les régressions « ça disparaît / ça saute ».

**Risks:**
- Migration des documents existants (fichiers, fixtures) : atténuation par outil one-shot + lecture tolérante courte.
- Changement de contrat API (load/save) et refactor store frontend : plan d’implémentation par epics/stories.

**Tests Required:**
- Golden : JSON → projection nodes/edges avec IDs stables, edgeIds stables ; changement de cible → edgeId inchangé.
- E2E : édition line/speaker/choice sans perte ; connecter/déconnecter ; dupliquer nœud (nouveaux node.id et choiceId, refs effacées) ; reload avec layout.
- Perf : cible confort + borne stress (milliers de nœuds, 4/8 choices selon métier), p95 frappe/drag/load sans nœuds invisibles.

**Référence :** Document de synthèse architecte consultant + 6 décisions associées (à déposer dans `docs/architecture/`, ex. `pipeline-unity-backend-front-architecture.md`). Processus de validation et mise en place : `docs/architecture/validation-et-mise-en-place-decisions.md`.

---

### ADR-009: Cibles de connexion dans le panel graphe (combobox + SoT edges) & coque standalone vs Dashboard

**Context:**  
Les IDs de cibles (`targetNode`, `nextNode`, sorties TestNode) sont portés par le **graphe** (edges + projection document, ADR-007/008). Des champs texte RHF seuls ont créé des fenêtres où le **flush** au changement de nœud ou une **génération** écrasaient ou divergeaient du store. Par ailleurs, la page **`/graph-editor`** (standalone) et l’onglet **Dashboard « Éditeur de Graphe »** n’exposent pas le même chrome : le **`NodeEditorPanel`** n’est monté que dans le Dashboard.

**Decision:**  
1. **Sélecteurs dédiés** (`ConnectionTargetSelect`) : un changement de cible appelle **`connectNodes` / `disconnectNodes`** (même sémantique qu’un branchement au drag), pas seulement `setValue` sur un champ « possédé par les edges ».  
2. **Libellés** : options avec libellé lisible (titre / displayName / première ligne de `line` / id) ; entrée **`Fin (END)`** ; helpers `nodeTargetLabel` / `targetPickerOptions`.  
3. **Merge formulaire → store** : logique centralisée dans **`mergeNodeEditorForm.ts`** pour préserver les champs sensibles aux edges au flush.  
4. **Resync** : si le nœud sélectionné est inchangé mais les connexions en store changent, réaligner le formulaire (empreinte des champs de connexion) ; pour ces clés, la **vérité graphe** prime sur une saisie form concurrente.  
5. **Coque UI** : documenter explicitement que **`GraphEditorPage` (`/graph-editor`)** = canvas + liste Unity + header, **sans** `NodeEditorPanel` ; édition complète (speaker, ligne, combobox de cibles, choix) via **Dashboard** → onglet graphe → panneau droit « Édition de nœud ».  
6. **Autosave** : comparer l’identité du dialogue sélectionné et celle du store **sans extension `.json`** (casse normalisée) pour ne pas bloquer l’autosave (`useDialogueLoader`).

**Constraints:**  
- Tout nouveau flux « cible » dans le panel doit passer par les primitives edge du store.  
- Les E2E Playwright qui supposent `input[name="speaker"]` ou combobox de cible sur la **seule** URL `/graph-editor` sont invalides ; utiliser le **Dashboard** ou router vers l’onglet graphe.

**Rationale:**  
Alignement ADR-007 (mutations graphe via store) et ADR-008 (projection document) ; réduction des courses form/store ; clarté produit sur où éditer.

**Tests Required:**  
- Unit : `mergeNodeEditorForm`, `nodeTargetLabel`, `ConnectionTargetSelect` (RTL).  
- E2E : `e2e/graph-connection-target-dropdown.spec.ts` (seed API → Dashboard → combobox « Nœud suivant » → `Fin (END)` → save → GET document).

**Artifact suivi implémentation :** `_bmad-output/implementation-artifacts/graph-connection-targets-ui-dashboard-vs-standalone-2026-03.md`  
**Miroir technique `docs/` (optionnel) :** `docs/architecture/adr-graph-connection-targets-ui-shell.md`

---

### Integration Patterns (V1.0 ↔ Baseline)

#### Pattern 1: New API Endpoints (Streaming, Presets)

**Integration:**
- Nouveau router dans `api/routers/` (ex: `streaming.py`, `presets.py`)
- Enregistrement dans `api/main.py` : `app.include_router(streaming_router)`
- Service backend dans `services/` si logique métier (ex: `PresetService`)
- Tests dans `tests/api/test_<router>.py`

**Follows Baseline:**
- ✅ RESTful conventions (`/api/v1/*`)
- ✅ Pydantic schemas (`api/schemas/`)
- ✅ Dependency injection (`api/dependencies.py`)
- ✅ Error handling (exceptions hiérarchisées)

#### Pattern 2: New React Components (Modal, PresetBar)

**Integration:**
- Nouveaux composants dans `frontend/src/components/<domain>/`
- State management via Zustand (nouveaux slices si nécessaire)
- API calls via `frontend/src/api/<domain>.ts`
- Tests dans `frontend/src/components/<domain>/<Component>.test.tsx`

**Follows Baseline:**
- ✅ TypeScript strict
- ✅ Zustand pour state global
- ✅ API client modulaire (axios + intercepteurs)
- ✅ Tests unitaires (Vitest + RTL)

#### Pattern 3: Graph Editor Fixes (Refactoring)

**Integration:**
- Modifications dans `frontend/src/components/graph/`
- Migration données si nécessaire (script `scripts/migrate-stableIDs.ts`)
- Tests régression dans `frontend/src/components/graph/GraphEditor.test.tsx`

**Follows Baseline:**
- ✅ Pas de breaking changes API
- ✅ Backward compatibility (migrations gracieuses)
- ✅ Tests couvrent edge cases

---

