# Product Scope

### MVP - Minimum Viable Product (Sprint 1-2, ~1 semaine)

**Goal :** Débloquer la production immédiate. Atteindre le moment "aha!" Base.

**Must-Have :**

1. ✅ **Éditeur graphe fonctionnel** (fix display bug, connexions nœuds, édition basique)
2. ✅ **Génération continue + auto-link** (générer depuis choix, auto-connexion graphe)
3. ✅ **Validation structurelle** (DisplayName/stableID, nœuds vides, orphans, cycles)
4. ✅ **Export Unity fiable** (batch export, validation JSON schema)

**Success Criteria MVP :**

- Marc/Mathieu génèrent 1 nœud de qualité en <1min
- Génération batch 3-8 nœuds en <2min
- Export Unity sans erreurs (100% conformité schema)
- 0 bugs bloquants identifiés

### V1.0 - Editor Pro Foundation (Sprint 3-5, ~2-3 semaines)

**Goal :** Atteindre le moment "aha!" Top. Éditeur professionnel scalable.

**Should-Have (Pattern "Editor Pro") :**
5. 🟡 **Navigation Editor** (jump-to-node, search texte/acteur, focus auto)
6. 🟡 **Dialogue Database layer** (index/search, renommage/refactor, refs cassées)
7. 🟡 **Variable Inspector** (variables/flags, scénarios presets, simulation basique)
8. 🟡 **Simulation Coverage** (run dialogue, dead ends/unreachable, rapport)

**Success Criteria V1.0 :**

- Navigation fluide dialogues 500+ nœuds
- Refactoring (renommer acteur) propage automatiquement
- Simulation détecte >95% bugs structurels
- Production dialogue complet <4H

### V1.5 - Cost & Collaboration (Sprint 6-8, ~2-3 semaines)

**Goal :** Gouvernance coûts + collaboration équipe.

**Should-Have (Pattern "Cost Governance" + RBAC) :**
9. 🟡 **Cost Governance** (estimation coût, transparence prompt, logs/audit)
10. 🟡 **RBAC + Shared Dialogues** (admin/writer, dialogues partagés)
11. 🟡 **Template System v1** (templates instructions/auteur, personnalisation, validation)

**Success Criteria V1.5 :**

- Coûts LLM <0.01€ par nœud (optimisé)
- Marc + Mathieu collaborent sans friction
- Templates améliorent qualité +20% (LLM judge)

### V2.0 - Context Intelligence (Sprint 9-12, ~4 semaines)

**Goal :** Atteindre le moment "aha!" Vision. Optimisation contextuelle.

**Could-Have (Pattern "Context Intelligence") :**
12. 🟢 **Intelligent Context Selection** (extraction sous-parties pertinentes)
13. 🟢 **Hybrid Context Intelligence** (RAG + embeddings + règles)
14. 🟢 **Contextual Link Exploitation** (auto-suggest via liens JSON GDD)
15. 🟢 **Dialogue History Recommender** (re-utilisation contextes similaires)

**Success Criteria V2.0 :**

- Réduction tokens -50% (5000 → 2500 tokens/prompt)
- Pertinence contexte >90% (validation humaine)
- Workflow accéléré : 4H → 2H par dialogue complet

### V2.5 - Quality & Validation Pro (Sprint 13-15, ~3 semaines)

**Goal :** Industrialisation qualité narrative.

**Could-Have (Pattern "Quality & Validation") :**
16. 🟢 **Template Marketplace complet** (bibliothèque admin, A/B testing, scoring)
17. 🟢 **Template Quality Validation** (tests auto, LLM judge, feedback loop)
18. 🟢 **Multi-LLM Comparison** (génération simultanée, LLM judge, sélection)

**Success Criteria V2.5 :**

- Taux acceptation qualité >90%
- Feedback loop améliore templates automatiquement
- Multi-LLM réduit coûts -30%

### V3.0 - Advanced Features (Sprint 16+, ~6+ semaines)

**Goal :** Features avancées pour scale ultime.

**Nice-to-Have :**
19. ⚪ **Multi-LLM Provider Architecture** (support Anthropic/local)
20. ⚪ **Game System Integration** (conditions stats, effets relations)
21. ⚪ **Conditions/Variables DSL** (langage writer-friendly, validation)
22. ⚪ **Sequencer-lite RPG** (delta influence, unlock traits, hooks Unity)
23. ⚪ **Twine-like Passage Linking** (draft rapide texte, compilation JSON)
24. ⚪ **Git-like Narrative Versioning** (branches narratives, merge assisté)

**Success Criteria V3.0 :**

- Support 3+ LLM providers
- Game systems intégrés (conditions/variables/effets)
- Workflow hybride texte/graphe opérationnel

### Growth Features (Post-MVP)

**Déploiement progressif selon feedback production réelle :**

- DB migration (si filesystem devient douloureux)
- Advanced search (si volume nécessite)
- Dashboard analytics (si métriques critiques)
- Localization prep (si sortie internationale confirmée)

### Vision (Future)

**Long Terme (Post-2028) :**

- Voice-Over metadata integration
- Real-time collaboration (WebSockets)
- Multi-game support (réutilisabilité GDD)
- Community marketplace (templates partagés)
- Open-source release (si pertinent)