# Innovation & Novel Patterns

### Detected Innovation Areas

**1. First-Ever LLM-Assisted CRPG Dialogue Production at Disco Elysium+ Scale**

**Innovation :** DialogueGenerator vise à produire **1M+ lignes de dialogue** pour un CRPG de l'envergure de Disco Elysium/Planescape Torment/BG3, avec assistance LLM. **Vous êtes les premiers.**

**Context Market ([EQ-Bench Creative Writing](https://eqbench.com/creative_writing.html)) :**
- Écriture de livres avec LLM existe (inspiration possible)
- Outils game dev AI : Inworld (script assist/prototypage), mais pas production asset complet
- Prototypes recherche : GENEVA (narrative graph from constraints), mais pas packagé outil prod
- Chat-tree interfaces : tldraw branching chat, GitChat (gestion conversations en branches), mais pas pour dialogues ramifiés complexes avec contraintes/flags/conséquences

**Gap identifié :** Pas d'outil pour **production asset éditable** (type Yarn/Ink/Articy) avec contraintes fortes, tests automatiques, export propre, **at CRPG scale**.

**Différenciation clé :**
- **Scale** : 1M+ lignes (Disco Elysium+)
- **Quality** : Pas "AI slop", mais qualité narrative professionnelle
- **Outillage complet** : Génération + Édition graphe + Validation + Export Unity

**Competitive Defensibility :**

**NOT tech stack** (commodité : LLM API + React + FastAPI copiable en 6 mois)

**BUT domain expertise :**
- **Content producer profile** : Marc = rare profile (content producer who learned to code, not dev learning content)
- **Prompting art** : Templates anti context-dropping, accumulated know-how over hundreds of dialogues
- **Process innovation** : Two-phase quality (manual establishment → automated validation)

**First-mover window :** 6-12 mois avant que concurrents (Inworld, studios AA) copient tech.

**Long-term moat :** Si open-source (Vision future), competitive advantage devient **communauté** + **expertise documentée** (process, templates, best practices).

---

**2. Context Intelligence - Règles de Pertinence Explicites**

**Innovation :** La plupart des outils AI writing sont **"generic context-free"**. DialogueGenerator est **"deeply lore-aware"** via **système de règles de pertinence contexte**.

**Mechanism :**
- GDD 500 pages (Alteir) intégré dans contexte génération via Notion-Scrapper
- LLM ne génère pas dans le vide, mais **informé par lore massive**
- "Connect-the-dots" automatique : Taverne → Avili → Nids-Cités (Journey Mathieu)
- Context Intelligence (V2.0) : RAG + embeddings + **règles pertinence** pour extraction sous-parties pertinentes

**Core IP - Règles de Pertinence Contexte (Explicites, Outillées, Évolutives, Mesurables) :**

**Principe :** Pour chaque dialogue, déterminer **quelles parties GDD sont pertinentes** via règles explicites.

**Exemple règles :**
```
Dialogue Taverne_Conversation_Avili :
  → Lieu : Taverne des Poutres Brisées (description complète + ambiance)
  → Région : Nids-Cités (contexte géographique + culture)
  → Personnages présents : Akthar-Neth (profile complet + voice + backstory)
  → Thème discussion : Avili de l'Éternel Retour (légende + implications narratives)
  → Relations : Liens Akthar ↔ Avili, Taverne ↔ Région
  
  EXCLUSIONS :
  → Autres régions (non pertinentes pour ce dialogue)
  → Personnages absents (pas dans la scène)
  → Thèmes non abordés (pas dans instructions)
```

**Architecture système (V2.0) :**

**1. Règles Explicites (Configuration JSON/YAML) :**
```yaml
context_rules:
  dialogue_type: taverne_conversation
  required_entities:
    - type: lieu
      selector: by_name
      value: "Taverne des Poutres Brisées"
    - type: region
      selector: by_location_hierarchy
      value: auto_from_lieu
    - type: personnage
      selector: by_presence_scene
      value: ["Akthar-Neth"]
    - type: theme
      selector: by_keywords
      value: ["Avili", "Éternel Retour", "légende"]
  
  relations:
    - extract_links_between: [personnage, theme]
    - extract_links_between: [lieu, region]
  
  exclusions:
    - exclude_regions: all_except_current
    - exclude_personnages: all_except_present
```

**2. Outillage (Context Selection Service) :**
- **Context Builder** : Construit le contexte basé sur règles
- **Context Validator** : Vérifie pertinence (mesure overlap thème ↔ GDD extrait)
- **Context Optimizer** : Réduit tokens gardant pertinence maximale

**3. Évolutivité (Learning System) :**
- **Feedback loop** : Marc accepte/rejette nœuds → analyse quel contexte a produit qualité
- **Rule refinement** : Ajuste règles pertinence basées sur patterns qualité
- **Template optimization** : Templates évoluent avec règles

**4. Mesurabilité (Metrics) :**
- **Context relevance score** : % GDD extrait utilisé dans dialogue généré (target >80%)
- **Token efficiency** : Tokens contexte / Tokens dialogue généré (optimize ratio)
- **Quality correlation** : Corrélation entre contexte fourni ↔ qualité nœud (LLM judge score)

**Innovation architecturale :**

**Pas juste RAG générique**, mais **"business rules for narrative context selection"**.

**Différenciation :** Generic AI writing tools : RAG blind (embed tout, retrieve top-K). DialogueGenerator : **règles métier narratives** (quoi inclure, quoi exclure, pourquoi).

**Risque mitigé :** Si context windows LLMs explosent (GPT-5 = 10M tokens), RAG devient moins critique MAIS règles pertinence restent valuable (sélection intelligente > brute force full GDD).

---

**3. Anti "AI Slop" Quality System - Two-Phase Strategy**

**Innovation :** Système de qualité multi-layer pour garantir **0 "AI slop"** à l'échelle.

**Phase 1 (MVP-V1.0) : Établissement Style Manuel**
- Travail manuel sur **premières centaines de lignes** (ou premières lignes par personnage)
- Lignes retouchées ou **écrites à la main** si nécessaire
- LLM reçoit ce contexte → **continue dans le même style établi**

**Phase 2 (V1.5-V2.0) : Validation Multi-Layer Automatique**
- **Structure** : Nœuds vides, orphans, cycles
- **Schema** : Conformité JSON Unity custom
- **Lore** : Contradictions GDD, accuracy checker
- **Quality** : LLM judge score >8/10, voice consistency, anti context-dropping templates
- **Feedback loop** : Amélioration templates basée sur patterns qualité

**Référence benchmark :** [EQ-Bench Creative Writing v3](https://eqbench.com/creative_writing.html) - Slop Score **aligné** (60% slop words, 25% not-x-but-y, 15% slop trigrams, listes slop-forensics / [slop-score](https://github.com/sam-paech/slop-score)).

**Adaptation DialogueGenerator :** Benchmark **par run** (pas par modèle), critères mesurables adaptés CRPG dialogues.

---

**4. Iterative Generation IN Graph Editor**

**Innovation UX :** La plupart des éditeurs narratifs sont soit consultation (Articy, lourd) soit édition pure (Twine, linéaire). DialogueGenerator combine **génération LLM itérative + édition graphe temps réel**.

**Workflow révolutionnaire :**

1. **Generate** : Depuis nœud existant, générer batch 3-8 nœuds suivants
2. **Review** : Voir nœuds générés **immédiatement dans graphe** (pas liste séparée)
3. **Accept/Reject** : Inline review (clic droit → accept/reject, édition rapide)
4. **Iterate** : Re-générer nœuds rejetés avec instructions ajustées

**User pain point résolu (Journey Marc) :**
> "Marc génère batch 8 nœuds en 90 secondes. Il les review rapidement dans le graphe, 6/8 acceptés immédiatement."

**Différenciation :**
- **NOT** : Génération LLM séparée → import manuel dans éditeur (friction élevée)
- **BUT** : Génération intégrée dans éditeur, workflow fluide, itérations rapides

**Rare combination :**
- Graph editor 500+ nœuds performant (rendering <1s)
- AI batch insertion (3-8 nœuds en <2min)
- Auto-linking (connexions automatiques)
- Inline review (accept/reject dans graphe, pas UI séparée)

---

**5. Prompting as Art - Branching Dialogues Specificity**

**Innovation :** Le prompting pour **dialogues ramifiés CRPG** est un **art largement inexploré**.

**Spécificités techniques :**
- **Player Agency** : 3-8 choix significatifs (pas cosmétiques)
- **Branching Coherence** : Embranchements + reconvergences sans contradictions
- **Flags & Game Systems** : Conditions, variables, conséquences narratives
- **Tone Consistency** : Voice distinctive par personnage sur centaines de nœuds

**Innovation prompting :**
- Templates anti context-dropping (subtilité lore vs explicite)
- Instructions structurées (V1.5) : Situations → Choix → Conséquences
- Multi-LLM comparison (V2.5) : Génération simultanée, LLM judge, sélection best

**Market gap :** Outils existants visent **conversation dynamique temps réel** (NPC), pas **production asset structuré avec contraintes fortes**.

---

### Validation Approach

**Comment prouver que ça marche ?**

**1. Benchmark Adapté (EQ-Bench style)**

Inspiré de [EQ-Bench Creative Writing](https://eqbench.com/creative_writing.html), mais évaluer **runs** (pas modèles) :

**Metrics DialogueGenerator (4 catégories) :**

1. **Structural Quality (automated) :**
   - **Player agency %** : % choix significatifs vs cosmétiques (target >80%)
   - **Branching ratio** : Embranchements / Reconvergences (sweet spot 1.2-1.5)
   - **Coverage %** : % états jeu accessibles via dialogues (target >95%)
   - **Dead ends %** : % nœuds sans sortie (target 0%)

2. **Narrative Quality (LLM judge) :**
   - **Lore accuracy** : % dialogues sans contradictions GDD (target 100%)
   - **Voice consistency** : Tone score par personnage 0-10 (target >8)
   - **Subtilité** : Context dropping score 0-10, 10 = subtil (target >8)
   - **Agentivité** : Choix impact score 0-10 (target >7)

3. **Slop Detection (automated) :**
   - **GPT-isms frequency** : Liste mots/phrases overused ("delve", "tapestry", "multifaceted")
   - **Repetition score** : Bigrams/trigrams répétés (lower = better)
   - **Generic patterns** : "I understand", "Let me explain", "It's important to note"

4. **Production Efficiency (metrics) :**
   - **Time per dialogue** : Target <4H (MVP), <2H (V2.0 optimisé)
   - **Cost per node** : Target <0.01€
   - **Acceptance rate** : Target >80%

**Implementation :**
- Rubric scoring automatique (tests scripts)
- Feedbacks humains (Marc/Mathieu review = ground truth)
- Dashboard metrics temps réel (V1.5)

---

**2. Benchmark vs Disco Elysium Dialogues (Anonymized)**

**Concept :** Tester qualité DialogueGenerator contre dialogues jeux célèbres (leaked data).

**Methodology :**
1. **Scrape dialogues** : Disco Elysium dialogues (leaked, anonymiser termes reconnaissables)
2. **Anonymisation** : Remplacer noms personnages, lieux, concepts → termes génériques (éviter biais LLM)
3. **Génération parallèle** : Run DialogueGenerator sur mêmes scénarios (ex : "Taverne conversation philosophique")
4. **Comparison metrics** : Player agency, branching complexity, tone consistency, slop score
5. **Target** : Atteindre 80%+ qualité Disco Elysium

**Risk mitigation :**
- **Double-blind test** : Reviewer humain ne sait pas quelle source (DialogueGenerator vs Disco)
- **Anonymisation stricte** : LLM ne doit pas reconnaître jeu source (sinon biais)

---

**3. Production Validation (Real-World)**

**MVP-V1.0 :**
- **10-20 dialogues complets** validés (test préprod)
- Marc/Mathieu usage quotidien (engagement)
- Taux acceptation >80% (quality gate)

**V1.5-V2.0 :**
- **100+ dialogues complets** produits (échelle validée)
- Writer à plein temps opérationnel (scalability proof)
- Production industrielle : 2-3+ dialogues/jour

---

### Risk Mitigation

**Risque Principal :** L'innovation ne scale pas. Qualité se dégrade à l'échelle, ou coûts explosent.

**Fallback Strategy :**

**Plan B : Dialogues en Losange Classiques**
- Réduire complexité branching (moins d'embranchements, plus de reconvergences rapides)
- Structure plus linéaire (moins d'agentivité joueur)
- Réduction scope : Moins de lignes totales

**Plan C : Plus de Retouches Humaines**
- Ratio humain/IA inversé : LLM = draft initial, humain = édition lourde
- Workflow : LLM génère → Marc/Mathieu réécrivent 50%+ des nœuds
- Coût : Temps production x2-3, mais qualité garantie

**Plan D : Moins d'IA**
- Réduction usage LLM aux moments critiques uniquement (NPC importants, révélations narratives)
- Dialogues secondaires : écriture manuelle classique ou templates simples
- Coût : Temps production x5-10, mais risque qualité éliminé

---

**Indicateurs Déclencheurs Fallback :**

1. **Quality Degradation** : Taux acceptation <60% (target >80%)
2. **Cost Explosion** : Coût >0.05€ par nœud (target <0.01€)
3. **Time Inefficiency** : Temps dialogue complet >8H (target <4H)
4. **Slop Detection** : Slop Score >30% (detection GPT-isms récurrent)

**Décision Fallback :** Si 2+ indicateurs déclenchés pendant 2 sprints consécutifs → activer Plan B/C/D.

---

### Market Context & Competitive Landscape

**Landscape Analysis :**

**1. Prototypes Recherche**
- **GENEVA** : Génération narrative graph from constraints (le plus proche conceptuellement)
- **Gap** : Pas packagé outil prod, pas d'export asset éditable

**2. Outils Game Dev AI**
- **Inworld** : Script assist, prototypage rapide, accélération écriture
- **Gap** : Pas production asset complet avec contraintes fortes, tests, export

**3. Chat-Tree Interfaces**
- **tldraw branching chat** : Interface conversation en arbre + intégration AI
- **GitChat** : Gestion conversations LLM en branches (nœuds, contexte)
- **Gap** : Pas pour dialogues ramifiés CRPG (flags, conséquences, game systems)

**4. Outils Narratifs Classiques**
- **Articy Draft** : Pro, intimidant, pas d'AI assist
- **Twine/Ink** : Casual, limité scale, pas d'AI assist
- **Gap** : Aucun outil combine AI assist + scale CRPG + dual-mode UX

---

**Positionnement DialogueGenerator :**

**Niche Unique :** Premier outil production asset narratif ramifié, AI-assisted, CRPG scale, deeply lore-aware, anti-slop quality system.

**Market Opportunity :**
- Indie RPG devs (budget limité, besoin scale narrative)
- AA studios (production dialogues intensive, qualité professionnelle)
- Content producers (comme Marc) qui learned to code, pas devs learning content

**Timing :** LLMs (OpenAI, Anthropic) ont atteint qualité suffisante pour narrative authoring (2023-2024). Prompting techniques émergent. **Timing optimal pour innover.**

---

### Business Value & Market Impact

**Problem Solved :**

**Challenge actuel :**
- Produire 1M+ lignes dialogue qualité Disco Elysium = **impossible manuellement**
- Disco Elysium : 4 ans dev, 1M words (~600K dialogue lines estimate), équipe ~20 personnes
- Cost manual : ~50€/H writer professionnel x 10,000H (estimate 1M lines) = **500K€ minimum**
- Timeline manual : 3-5 ans (trop lent pour Alteir roadmap 2028)

**DialogueGenerator Solution :**
- **Cost réduit -90%** : LLM-assisted → 5€/H équivalent (50€/H → 5€/H grâce automation)
- **Timeline réduit -80%** : 5 ans → 1 an pour 1M lines (2026-2028)
- **Rend faisable** : CRPG Disco Elysium scale pour budgets AA/indie (Alteir devient réalisable)

**Business Impact :**
- **Alteir project unlocked** : Sans DialogueGenerator, scope réduit ou projet avorté
- **Market unlock** : Narrative-rich CRPGs accessibles à plus de créateurs (indie devs, AA studios, content producers)

---

**Market Opportunity (Vision Future) :**

**TAM (Total Addressable Market) :**
- **Indie RPG devs** : Milliers projets (Kickstarter, Discord, itch.io)
- **AA studios** : Dizaines studios (besoin production narrative industrielle)
- **Content producers** : Profile Marc (rare mais croissant avec LLMs)

**Business Model Potentiel (Post-Alteir) :**
- **Open-source core** : DialogueGenerator base (community building)
- **SaaS premium** : Hosting, LLM API management, templates marketplace, analytics dashboard
- **Community** : Narrative designers, writers CRPG, partage patterns anti context-dropping

**Competitive Strategy :**
- **First-mover advantage** : 6-12 mois window (documenter process agressivement)
- **Long-term moat** : Communauté + expertise documentée (process, templates, best practices)
- **Open-source friendly** : Marc = pas contraintes IP, vision open-source

---

