# Journey Insights - Architecture Révélée

### Deux Modes d'Usage Distincts

Les journeys révèlent **deux personas avec besoins opposés** :

**Power Mode (Marc) :**

- Free-form : tous les champs visibles, customization totale
- Advanced features : multi-provider LLM, prompt override, cost estimation, debug console
- Manual control : auto-save OFF (manual Git commits), validation on-demand
- Tolérance friction : acceptable si contrôle total garanti

**Guided Mode (Mathieu + futur writer) :**

- Wizard : step-by-step guided flow (lieu → personnage → contexte → generate)
- Templates : instructions pré-remplies, optimisation anti context-dropping
- Automation maximale : auto-save ON, auto-link ON, validation auto ON
- Friction minimale : zéro barrière technique, autonomie complète

**Implementation Strategy :**

- **MVP** : Build pour Marc (power mode uniquement)
- **V1.0** : Add guided mode (wizard + templates + auto-save)
- **V1.5** : Mode detection automatique (skill level user → adapt UI)
- **V2.0** : Mode switch disponible (gear icon → "Advanced Mode" toggle)

### Cinq Systèmes Architecturaux Identifiés

Les journeys révèlent **5 systèmes critiques** :

**1. LLM Orchestration Layer**

- **MVP** : OpenAI uniquement, retry logic basique
- **V1.0** : Multi-provider (Anthropic fallback), error recovery gracieux
- **V2.0** : Local LLM support (Ollama), cost optimization intelligent

**2. State Management Layer**

- **MVP** : Manual save, Git commits
- **V1.0** : Auto-save toutes les 2min, session recovery automatique
- **V1.5** : Real-time sync (si collaboration), conflict resolution

**3. Validation & Quality Layer**

- **MVP** : Structure validation (nœuds vides, orphans, cycles)
- **V1.0** : JSON Unity validation stricte (100% conformité schema custom Unity)
- **V1.5** : Quality validation (lore checker, LLM judge score 8/10)
- **V2.0** : Template optimization (feedback loop anti context-dropping)

**4. Permission & Auth Layer**

- **MVP** : Single user (Marc)
- **V1.5** : RBAC 3 roles (Admin/Writer/Viewer)
- **V2.0** : Team permissions (shared dialogues, audit logs)

**5. Search & Index Layer**

- **MVP** : Basic search (filter côté client)
- **V1.0** : Full search & index (metadata, fast search, advanced filters)
- **V2.0** : Context Intelligence (embeddings RAG, auto-suggest contexte pertinent)

### Nouvelles Success Metrics

Les journeys révèlent **3 métriques manquantes** dans le PRD actuel :

**Autonomie (Journey Mathieu) :**

- **Metric** : % sessions Mathieu/Writer sans support Marc
- **Target** : >95%
- **Measurement** : Track support tickets, questions posées

**Onboarding (Journey Mathieu) :**

- **Metric** : Temps "nouveau user → 1er dialogue complet exporté"
- **Target** : <2H (idéal : <1H avec wizard)
- **Measurement** : Simulate new user journey, timer workflow

**Integration (Journey Thomas) :**

- **Metric** : % exports Unity sans erreurs schema
- **Target** : 100%
- **Measurement** : Validate all exports against schema custom Unity (automated tests)

### Test Strategy Révélée

**3 types de tests critiques** :

**1. Quality Tests (Journey Marc - context dropping) :**

- Test : "Context dropping detector" (detect lore explicite vs subtil)
- Test : "Lore accuracy checker" (detect contradictions GDD)
- Test : "Voice consistency checker" (tone personnage cohérent)
- **Implementation** : Unit tests (règles simples) + LLM judge (évaluation qualitative) + Human validation (ground truth)

**2. Resilience Tests (Journey Marc - edge cases) :**

- Test : LLM API down → fallback Anthropic (simulate OpenAI 503 → verify Anthropic called)
- Test : Session recovery → simulate crash → verify state restored
- Test : Conflict resolution → simulate concurrent edits → verify merge ou error
- **Implementation** : Integration tests (mock external services) + E2E tests (simulate failures)

**3. UX Tests (Journey Mathieu - autonomy) :**

- Test : Onboarding wizard → new user flow → verify 1st dialogue generated <2H
- Test : Autonomy → Mathieu generates dialogue without Marc help → 0 support tickets
- Test : Efficiency → time from "New dialogue" to "Export Unity" <1H
- **Implementation** : Playwright E2E tests (simulate user workflows) + Metrics tracking (analytics)

---