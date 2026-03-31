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

**NFR Coverage:**
- NFR-P1 à P5 (Performance) → Epics 1, 2, 10, 11, 13, 15
- NFR-S1 à S3 (Security) → Epics 0, 7
- NFR-SC1 à SC3 (Scalability) → Epics 2, 6, 7, 8
- NFR-R1 à R4 (Reliability) → Epics 0, 1, 4, 10, 13
- NFR-A1 à A3 (Accessibility) → Epics 2, 11, 12, 14, 15
- NFR-I1 à I3 (Integration) → Epics 3, 5, 9

