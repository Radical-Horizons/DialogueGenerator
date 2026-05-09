# Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach : Problem-Solving MVP**

DialogueGenerator MVP vise à **débloquer la production immédiate** de dialogues CRPG qualité Disco Elysium avec assistance LLM.

**Problem Solved :**

- **Manual production impossible** : 1M+ lignes à la main = 3-5 ans, 500K€+
- **Quality at scale challenge** : Maintenir qualité narrative sur volume massif
- **Blocker actuel** : Éditeur graphe non fonctionnel, workflow incomplet

**MVP Philosophy :**

- **Minimum that works** : 4 features critiques (éditeur graphe fonctionnel, génération continue + auto-link, validation structurelle, export Unity fiable)
- **User value immediate** : Marc/Mathieu génèrent 1 nœud qualité en <1min dès MVP
- **Foundation for scale** : Architecture supportant évolution vers 1M+ lignes sans refactoring majeur

**Validation Learning :**

- **Success metric MVP** : Marc/Mathieu produisent 10-20 dialogues complets validés (test préprod) en 3 mois
- **Key question** : Est-ce que le workflow LLM-assisted + graph editor permet de maintenir qualité Disco Elysium à l'échelle ?
- **Pivot triggers** : Si taux acceptation <60% ou coût >0.05€/nœud → fallback Plans B/C/D (dialogues losange, plus de retouches humaines, moins d'IA)

---

**Resource Requirements**

**MVP (Sprint 1-2, ~1 semaine) :**

- **Team** : Marc solo (dev + content producer)
- **Skills** : Full-stack (Python/FastAPI + React/TypeScript), LLM integration (OpenAI API), graph editor (React Flow)
- **Infrastructure** : Cloud hosting (backend + frontend), OpenAI API access, Git repo

**V1.0-V1.5 (Sprint 3-8, ~4-6 semaines) :**

- **Team** : Marc (dev) + Mathieu (testeur/feedback) + éventuellement IA dev assistant
- **Skills additionnelles** : Database/search (V1.0), RBAC/auth (V1.5), cost governance (V1.5)

**V2.0+ (Sprint 9+, ~10+ semaines) :**

- **Team expansion potentielle** : Writer à plein temps (production narrative), Unity dev (intégration), communauté (si open-source)
- **Skills additionnelles** : RAG/embeddings (Context Intelligence V2.0), template optimization (V2.5), multi-LLM orchestration (V2.5)

---

### MVP Feature Set (Phase 1)

**Core User Journeys Supported :**

**MVP supporte uniquement Journey Marc (power user) :**

- Marc génère 1 nœud de qualité en <1min
- Marc génère batch 3-8 nœuds en <2min
- Marc édite/connecte nœuds dans graphe fonctionnel
- Marc exporte dialogue vers Unity JSON (100% conformité schema)

**Journeys Mathieu, Sophie, Thomas = Post-MVP** (V1.0-V1.5)

---

**Must-Have Capabilities (MVP) :**

1. ✅ **Éditeur graphe fonctionnel**
  - Fix display bug (rendering cassé actuellement)
  - Connexions nœuds (drag & drop, auto-link)
  - Édition basique (add/delete/modify nodes)
  - Performance : 100+ nœuds rendering <1s
2. ✅ **Génération continue + auto-link**
  - Générer depuis choix joueur existant
  - Batch generation (3-8 nœuds en <2min)
  - Auto-connexion graphe (link nouveaux nœuds automatiquement)
  - Context GDD intégré (sélection manuelle sections pertinentes)
3. ✅ **Validation structurelle**
  - DisplayName/stableID validation (champs requis Unity)
  - Nœuds vides detection (erreur si text manquant)
  - Orphans detection (nœuds non connectés au graphe)
  - Cycles detection (boucles infinies)
4. ✅ **Export Unity fiable**
  - Batch export (tous dialogues ou sélection)
  - Validation JSON schema Unity custom (100% conformité)
  - Format JSON optimisé (lisible + compact)
  - Download file (browser save dialog)

---

### Post-MVP Features

**Phase 2 : V1.0 - Editor Pro Foundation (Sprint 3-5, ~2-3 semaines)**

**Goal :** Atteindre moment "Aha!" Top (batch 3-8 nœuds 80%+ acceptés). Éditeur professionnel scalable.

**Should-Have (Pattern "Editor Pro") :**
5. 🟡 **Navigation Editor** : Jump-to-node, search texte/acteur, focus auto
6. 🟡 **Dialogue Database layer** : Index/search, renommage/refactor, refs cassées
7. 🟡 **Variable Inspector** : Variables/flags, scénarios presets, simulation basique
8. 🟡 **Simulation Coverage** : Run dialogue, dead ends/unreachable, rapport

**Success Criteria V1.0 :**

- Navigation fluide dialogues 500+ nœuds
- Refactoring (renommer acteur) propage automatiquement
- Simulation détecte >95% bugs structurels
- Production dialogue complet <4H

**User Journey Unlocked :** Mathieu (casual writer) peut utiliser l'outil avec wizard onboarding

---

**Phase 3 : V1.5 - Cost & Collaboration (Sprint 6-8, ~2-3 semaines)**

**Goal :** Gouvernance coûts + collaboration équipe (Marc + Mathieu + writer futur).

**Should-Have (Pattern "Cost Governance" + RBAC) :**
9. 🟡 **Cost Governance** : Estimation coût, transparence prompt, logs/audit
10. 🟡 **RBAC + Shared Dialogues** : Admin/writer/viewer, dialogues partagés
11. 🟡 **Template System v1** : Templates instructions/auteur, personnalisation, validation

**Success Criteria V1.5 :**

- Coûts LLM <0.01€ par nœud (optimisé)
- Marc + Mathieu collaborent sans friction
- Templates améliorent qualité +20% (LLM judge)

**User Journeys Unlocked :** Sophie (viewer, reporting) + Thomas (Unity dev, validation JSON stricte)

---

**Phase 4 : V2.0 - Context Intelligence (Sprint 9-12, ~4 semaines)**

**Goal :** Atteindre moment "Aha!" Vision (dialogue complet en <2H optimisé). Optimisation contextuelle.

**Could-Have (Pattern "Context Intelligence") :**
12. 🟢 **Intelligent Context Selection** : Extraction sous-parties pertinentes (règles explicites, outillées, évolutives, mesurables)
13. 🟢 **Hybrid Context Intelligence** : RAG + embeddings + règles métier
14. 🟢 **Contextual Link Exploitation** : Auto-suggest via liens JSON GDD
15. 🟢 **Dialogue History Recommender** : Re-utilisation contextes similaires

**Success Criteria V2.0 :**

- Réduction tokens -50% (5000 → 2500 tokens/prompt)
- Pertinence contexte >90% (validation humaine)
- Workflow accéléré : 4H → 2H par dialogue complet

---

**Phase 5 : V2.5 - Quality & Validation Pro (Sprint 13-15, ~3 semaines)**

**Goal :** Industrialisation qualité narrative (writer à plein temps opérationnel, 2-3+ dialogues/jour).

**Could-Have (Pattern "Quality & Validation") :**
16. 🟢 **Template Marketplace complet** : Bibliothèque admin, A/B testing, scoring
17. 🟢 **Template Quality Validation** : Tests auto, LLM judge, feedback loop
18. 🟢 **Multi-LLM Comparison** : Génération simultanée, LLM judge, sélection best

**Success Criteria V2.5 :**

- Taux acceptation qualité >90%
- Feedback loop améliore templates automatiquement
- Multi-LLM réduit coûts -30%

---

**Phase 6 : V3.0 - Advanced Features (Sprint 16+, ~6+ semaines)**

**Goal :** Features avancées pour scale ultime (support 1M+ lignes, game systems intégrés).

**Nice-to-Have :**
19. ⚪ **Multi-LLM Provider Architecture** : Support Anthropic/local LLM (Ollama)
20. ⚪ **Game System Integration** : Conditions stats, effets relations, hooks Unity
21. ⚪ **Conditions/Variables DSL** : Langage writer-friendly, validation, preview
22. ⚪ **Sequencer-lite RPG** : Delta influence, unlock traits, hooks Unity
23. ⚪ **Twine-like Passage Linking** : Draft rapide texte, compilation JSON
24. ⚪ **Git-like Narrative Versioning** : Branches narratives, merge assisté LLM

**Success Criteria V3.0 :**

- Support 3+ LLM providers
- Game systems intégrés (conditions/variables/effets)
- Workflow hybride texte/graphe opérationnel

---

**Phase 7 : Growth Features (Post-MVP, déploiement progressif)**

**Déploiement conditionnel selon feedback production réelle :**

- **DB migration** : Si filesystem devient douloureux (1000+ dialogues, search lente)
- **Advanced search** : Si volume nécessite (metadata search, filters avancés)
- **Dashboard analytics** : Si métriques critiques (coûts LLM, qualité trends)
- **Localization prep** : Si sortie internationale confirmée (Alteir multi-langue)

**Decision Point :** Features ajoutées uniquement si douleur identifiée en production.

---

**Phase 8 : Vision (Future, Post-2028)**

**Long Terme :**

- **Voice-Over metadata integration** : Prep enregistrements audio (acteurs, timing)
- **Real-time collaboration** : WebSockets, multi-user édition simultanée
- **Multi-game support** : Réutilisabilité GDD, templates cross-projects
- **Community marketplace** : Templates partagés, patterns anti-slop, open-source
- **Open-source release** : Si pertinent (vision Marc = open-source friendly)

---

### Risk Mitigation Strategy

**Technical Risks**

**Risk 1 : LLM Quality Degradation at Scale**

- **Problem** : Qualité dialogue se dégrade quand volume augmente (context dropping, AI slop, repetition)
- **Mitigation MVP** : Two-phase quality system
  - Phase 1 : Travail manuel premières centaines lignes (établir style par personnage)
  - Phase 2 : LLM continue dans style établi (context enrichi)
- **Mitigation V1.5-V2.0** : Validation multi-layer (structure, schema, lore, quality LLM judge)
- **Fallback** : Plans B/C/D (dialogues losange, plus humain, moins IA)

**Risk 2 : Architecture ne Scale Pas**

- **Problem** : Filesystem + Git ne supporte pas 1000+ dialogues (search lente, performance dégradée)
- **Mitigation MVP** : Architecture designed for scale (filesystem OK jusqu'à 1000+ dialogues)
- **Mitigation V1.0** : Search & Index Layer (navigation fluide)
- **Fallback V2.0** : DB migration si douloureux (décision data-driven, pas YAGNI premature)

**Risk 3 : Context Intelligence Échec**

- **Problem** : Règles pertinence contexte ne capturent pas la logique narrative (context trop large ou trop étroit)
- **Mitigation V2.0** : Règles explicites, outillées, évolutives, mesurables (feedback loop amélioration)
- **Fallback** : Manual context selection (Marc expertise, pas automation)

---

**Market Risks**

**Risk 1 : LLM-Assisted Narrative Pas Viable Qualitativement**

- **Problem** : LLM produit qualité insuffisante (AI slop, genericité, perte authorial control)
- **Validation MVP** : 10-20 dialogues complets validés en 3 mois (taux acceptation >80%)
- **Mitigation** : Anti-slop quality system (two-phase + validation multi-layer)
- **Fallback** : Réduction ratio IA (50% LLM draft → 50% human rewrite)

**Risk 2 : Marché Trop Niche**

- **Problem** : Seul Marc utilise l'outil (pas de demande externe, pas de communauté)
- **Validation V1.0** : Mathieu usage autonome (>95% sessions sans support Marc)
- **Validation V2.0** : Writer à plein temps opérationnel (production 2-3+ dialogues/jour)
- **Pivot** : Si marché niche confirmé, focus outil interne Alteir uniquement (pas open-source)

**Risk 3 : Concurrents Copient Rapidement**

- **Problem** : Inworld ou studios AA copient tech DialogueGenerator en 6-12 mois (first-mover window court)
- **Mitigation** : Documenter process agressivement, build communauté si open-source (moat = expertise + communauté, pas tech)
- **Acceptance** : Tech copiable OK si Marc veut open-source (vision = partage, pas monopole)

---

**Resource Risks**

**Risk 1 : Marc Seul, Bandwidth Limité**

- **Problem** : Marc = dev + content producer + PM, bandwidth limité pour dev tool + production Alteir
- **Mitigation MVP** : MVP lean (1 semaine, 4 features critiques)
- **Mitigation V1.0** : Mathieu testeur actif (feedback, bug reports)
- **Fallback** : Réduction scope (focus MVP + V1.0, skip V2.0+ si bandwidth insuffisant)

**Risk 2 : Budget LLM Coûts Explosent**

- **Problem** : Production 1M lignes = coûts LLM élevés (si >0.01€/nœud → 10K€+)
- **Mitigation MVP** : Monitoring coûts dès MVP (logs, estimation avant génération)
- **Mitigation V1.5** : Cost Governance (transparence, audit, rate limits)
- **Fallback** : Multi-LLM (V2.5, providers moins chers), local LLM (V3.0, Ollama)

**Risk 3 : Writer Futur Pas Autonome**

- **Problem** : Writer nécessite support Marc constant (pas scalable)
- **Mitigation V1.0** : Wizard onboarding (guided mode, templates pré-remplis)
- **Mitigation V1.5** : Templates + documentation (best practices, troubleshooting)
- **Validation** : Taux autonomie >95% (sessions sans support Marc)

---

**Timeline & Resource Summary**

**Total Estimated Timeline : ~~20-25 semaines (~~5-6 mois)**

- MVP : 1 semaine
- V1.0 : 2-3 semaines
- V1.5 : 2-3 semaines
- V2.0 : 4 semaines
- V2.5 : 3 semaines
- V3.0 : 6+ semaines
- Growth/Vision : Ongoing (post-V3.0)

**Critical Path to Business Goal (1M lines by 2028) :**

- **Q1 2026** (maintenant) : MVP + V1.0 (préprod ready)
- **Q2 2026** : V1.5 (collaboration équipe, cost governance)
- **Q3-Q4 2026** : Production ramp-up (1-2 dialogues/jour)
- **2027** : Production intensive (2-3+ dialogues/jour, writer full-time)
- **2028 Q1** : 1M+ lignes complétées (Alteir narrative content complete)

**Scope is Ambitious But Achievable Given :**

- Marc = experienced content producer + developer (rare profile)
- LLM tech mature (OpenAI API quality sufficient for narrative authoring)
- Architecture scalable (filesystem → DB migration si nécessaire)
- Fallback plans clear (Plans B/C/D si innovation échec)

---