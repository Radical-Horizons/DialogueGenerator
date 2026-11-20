# Non-Functional Requirements

### Performance

**NFR-P1: Graph Editor Rendering Performance**

**Requirement:** System must render dialogue graphs with 500+ nodes in <1 second.

> **Epic 20 (décision du 2026-11-20).** Pour la refonte « Scène », le seuil mesuré est celui d'ADR-008
> (`docs/architecture/adr-008-perf-targets.md`, palier confort : p95 load < 3 s sous 500 nœuds, p95 drag < 200 ms,
> p95 frappe < 100 ms), mesuré en local sur le poste Windows de l'auteur avec `PERF_STRICT=1` ; voir `epics/epic-20.md`,
> « Seuils de mesure ».

**Rationale:** User Journey Marc - workflow itératif nécessite graph fluide. Performance dégradée = friction workflow critique.

**Measurement:**
- **Metric:** Time to render graph (500 nodes) from JSON load to visual display
- **Target:** <1 second (95th percentile)
- **Test:** Load dialogue 500 nodes, measure render time

**Acceptance Criteria:**
- Graph 100 nodes: <200ms
- Graph 500 nodes: <1s
- Graph 1000+ nodes: <2s (avec virtualization si nécessaire)

---

**NFR-P2: LLM Generation Response Time**

**Requirement:** System must generate dialogue nodes within acceptable time limits for iterative workflow.

**Rationale:** Success Criteria Technical - génération rapide = workflow efficace. Temps élevé = frustration utilisateur.

**Measurement:**
- **Metric:** Time from generation request to node available (prompt construction + LLM call + validation)
- **Targets:**
  - Single node: <30 seconds (95th percentile)
  - Batch 3-8 nodes: <2 minutes (95th percentile)
- **Test:** Measure end-to-end generation time (API call → response received)

**Acceptance Criteria:**
- 1 node generation: <30s (target), <60s (maximum acceptable)
- Batch 3-8 nodes: <2min (target), <5min (maximum acceptable)
- Timeout handling: If >5min, cancel and return error (user can retry)

---

**NFR-P3: API Response Time (Non-LLM Endpoints)**

**Requirement:** System must respond to non-LLM API requests within <200ms.

**Rationale:** User Experience - interactions UI (list dialogues, search, context selection) doivent être instantanées.

**Measurement:**
- **Metric:** API response time (GET endpoints: list, search, context, metadata)
- **Target:** <200ms (95th percentile)
- **Test:** Load test API endpoints, measure response times

**Acceptance Criteria:**
- GET /api/v1/dialogues (list): <200ms
- GET /api/v1/context (GDD entities): <200ms
- GET /api/v1/dialogues/{id} (read): <100ms
- POST /api/v1/dialogues (save): <500ms

---

**NFR-P4: UI Interaction Responsiveness**

**Requirement:** System must respond to user interactions (clicks, drags, keyboard) within <100ms.

**Rationale:** User Journey Marc - workflow itératif nécessite UI réactive. Latence = friction workflow.

**Measurement:**
- **Metric:** Time from user action to UI feedback (visual update)
- **Target:** <100ms (perceived instant)
- **Test:** Measure click-to-visual-feedback time in graph editor

**Acceptance Criteria:**
- Node click: <50ms
- Drag & drop: <100ms (smooth 60fps)
- Keyboard navigation: <50ms
- Search filter: <200ms (includes API call)

---

**NFR-P5: Initial Page Load Time**

**Requirement:** System must load initial page (dashboard) within acceptable time for good user experience.

**Rationale:** Web App - first impression critique. Load lent = frustration utilisateur.

**Measurement:**
- **Metric:** Time from page request to interactive (TTI - Time to Interactive)
- **Targets:**
  - First Contentful Paint (FCP): <1.5s
  - Time to Interactive (TTI): <3s
  - Largest Contentful Paint (LCP): <2.5s
- **Test:** Lighthouse performance audit, network throttling (fast 3G)

**Acceptance Criteria:**
- FCP: <1.5s (target), <3s (maximum acceptable)
- TTI: <3s (target), <5s (maximum acceptable)
- LCP: <2.5s (target), <4s (maximum acceptable)

---

### Security

**NFR-S1: LLM API Key Protection**

**Requirement:** System must never expose LLM API keys to frontend or client-side code.

**Rationale:** Security - API keys exposées = risque coût élevé (usage non autorisé).

**Measurement:**
- **Metric:** Zero API keys in frontend bundle, client-side code, or browser network requests
- **Target:** 100% protection (zero exposure)
- **Test:** Code audit, network inspection, bundle analysis

**Acceptance Criteria:**
- API keys stored backend only (environment variables)
- No API keys in frontend JavaScript bundle
- No API keys in browser network requests (all LLM calls via backend proxy)
- API keys rotation support (change key without downtime)

---

**NFR-S2: Authentication & Session Security**

**Requirement:** System must authenticate users securely and protect sessions from unauthorized access.

**Rationale:** RBAC V1.5 - collaboration équipe nécessite auth robuste.

**Measurement:**
- **Metric:** Session security (token expiration, HTTPS, secure cookies)
- **Target:** Industry standard (JWT tokens, 24h expiration, HTTPS only)
- **Test:** Security audit, penetration testing

**Acceptance Criteria:**
- Password hashing: bcrypt or Argon2 (never plaintext)
- Session tokens: JWT with expiration (24h default, configurable)
- HTTPS only: All API calls over HTTPS (no HTTP in production)
- Secure cookies: HttpOnly, Secure, SameSite=Strict flags

---

**NFR-S3: Data Protection (Dialogues & GDD)**

**Requirement:** System must protect dialogue data and GDD from unauthorized access or modification.

**Rationale:** IP Protection - dialogues = propriété Alteir, GDD = lore critique.

**Measurement:**
- **Metric:** Access control enforcement (RBAC, file permissions)
- **Target:** 100% enforcement (no unauthorized access)
- **Test:** Access control testing, RBAC validation

**Acceptance Criteria:**
- File permissions: Read/write restricted to authorized users only
- RBAC enforcement: Admin/Writer/Viewer roles respected (V1.5+)
- Audit logs: Track all access/modification (V1.5+)
- Backup security: Backups encrypted, access restricted

---

### Scalability

**NFR-SC1: Dialogue Storage Scalability**

**Requirement:** System must support 1000+ dialogues (100+ nodes each) without performance degradation.

**Rationale:** Success Criteria Technical - scale 1M+ lignes by 2028 = 1000+ dialogues minimum.

**Measurement:**
- **Metric:** Performance (search, list, load) with 1000+ dialogues
- **Target:** <10% performance degradation vs 100 dialogues baseline
- **Test:** Load test with 1000 dialogues, measure search/list/load times

**Acceptance Criteria:**
- List dialogues: <500ms (1000 dialogues)
- Search dialogues: <1s (1000 dialogues, indexed)
- Load dialogue: <200ms (100 nodes)
- Storage: Filesystem OK until 1000+, DB migration if >1000 (V2.0+)

---

**NFR-SC2: Concurrent User Support**

**Requirement:** System must support 3-5 concurrent users (MVP) scaling to 10+ users (V2.0+).

**Rationale:** Scoping - équipe future (Marc + Mathieu + writer + Unity dev + communauté).

**Measurement:**
- **Metric:** System performance with concurrent users (response time, no conflicts)
- **Target:** <20% performance degradation with 5 concurrent users vs 1 user
- **Test:** Load test with concurrent users, measure response times

**Acceptance Criteria:**
- MVP: 3-5 concurrent users (single instance, no conflicts)
- V1.5: 5-10 concurrent users (RBAC, shared dialogues)
- V2.0+: 10+ concurrent users (real-time collaboration, conflict resolution)
- Conflict handling: Detect concurrent edits, merge or error gracefully

---

**NFR-SC3: Graph Editor Scalability**

**Requirement:** System must support dialogues with 100+ nodes (Disco Elysium scale) with smooth performance.

**Rationale:** Domain Requirements - CRPG dialogues = 100+ nodes par dialogue.

**Measurement:**
- **Metric:** Graph editor performance (rendering, interaction) with 100+ nodes
- **Target:** <2s render, <100ms interactions (100 nodes)
- **Test:** Load dialogue 100 nodes, measure render/interaction times

**Acceptance Criteria:**
- 50 nodes: <500ms render, <50ms interactions
- 100 nodes: <1s render, <100ms interactions
- 500+ nodes: <2s render, <200ms interactions (avec virtualization)

---

### Reliability

**NFR-R1: Zero Blocking Bugs**

**Requirement:** System must have zero bugs that block production narrative work.

**Rationale:** Success Criteria Technical - 0 bugs bloquants = production-readiness.

**Measurement:**
- **Metric:** Bug count by severity (blocking = P0, critical = P1)
- **Target:** Zero P0 bugs, <5 P1 bugs
- **Test:** Bug tracking, production monitoring

**Acceptance Criteria:**
- P0 (Blocking): Zero bugs (éditeur graphe crash, data loss, export fail)
- P1 (Critical): <5 bugs (performance degradation, minor data issues)
- Bug definition: See Success Criteria Technical (éditeur inutilisable, génération fail >10%, export invalide, data loss, performance >5min)

---

**NFR-R2: System Uptime**

**Requirement:** System must be available >99% of the time (outil toujours accessible).

**Rationale:** User Journey Marc - downtime = perte production narrative.

**Measurement:**
- **Metric:** Uptime percentage (monthly)
- **Target:** >99% uptime (monthly)
- **Test:** Monitoring (health checks, uptime tracking)

**Acceptance Criteria:**
- Monthly uptime: >99% (target), >95% (minimum acceptable)
- Planned maintenance: <4h/month (scheduled, off-hours)
- Unplanned downtime: <1h/month (incidents)
- Recovery time: <15min (from incident detection to resolution)

---

**NFR-R3: Data Loss Prevention**

**Requirement:** System must prevent data loss (dialogues, GDD, user work).

**Rationale:** User Journey Marc - perte travail = frustration critique.

**Measurement:**
- **Metric:** Data loss incidents (lost dialogues, corrupted files)
- **Target:** Zero data loss incidents
- **Test:** Backup validation, recovery testing, auto-save verification

**Acceptance Criteria:**
- Auto-save: Every 2 minutes (V1.0+), LocalStorage backup
- Session recovery: Restore after browser crash (V1.0+)
- Git versioning: Manual commits (Marc workflow), auto-commit option (V2.0+)
- Backup: Daily backups (if cloud deployment), restore tested

---

**NFR-R4: Error Recovery (LLM API Failures)**

**Requirement:** System must gracefully handle LLM API failures with automatic retry and fallback.

**Rationale:** User Journey Marc edge case - LLM API down = fallback Anthropic.

**Measurement:**
- **Metric:** Error recovery success rate (retry success, fallback success)
- **Target:** >95% recovery (retry or fallback succeeds)
- **Test:** Simulate LLM API failures, measure recovery rate

**Acceptance Criteria:**
- Retry logic: 3 attempts, exponential backoff (1s, 2s, 4s)
- Fallback provider: OpenAI → Anthropic (V1.0+)
- User feedback: Clear error messages, retry option
- Timeout: 60s per attempt, cancel after 3 failures

---

### Accessibility

**NFR-A1: Keyboard Navigation**

**Requirement:** System must be fully navigable via keyboard (graph editor, forms, navigation).

**Rationale:** Developer Tool / Web App - keyboard nav critique pour power users.

**Measurement:**
- **Metric:** Keyboard navigation coverage (% UI elements accessible via keyboard)
- **Target:** 100% coverage (all interactive elements)
- **Test:** Keyboard-only navigation test, screen reader testing

**Acceptance Criteria:**
- Graph editor: Tab navigation (nodes), Arrow keys (move), Enter/Space (select), Escape (cancel)
- Forms: Tab navigation, Enter submit, Escape cancel
- Keyboard shortcuts: generate (Ctrl+Enter in the "to write" slot, Epic 20), Ctrl+Z / Ctrl+Y (undo / redo) (FR111). No save shortcut: everything saves itself (ADR-006; product rule "never Ctrl+S nor a Save button", 2026-11-11)
- Focus indicators: Visible focus states (outline, highlight)

---

**NFR-A2: Color Contrast (WCAG AA)**

**Requirement:** System must meet WCAG AA color contrast requirements (4.5:1 text, 3:1 UI).

**Rationale:** Accessibility - WCAG AA minimum pour outil professionnel.

**Measurement:**
- **Metric:** Color contrast ratios (text, UI components)
- **Target:** WCAG AA (4.5:1 text, 3:1 UI)
- **Test:** Color contrast audit (Lighthouse, manual testing)

**Acceptance Criteria:**
- Text contrast: 4.5:1 minimum (normal text), 3:1 (large text)
- UI contrast: 3:1 minimum (buttons, borders, focus indicators)
- High contrast mode: Alternative theme (V2.0+)

---

**NFR-A3: Screen Reader Support (V2.0+)**

**Requirement:** System must support screen readers with ARIA labels and semantic HTML.

**Rationale:** Open-source vision - accessibilité = valeur communauté.

**Measurement:**
- **Metric:** Screen reader compatibility (ARIA labels, semantic HTML)
- **Target:** WCAG AA compliance (V2.0+)
- **Test:** Screen reader testing (NVDA, JAWS, VoiceOver)

**Acceptance Criteria:**
- ARIA labels: All interactive elements labeled
- Semantic HTML: Proper headings, landmarks, roles
- Live regions: Dynamic updates announced (generation progress, errors)
- Skip links: Skip to main content, skip navigation

---

### Integration

**NFR-I1: Unity JSON Export Reliability**

**Requirement:** System must export Unity JSON with 100% schema conformity (zero invalid exports).

**Rationale:** User Journey Thomas - export invalide = blocage pipeline Unity.

**Measurement:**
- **Metric:** Export validation success rate (% exports valid)
- **Target:** 100% valid exports (zero invalid)
- **Test:** Validate all exports against Unity custom schema

**Acceptance Criteria:**
- Schema validation: 100% before export (UnitySchemaValidator)
- Invalid export handling: Block export, show validation errors
- Export logs: Metadata (validation status, errors if any)

---

**NFR-I2: LLM API Integration Reliability**

**Requirement:** System must integrate with LLM APIs (OpenAI, Anthropic) with retry logic and fallback.

**Rationale:** Reliability - LLM API failures = génération impossible.

**Measurement:**
- **Metric:** LLM API success rate (after retries/fallback)
- **Target:** >99% success rate (retry + fallback)
- **Test:** Monitor LLM API calls, measure success rate

**Acceptance Criteria:**
- Retry logic: 3 attempts, exponential backoff
- Fallback provider: OpenAI → Anthropic (V1.0+)
- Error handling: Clear user feedback, retry option
- Rate limiting: Respect LLM API rate limits, queue requests if needed

---

**NFR-I3: Notion Integration (V2.0+)**

**Requirement:** System must sync GDD data from Notion reliably (webhook or polling).

**Rationale:** Integration Ecosystem - Notion sync bidirectionnel (V2.0+).

**Measurement:**
- **Metric:** Notion sync success rate (% syncs successful)
- **Target:** >95% success rate
- **Test:** Monitor Notion sync operations, measure success rate

**Acceptance Criteria:**
- Webhook support: Receive Notion updates (V2.0+)
- Polling fallback: Poll Notion if webhook unavailable
- Conflict resolution: Handle concurrent Notion ↔ DialogueGenerator edits
- Error handling: Log sync errors, manual retry option

---
