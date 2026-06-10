# Developer Tool / Web App Specific Requirements

### Project-Type Overview

DialogueGenerator est un **hybride Developer Tool + Web App** :

- **Developer Tool** : Outil de production narrative pour game devs / writers / content producers
- **Web App** : Interface React (SPA) consommant API REST FastAPI

**Target Users :**

- Content producers (Marc profile : content producer who learned to code)
- Writers / Narrative designers (Mathieu : game designer, usage occasionnel)
- Unity developers (Thomas : intégration dialogues in-game)
- Future : AA studios, indie RPG devs, narrative gaming community

---

### Technical Architecture Considerations

**1. Deployment Model : Cloud SaaS Hosted**

**Architecture :**

- **Hosting** : Cloud SaaS (URL publique accessible)
- **Backend** : FastAPI (Python) exposant API REST `/api/v1/`*
- **Frontend** : React + Vite + TypeScript (SPA, consomme API)
- **Data** : Filesystem + Git (MVP-V1.0), DB migration potentielle (V2.0+ si douloureux)
- **LLM Integration** : OpenAI API (MVP), multi-provider (Anthropic fallback V1.0)

**Deployment Process :**

- Build production : `npm run deploy:build`
- Deployment checklist : `docs/DEPLOYMENT.md`
- Environment variables : `ENVIRONMENT=production`, `CORS_ORIGINS`, `OPENAI_API_KEY`
- GDD files : Lien symbolique `data/GDD_categories/` (Notion-Scrapper export)

**Scalability :**

- MVP : Single instance (Marc + Mathieu + viewer)
- V1.5 : Support 3-5 concurrent users (RBAC : Admin/Writer/Viewer)
- V2.0+ : Scale 10+ users (si open-source communauté ou AA studios clients)

---

**2. API Surface : Internal API Only (MVP-V1.0)**

**Current Architecture :**

- **API REST interne** : `/api/v1/`* endpoints pour frontend React
- **Pas d'API publique externe** pour MVP/V1.0
- **Export manuel** : Download JSON Unity via UI

**Future API Publique (V2.0+ Potentielle) :**

**Use cases externes :**

- **Unity Plugin** : Import direct dialogues depuis DialogueGenerator (skip manual download)
- **CLI Tools** : Génération batch, export scripts, automation workflows
- **Notion Integration** : Sync bidirectionnel GDD (webhook Notion → auto-update DialogueGenerator)

**Decision Point :** API publique = V2.0+ si demande communauté ou clients AA studios.

---

**3. Documentation Strategy : Internal Team → External Community**

**MVP-V1.0 : Internal Team Documentation**

**Target audience :** Marc, Mathieu, writer futur, Thomas (Unity dev)

**Docs existantes :**

- `README.md` : Overview projet, quick start
- `docs/index.md` : Index documentation (architecture, API, data models)
- `docs/Spécification technique.md` : Specs détaillées (modules, workflow, storage)
- `docs/DEPLOYMENT.md` : Guide déploiement (prerequisites, checklist, troubleshooting)
- `docs/project-overview.md` : High-level overview

**Docs à ajouter (V1.0) :**

- **User Guide** : Workflow complet (sélection contexte → génération → export Unity)
- **Template Guide** : Comment créer/optimiser templates anti context-dropping
- **Troubleshooting** : FAQ, common errors, debug tips

**V1.5-V2.0 : External Community Documentation (si open-source)**

**Docs additionnelles :**

- **Installation Guide** : Self-hosted deployment (Docker, config, GDD setup)
- **API Reference** : Si API publique (endpoints, auth, examples)
- **Tutorial Videos** : Onboarding wizard, graph editor, generation workflow
- **Best Practices** : Prompting art, règles pertinence contexte, anti-slop strategies
- **Contributing Guide** : Si open-source (code style, PR process, community guidelines)

---

**4. Web App Architecture : SPA (Single Page Application)**

**Stack technique :**

- **Frontend** : React 18+ + TypeScript + Vite
- **Routing** : React Router (côté client, navigation fluide)
- **State Management** : React Context + hooks (ou Zustand si complexité croît)
- **UI Components** : Custom components + graph editor (React Flow based)
- **HTTP Client** : Fetch API ou Axios (appels API REST)

**Build & Performance :**

- **Dev mode** : `npm run dev` (Vite HMR, fast refresh)
- **Production** : `npm run deploy:build` (minification, tree-shaking, code splitting)
- **Bundle size target** : <500KB initial (gzip), lazy-load graph editor si >200KB

**Interface Structure :**

- **Layout** : 3 colonnes verticales (Contexte / Génération / Détails)
- **Colonne Contexte** : Sélection ressources GDD (personnages, lieux, objets, etc.) via onglets
- **Colonne Centrale** : Configuration scène (PJ/PNJ, région, instructions, templates)
- **Colonne Détails** : Affichage prompt (token usage, sections dépliables), résultat génération, export Unity
- **Référence complète** : `docs/features/current-ui-structure.md`

---

**5. Browser Support : Modern Browsers Only**

**Supported Browsers :**

- **Chrome** : Latest 2 versions (primary target)
- **Firefox** : Latest 2 versions
- **Edge** : Latest 2 versions (Chromium-based)
- **Safari** : Latest 2 versions (Mac users)

**NOT Supported :**

- IE11 (obsolète, pas de support)
- Legacy browsers (<2 ans)

**Browser Feature Requirements :**

- **ES2020** : Modules, async/await, optional chaining
- **Web APIs** : LocalStorage (auto-save), WebSockets (V2.0+ real-time)
- **Canvas / SVG** : Graph editor rendering (React Flow utilise SVG)

---

**6. Performance Targets**

**Graph Editor :**

- Rendering graphe 500+ nœuds : **<1s**
- UI interactions : **<100ms** (clicks, drag&drop)
- Large dialogues : Support 100+ nœuds par dialogue

**Initial Load Time :**

- **First Contentful Paint (FCP)** : <1.5s
- **Time to Interactive (TTI)** : <3s
- **Largest Contentful Paint (LCP)** : <2.5s

**API Response Times :**

- GET endpoints (list dialogues, GDD) : **<200ms**
- POST generation (1 nœud) : **<30s** (LLM latency dominant)
- Export Unity JSON : **<500ms**

---

**7. SEO & Accessibility**

**SEO : Not Required**

- DialogueGenerator = **outil SaaS privé** (accès authentifié)
- Si open-source : Site documentation séparé (Docusaurus) = SEO-friendly

**Accessibility : Basique MVP → Enhanced V2.0**

**MVP-V1.0 :**

- **Keyboard navigation** : Critique pour graph editor (Tab, Arrow keys, Enter/Space, Escape)
- **Color contrast** : WCAG AA minimum (4.5:1 texte, 3:1 UI)
- **Focus indicators** : Visible focus states

**V2.0+ (si open-source) :**

- **Screen readers** : ARIA labels, roles, live regions
- **Keyboard shortcuts** : Custom shortcuts (Ctrl+G = generate, Ctrl+S = save)
- **High contrast mode** : Theme alternative
- **Reduced motion** : `prefers-reduced-motion` support

---

**8. Real-Time Features : Phased Approach**

**MVP : No Real-Time**

- Save manuel (button "Save")
- Git commits (Marc manual workflow)
- Single-user édition

**V1.0 : Auto-Save Local**

- Auto-save toutes les 2min (LocalStorage + backend sync)
- Session recovery automatique

**V2.0+ : Real-Time Collaboration (Vision)**

- WebSockets (backend → frontend push notifications)
- Multi-user édition simultanée (Operational Transform ou CRDT)
- Conflict resolution (merge assisté)

---

### Implementation Considerations

**1. Security Model**

**Authentication & Authorization :**

- **MVP** : Basic auth (username/password, session tokens)
- **V1.5** : RBAC (Admin/Writer/Viewer roles)
- **V2.0** : OAuth2 / SSO (si clients AA studios)

**Data Security :**

- **Secrets** : Environment variables (jamais hardcodés)
- **API Keys** : LLM API keys stockées backend (jamais exposées frontend)
- **CORS** : Configured `CORS_ORIGINS` (éviter wildcard production)

---

**2. Error Handling & Resilience**

**LLM API Failures :**

- Retry logic (3 tentatives, exponential backoff)
- Fallback multi-provider (OpenAI → Anthropic si 503)
- User feedback (error messages clairs)

**Network Errors :**

- Offline detection (display banner "reconnecting...")
- Request queuing (auto-retry quand connexion restaurée)
- Data loss prevention (auto-save + LocalStorage backup)

---

**3. Testing Strategy**

**Backend (Python) :**

- `pytest tests/` (tous tests)
- Tests API : `pytest tests/api/` (TestClient FastAPI, mocks LLM/GDD)
- Coverage target : >80% code critique

**Frontend (React) :**

- `.\scripts\test-frontend.ps1` (build + lint + tests unitaires)
- Vitest (tests unitaires components)
- Playwright (E2E tests workflows complets)

**Integration :**

- E2E workflow : Sélection contexte → Génération → Export Unity
- Validation JSON Unity schema (100% conformité)

---