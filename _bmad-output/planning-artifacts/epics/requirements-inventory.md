# Requirements Inventory

### Functional Requirements

**FR1:** Users can generate a single dialogue node with LLM assistance based on selected GDD context  
**FR2:** Users can generate batch of multiple nodes (3-8) from existing player choices  
**FR3:** Users can specify generation instructions (tone, style, theme) for dialogue nodes  
**FR4:** Users can accept or reject generated nodes inline in the graph editor  
**FR5:** Users can manually edit generated node content (text, speaker, metadata)  
**FR6:** Users can create new dialogue nodes manually (without LLM generation)  
**FR7:** Users can duplicate existing nodes to create variations  
**FR8:** Users can delete nodes from dialogues  
**FR9:** System can auto-link generated nodes to existing graph structure  
**FR10:** Users can regenerate rejected nodes with adjusted instructions  
**FR11:** Users can browse available GDD entities (characters, locations, regions, themes)  
**FR12:** Users can manually select GDD context relevant for dialogue generation  
**FR13:** System can automatically suggest relevant GDD context based on configured relevance rules *(Depends on FR14-15)*  
**FR14:** Users can define explicit context selection rules (lieu → region → characters → theme)  
**FR15:** Users can configure context selection rules per dialogue type  
**FR16:** System can measure context relevance (% GDD used in generated dialogue)  
**FR17:** Users can view which GDD sections were used in node generation  
**FR18:** System can sync GDD data from Notion (V2.0+)  
**FR19:** Users can update GDD data without regenerating existing dialogues  
**FR20:** Users can configure token budget for context selection *(NEW - Context budget management)*  
**FR21:** System can optimize context to fit within token budget while maintaining relevance *(NEW)*  
**FR22:** Users can view dialogue structure as a visual graph (nodes and connections)  
**FR23:** Users can navigate large graphs (500+ nodes) *(Note: Performance target in NFRs)*  
**FR24:** Users can zoom, pan, and focus on specific graph areas  
**FR25:** Users can drag-and-drop nodes to reorganize graph layout  
**FR26:** Users can create connections between nodes manually  
**FR27:** Users can delete connections between nodes  
**FR28:** Users can search for nodes by text content or speaker name  
**FR29:** Users can jump to specific node by ID or name  
**FR30:** Users can filter graph view (show/hide node types, speakers)  
**FR31:** Users can select multiple nodes in graph (shift-click, lasso selection) *(NEW - Bulk selection)*  
**FR32:** Users can apply operations to multiple selected nodes (delete, tag, validate) *(NEW)*  
**FR33:** Users can access contextual actions on nodes (right-click menu) *(NEW)*  
**FR34:** System can auto-layout graph for readability  
**FR35:** Users can undo/redo graph edit operations  
**FR36:** System can validate node structure (required fields: DisplayName, stableID, text)  
**FR37:** System can detect empty nodes (missing text content)  
**FR38:** System can detect explicit lore contradictions (conflicting GDD facts) *(SPLIT from FR35 - Explicit contradictions)*  
**FR39:** System can flag potential lore inconsistencies for human review *(SPLIT from FR35 - Potential issues)*  
**FR40:** System can detect orphan nodes (nodes not connected to graph)  
**FR41:** System can detect cycles in dialogue flow  
**FR42:** System can assess dialogue quality with LLM judge (score 0-10, ±1 margin for variance) *(CLARIFIED - Added variance tolerance)*  
**FR43:** System can detect "AI slop" patterns (GPT-isms, repetition, generic phrases)  
**FR44:** System can detect context dropping in generated dialogue (lore explicite vs subtil) *(NEW - Context dropping detection)*  
**FR45:** Users can configure anti-context-dropping validation rules *(NEW)*  
**FR46:** Users can simulate dialogue flow to detect dead ends  
**FR47:** Users can view simulation coverage report (% reachable nodes, unreachable nodes)  
**FR48:** System can validate JSON Unity schema conformity (100%)  
**FR49:** Users can export single dialogue to Unity JSON format  
**FR50:** Users can batch export multiple dialogues to Unity JSON  
**FR51:** System can validate exported JSON against Unity custom schema  
**FR52:** Users can download exported JSON files  
**FR53:** Users can preview export before download (JSON structure, size)  
**FR54:** System can generate export logs with metadata (generation date, cost, validation status)  
**FR55:** Users can create custom instruction templates for dialogue generation  
**FR56:** Users can save, edit, and delete templates  
**FR57:** Users can apply templates to dialogue generation  
**FR58:** System can provide pre-built templates (salutations, confrontation, révélation, etc.)  
**FR59:** Users can configure anti-context-dropping templates (subtilité lore vs explicite) *(NEW)*  
**FR60:** Users can browse template marketplace (V1.5+)  
**FR61:** System can A/B test templates and score quality (V2.5+)  
**FR62:** Users can share templates with team members  
**FR63:** System can suggest templates based on dialogue scenario  
**FR64:** Users can create accounts with username/password authentication  
**FR65:** Users can log in and log out of the system  
**FR66:** Administrators can assign roles to users (Admin, Writer, Viewer)  
**FR67:** Writers can create, edit, and delete dialogues  
**FR68:** Viewers can read dialogues but cannot edit  
**FR69:** Users can share dialogues with specific team members  
**FR70:** Users can view who has access to each dialogue  
**FR71:** System can track user actions for audit logs (V1.5+)  
**FR72:** System can estimate LLM cost before generating nodes  
**FR73:** Users can view cost breakdown per dialogue (total cost, cost per node)  
**FR74:** Users can view cumulative LLM costs (daily, monthly)  
**FR75:** System can enforce cost limits per user or team (V1.5+)  
**FR76:** Administrators can configure cost budgets and alerts  
**FR77:** System can display prompt transparency (show exact prompt sent to LLM)  
**FR78:** Users can view generation logs (prompts, responses, costs)  
**FR79:** System can fallback to alternate LLM provider on primary failure (OpenAI → Anthropic) *(NEW - Fallback provider)*  
**FR80:** Users can list all dialogues in the system  
**FR81:** Users can search dialogues by name, character, location, or theme  
**FR82:** Users can filter dialogues by metadata (creation date, author, status)  
**FR83:** Users can sort dialogues (alphabetically, by date, by size)  
**FR84:** Users can create dialogue collections or folders for organization  
**FR85:** System can index dialogues for fast search (1000+ dialogues)  
**FR86:** Users can view dialogue metadata (node count, cost, last edited)  
**FR87:** Users can batch validate multiple dialogues *(NEW - Batch validation)*  
**FR88:** Users can batch generate nodes from multiple starting nodes *(NEW - Batch generation)*  
**FR89:** Users can define variables and flags in dialogues (V1.0+)  
**FR90:** Users can set conditions on node visibility (if variable X = Y, show node)  
**FR91:** Users can define effects triggered by player choices (set variable, unlock flag)  
**FR92:** Users can preview scenarios with different variable states  
**FR93:** System can validate variable references (detect undefined variables)  
**FR94:** Users can integrate game system stats (character attributes, reputation) (V3.0+)  
**FR95:** System can auto-save user work every 2 minutes (V1.0+)  
**FR96:** System can restore session after browser crash  
**FR97:** Users can manually save dialogue progress  
**FR98:** Users can commit dialogue changes to Git repository (manual workflow external)  
**FR99:** System can detect unsaved changes and warn before navigation  
**FR100:** Users can view previous versions of dialogue (basic history MVP) *(NEW - Basic history)*  
**FR101:** Users can view edit history for dialogue (detailed V2.0+)  
**FR102:** New users can access wizard onboarding for first dialogue creation (V1.0+)  
**FR103:** Users can access in-app documentation and tutorials  
**FR104:** System can provide contextual help based on user actions  
**FR105:** Users can access sample dialogues for learning  
**FR106:** System can detect user skill level and adapt UI (power vs guided mode) (V1.5+)  
**FR107:** Power users can toggle advanced mode for full control *(NEW - Power mode explicit)*  
**FR108:** New users can activate guided mode with step-by-step wizard *(NEW - Guided mode explicit)*  
**FR109:** Users can preview estimated node structure before LLM generation (dry-run mode) *(NEW - Preview before generation)*  
**FR110:** Users can compare two dialogue nodes side-by-side *(NEW - Comparison)*  
**FR111:** Users can access keyboard shortcuts for common actions (Ctrl+G generate, Ctrl+S save, Ctrl+Z undo, etc.) *(NEW - Keyboard shortcuts)*  
**FR112:** Users can monitor system performance metrics (generation time, API latency)  
**FR113:** Users can view performance trends over time (dashboard analytics)  
**FR114:** Users can navigate the graph editor with keyboard (Tab, Arrow keys, Enter, Escape, and shortcuts)  
**FR115:** System can provide visible focus indicators for keyboard navigation  
**FR116:** Users can customize color contrast (WCAG AA minimum)  
**FR117:** System can support screen readers with ARIA labels (V2.0+)  
**FR118:** Users can use the application on narrow viewports (from 320px width) with an adaptive shell and without whole-app horizontal scroll *(NEW - Mobile / responsive)*  
**FR119:** Users can complete primary graph and chrome interactions via touch, including equivalent paths for mouse-only actions (e.g. context menu) *(NEW - Touch)*  
**FR120:** Users can access context selection and node detail panels on narrow viewports via mobile-appropriate patterns (drawers, full-screen panels, or explicit tabs) *(NEW - Narrow panels)*  
**FR121:** Users can install the web app as a PWA (home screen icon / install prompt) where the browser supports it (V1.5+) *(NEW - PWA)*

**FR122:** Users can edit a node's NPC dialogue line directly on the canvas node (in-situ): a single click into the text of an already-selected node places the caret; a first click on an unselected node selects and expands it *(NEW - Édition in-situ)*  
**FR123:** Nodes display the full dialogue line (no 100-character truncation) **in expanded density** (single-selected node), with adaptive height bounded by a maximum (440px) and internal scrolling beyond it; summary density keeps the compact rendering *(NEW - Édition in-situ)*  
**FR124:** Users can read and edit the text of each player response (choice) as a row inside the canvas node, preserving `choiceId` and row order *(NEW - Édition in-situ)*  
**FR125:** Users can edit the speaker and the node title in-situ on the canvas node *(NEW - Édition in-situ)*  
**FR126:** In-situ edits are persisted with no explicit save action ("edit = save"), pushed to the store within <=100ms per ADR-006; Escape leaves the field (the text is already saved) and Ctrl+Z reverts a coalesced edit unit via a transactional undo path *(NEW - Édition in-situ)*  
**FR127:** In-situ editing and the right-hand detail panel stay bidirectionally consistent - one single source of truth (store), no competing flush, no last-writer-wins race *(NEW - Édition in-situ)*  
**FR128:** In-situ editing is operable by keyboard (Tab chain across the node's fields, visible focus) and by touch on narrow viewports *(NEW - Édition in-situ)*  
**FR129:** Users can open node generation, GDD context details and game variables as overlays launched from the node itself, so that the permanent right-hand panel is no longer required to author a dialogue *(NEW - Canvas-first, Epic 19)*  
**FR130:** Users can collapse or remove the permanent right-hand panel and recover its width for the graph canvas, with no loss of access to any of its functions *(NEW - Canvas-first, Epic 19 — **PROVISOIRE** : "collapse" et "remove" décrivent deux produits différents ; l'exigence n'est pas testable avant arbitrage, prévu après retour d'usage d'Epic 18)*

### NonFunctional Requirements

**NFR-P1: Graph Editor Rendering Performance** - System must render dialogue graphs with 500+ nodes in <1 second.

**NFR-P2: LLM Generation Response Time** - System must generate dialogue nodes within acceptable time limits (single node <30s, batch 3-8 nodes <2min).

**NFR-P3: API Response Time (Non-LLM Endpoints)** - System must respond to non-LLM API requests within <200ms.

**NFR-P4: UI Interaction Responsiveness** - System must respond to user interactions (clicks, drags, keyboard) within <100ms.

**NFR-P5: Initial Page Load Time** - System must load initial page (dashboard) within acceptable time (FCP <1.5s, TTI <3s, LCP <2.5s).

**NFR-S1: LLM API Key Protection** - System must never expose LLM API keys to frontend or client-side code.

**NFR-S2: Authentication & Session Security** - System must authenticate users securely and protect sessions from unauthorized access (JWT tokens, HTTPS only, secure cookies).

**NFR-S3: Data Protection (Dialogues & GDD)** - System must protect dialogue data and GDD from unauthorized access or modification (RBAC, audit logs V1.5+).

**NFR-SC1: Dialogue Storage Scalability** - System must support 1000+ dialogues (100+ nodes each) without performance degradation.

**NFR-SC2: Concurrent User Support** - System must support 3-5 concurrent users (MVP) scaling to 10+ users (V2.0+).

**NFR-SC3: Graph Editor Scalability** - System must support dialogues with 100+ nodes (Disco Elysium scale) with smooth performance.

**NFR-R1: Zero Blocking Bugs** - System must have zero bugs that block production narrative work.

**NFR-R2: System Uptime** - System must be available >99% of the time (outil toujours accessible).

**NFR-R3: Data Loss Prevention** - System must prevent data loss (dialogues, GDD, user work) with auto-save, session recovery, Git versioning.

**NFR-R4: Error Recovery (LLM API Failures)** - System must gracefully handle LLM API failures with automatic retry and fallback (>95% recovery rate).

**NFR-A1: Keyboard Navigation** - System must be fully navigable via keyboard (graph editor, forms, navigation) with 100% coverage.

**NFR-A2: Color Contrast (WCAG AA)** - System must meet WCAG AA color contrast requirements (4.5:1 text, 3:1 UI).

**NFR-A3: Screen Reader Support (V2.0+)** - System must support screen readers with ARIA labels and semantic HTML.

**NFR-I1: Unity JSON Export Reliability** - System must export Unity JSON with 100% schema conformity (zero invalid exports).

**NFR-I2: LLM API Integration Reliability** - System must integrate with LLM APIs (OpenAI, Anthropic) with retry logic and fallback (>99% success rate).

**NFR-I3: Notion Integration (V2.0+)** - System must sync GDD data from Notion reliably (webhook or polling).

### Additional Requirements

**From Architecture Document:**

- **ADR-001: Progress Feedback Modal (streaming SSE)** - Résout UI "gel" pendant génération. Modal centrée avec streaming visible, étapes de progression, actions Interrompre/Réduire.

- **ADR-002: Presets système** - Réduit cold start friction (10+ clics → 1 clic). Sauvegarde configurations (personnages, lieux, région, instructions), chargement rapide (dropdown), métadonnées (nom, icône emoji, aperçu).

- **ADR-003: Graph Editor Fixes (stableID)** - Corrige bug critique corruption graphe. Validation stableID, auto-génération si manquant, warning si duplication.

- **ADR-004: Multi-Provider LLM (Mistral)** - Flexibilité + réduction dépendance OpenAI. Abstraction IGenerator, Factory pattern, sélection utilisateur, streaming SSE uniforme.

- **ID-001: Auto-save (2min, LWW)** - Sauvegarde automatique dialogues toutes les 2 minutes, suspend pendant génération, stratégie Last-Write-Wins.

- **ID-002: Validation cycles (warning non-bloquant)** - Détection cycles graphe avec warning non-bloquant (cycles autorisés pour dialogues récursifs).

- **ID-003: Cost governance (90% soft + 100% hard)** - Protection financière avec limite soft 90% budget (warning) et limite hard 100% (blocage).

- **ID-004: Streaming cleanup (10s timeout)** - Interruption propre génération avec timeout 10s après fin streaming.

- **ID-005: Preset validation (warning + "Charger quand même")** - Gestion références obsolètes dans presets avec warning modal et option "Charger quand même".

- **Infrastructure Requirements:**
  - Backend FastAPI avec API REST versionnée `/api/v1/`
  - Frontend React 18 + TypeScript + Vite
  - JWT authentication avec access token 15min + refresh token 7 jours
  - ServiceContainer (DI pattern)
  - Structured Outputs (Pydantic)
  - SSE streaming pour génération LLM
  - Tests pytest >80% coverage
  - Vitest + React Testing Library + Playwright E2E

- **Technical Constraints:**
  - Windows-first (pathlib.Path, encodage utf-8)
  - GDD externe (non modifiable, lien symbolique `data/GDD_categories/`)
  - Format Unity strict (JSON schema validation)
  - 18 Cursor rules à respecter

### UX Design Requirements

Exigences de conception issues de la spec UX (`ux-design-specification/`), de la maquette de refonte 2026
(`docs/design/refonte-ui-2026/`) et du design system. Portees par Epic 18.

**UX-DR1:** Reviser les 22 affirmations de la spec UX qui ecartent l'edition in-situ au profit du seul panneau droit — inventaire exhaustif dans `epic-18.md` (9 shards), dont deux anti-patterns qui interdisent explicitement FR127 (`ux-pattern-analysis-inspiration.md:154-156`, `:217-219`)
**UX-DR2:** Affordance d'edition non ambigue sur une zone de texte editable (curseur texte, filet au survol), sans casser la lisibilite en lecture ni le drag du noeud
**UX-DR3:** Respect des tokens de la refonte 2026 en edition comme en lecture — serif pour la replique, mono pour les metadonnees, echelle d'espacement du design system
**UX-DR4:** Etats de synchronisation visibles et honnetes (synchronise / en attente avec compteur / erreur), via le composant existant `SaveStatusIndicator` — pas un second indicateur concurrent
**UX-DR5:** Cibles d'appui tactile >= 44x44px pour activer l'edition sur viewport etroit. **Extension assumee** : les 44px d'Epic 17 sont scopes au chrome (`epic-17.md:63-65`), pas au contenu d'un noeud
**UX-DR6:** Focus visible et ordre de tabulation deterministe, avec les tokens de focus de la story 14.2 (dependance Epic 14)
**UX-DR7:** Reviser la maquette 2026 — `etats-2a-2e.dc.html` bloc 2e (le noeud SELECTIONNE y est dessine en resume), `README.md` §F (structure, hauteur max, largeur 220 -> 280px), et poser une levee d'ambiguite dans `.claude/rules/ui_redesign_2026.md`
**UX-DR8:** Role et nom accessibles sur chaque zone de texte editable du noeud (`responsive-design-accessibility.md:53-56` — ARIA sur tout composant interactif)
**UX-DR9:** Annonce accessible du contenu restaure par un undo — l'operation la plus desorientante dans un champ sans mode
**UX-DR10:** Placeholder sur un champ vide, disant ce qui s'y ecrit — invariant « chaque surface vide dit ce qui s'y affichera » (`design-system-foundation.md:32`)
**UX-DR11:** `aria-invalid` et `aria-describedby` sur un champ in-situ en erreur de validation (`ux-consistency-patterns.md:81`)
**UX-DR12:** Espacement minimal de 8px entre elements interactifs (`responsive-design-accessibility.md:58-60`), contraignant dans un noeud de 280px

### FR Coverage Map

**Infrastructure & Setup:**
- Architecture Requirements (ADR-001 à ADR-004, ID-001 à ID-005) → Epic 0: Infrastructure & Setup (Brownfield)

**Dialogue Authoring & Generation:**
- FR1-10 → Epic 1: Génération de dialogues assistée par IA

**Context Management:**
- FR11-21 → Epic 3: Gestion du contexte narratif (GDD)

**Graph Editor:**
- FR22-35 → Epic 2: Éditeur de graphe de dialogues

**Quality Assurance:**
- FR36-48 → Epic 4: Validation et assurance qualité

**Export & Integration:**
- FR49-54 → Epic 5: Export et intégration Unity

**Templates:**
- FR55-63 → Epic 6: Templates et réutilisabilité

**Collaboration:**
- FR64-71 → Epic 7: Collaboration et contrôle d'accès

**Cost Management:**
- FR72-79 → Epic 1: Génération de dialogues assistée par IA

**Dialogue Database:**
- FR80-88 → Epic 8: Gestion des dialogues et recherche

**Variables & Game Systems:**
- FR89-94 → Epic 9: Variables et intégration systèmes de jeu

**Session Management:**
- FR95-101 → Epic 10: Gestion de session et sauvegarde

**Onboarding:**
- FR102-108 → Epic 11: Onboarding et guidance (inclut variantes optimisées pour persona Mathieu)

**UX Workflow:**
- FR109-111 → Epic 12: Expérience utilisateur et workflow

**Monitoring:**
- FR112-113 → Epic 13: Monitoring et analytics

**Accessibility:**
- FR114-117 → Epic 14: Accessibilité

**Mobile & Responsive:**
- FR118-121 → Epic 17: Expérience mobile et responsive (web)

**Édition in-situ des nœuds:**
- FR122-128 → Epic 18: Édition in-situ du dialogue dans le nœud

**Canvas-first (surfaces à la demande):**
- FR129-130 → Epic 19: Canvas-first — surfaces à la demande, récupération de l'espace graphe

**NFR Coverage** (mise à jour 2026-10-01 — la version précédente omettait les Epics 16 à 19 et ne mentionnait jamais NFR-R3) :

| NFR | Intitulé exact | Epics |
|---|---|---|
| NFR-P1 | Graph Editor Rendering Performance | 1, 2, 15, **16, 17, 18** |
| NFR-P2 | LLM Generation Response Time | 1, 15 |
| NFR-P3 | API Response Time (Non-LLM) | 1, 8, 13 |
| NFR-P4 | UI Interaction Responsiveness | 2, 11, 13, **16, 17, 18** |
| NFR-P5 | Initial Page Load Time | 10, 13, **17** |
| NFR-S1 à S3 | Security (clés LLM, sessions, données) | 0, 7 |
| NFR-SC1 à SC3 | Scalability | 2, 6, 7, 8 |
| NFR-R1 | Zero Blocking Bugs | 0, 1, 4 |
| NFR-R2 | **System Uptime >99 %** | 0, 13 — ⚠️ **pas** « zéro perte » |
| NFR-R3 | **Data Loss Prevention** | 0, 10, **16, 18** |
| NFR-R4 | Error Recovery (LLM API Failures) | 1, 4, 13 |
| NFR-A1 | Keyboard Navigation | 2, 12, 14, **18** |
| NFR-A2 | Color Contrast (WCAG AA) | 11, 14, 15, **17** |
| NFR-A3 | Screen Reader Support (V2.0+) | 14, **18** |
| NFR-I1 à I3 | Integration (Unity, LLM, Notion) | 3, 5, 9, **16** |

⚠️ **Piège de nommage.** NFR-R2 est *System Uptime*, NFR-R3 est *Data Loss Prevention*. La première rédaction d'Epic 18 citait R2 six fois en croyant désigner la non-perte de données. Vérifier l'intitulé avant de citer un identifiant NFR.

**Espaces de numérotation distincts.** `prd/prd-rlm-context-selector.md` ouvre un **second** espace FR1–FR8 / NFR1–NFR6, sans rapport avec le référentiel principal. `epic-15.md` revendique « FR1-FR8 » et « NFR1-NFR6 » : lu hors contexte, Epic 15 semble revendiquer les FR de génération d'Epic 1. À désambiguïser en `RLM-FR1…` / `RLM-NFR1…`.


