# Success Criteria

### User Success

**Le Moment "Aha!" - Progression de Valeur**

**Base (MVP)** : Générer un bon nœud de dialogue avec de bons choix joueur

- 1 nœud NPC de qualité
- 3-8 choix joueur pertinents et caractérisés
- Cohérence narrative avec le contexte GDD
- **Critère de succès** : Marc/Mathieu enregistre le nœud sans re-génération

**Top (V1.0)** : Générer d'un coup TOUS les nœuds répondant aux choix d'un nœud précédent

- Génération batch 3-8 nœuds en une passe
- Tous les nœuds de qualité (cohérence, caractérisation, agentivité)
- Auto-connexion dans le graphe (auto-link)
- **Critère de succès** : 80%+ des nœuds générés sont acceptés sans modification

**Vision (V2.0+)** : Dialogue complet à portée

- Génération itérative rapide (workflow fluide)
- Qualité constante sur centaines de nœuds
- Temps de production : quelques heures → dialogue complet validé
- **Critère de succès** : Production dialogue complet (100+ nœuds) en <4H

**Émotions Utilisateur Ciblées :**

- **Émerveillement** : "L'IA a capturé la voix du personnage !"
- **Confiance** : "Je peux itérer rapidement sans craindre de perdre le contrôle"
- **Efficacité** : "Je produis en 1H ce qui me prenait une semaine"

### Business Success

**Objectif Global :** Produire 1M+ lignes de dialogue (Disco Elysium+ scale) d'ici début 2028 pour le CRPG Alteir.

**Milestone 3 Mois (Avril 2026) - Préprod Ready**

- ✅ **Capacité** : Produire un dialogue complet validé en quelques heures
- ✅ **Usage** : Outil utilisé quotidiennement par Marc + Mathieu
- ✅ **Production** : 10-20 dialogues complets validés (test préprod)
- ✅ **Démarrage préprod** : Alteir narrative production officially starts
- **Success Metric** : Outil prouvé opérationnel pour préprod

**Milestone 12 Mois (Janvier 2027) - Production Industrielle**

- ✅ **Capacité** : Plusieurs dialogues complets par jour (2-3+)
- ✅ **Production** : 100+ dialogues complets produits (échelle validée)
- ✅ **Équipe** : Writer à plein temps opérationnel avec l'outil
- ✅ **Pipeline** : Workflow production → Unity → test gameplay fluide
- **Success Metric** : Production industrielle à l'échelle Disco Elysium

**Timeline Globale (2026-2028) :**

- **2026 Q1-Q2** : Tool MVP + préprod start (quelques dialogues/semaine)
- **2026 Q3-Q4** : Production ramp-up (1-2 dialogues/jour)
- **2027** : Production intensive (2-3+ dialogues/jour)
- **2028 Q1** : 1M+ lignes complétées, Alteir narrative content complete

### Technical Success

**Critère Principal : 0 Bug Bloquant**

DialogueGenerator va évoluer avec beaucoup de fonctionnalités. La métrique technique qui juge la production-readiness : **aucun bug qui empêche la production narrative**.

**Définition "Bug Bloquant" :**

- Éditeur graphe inutilisable (crash, rendering cassé, impossible d'éditer)
- Génération LLM fail >10% du temps (instabilité API)
- Export Unity produit JSON invalides (crash Unity import)
- Data loss (dialogues perdus, corruption fichiers)
- Performance dégradée (génération >5min, UI freeze)

**Critères Techniques Additionnels :**

**Stabilité :**

- Uptime >99% (outil toujours accessible)
- Zero data loss (auto-save, backup, versioning Git)
- Error recovery gracieux (retry LLM failures, validation feedback)

**Performance :**

- Génération 1 nœud : <30s (prompt + LLM + validation)
- Génération batch (3-8 nœuds) : <2min
- UI responsive : interactions <100ms
- Graphe 500+ nœuds : rendering <1s

**Scalabilité Prouvée :**

- 1000+ dialogues stockés sans ralentissement
- Search/navigation fluide sur large base
- Git repo performant (100+ MB dialogues)

**Quality Gates :**

- Tests E2E workflow complet (sélection contexte → génération → export Unity)
- Validation JSON Unity schema (100% conformité)
- Coverage code critique >80%

### Measurable Outcomes

**Primary Metrics (Priorité #1 - Qualité)** :

- **Taux d'acceptation qualité** : >80% dialogues enregistrés sans re-génération
- **Taux de re-génération** : <20% (indicateur qualité inversé)
- **Jugement LLM qualité** : Score moyen >8/10 (cohérence, caractérisation, agentivité)

**Secondary Metrics (Priorité #2 - Efficacité)** :

- **Temps moyen génération 1 nœud** : <30s
- **Temps moyen génération batch (3-8 nœuds)** : <2min
- **Temps production dialogue complet** : <4H (objectif initial), <2H (optimisé)
- **Volume production** : Dialogues complets générés par semaine/mois

**Tertiary Metrics (Priorité #3 - Coûts)** :

- **Coût par nœud généré** : <0.01€ (optimisé)
- **Coût par dialogue complet** : <1€ (100 nœuds)
- **Budget mensuel LLM** : <100€ (phase test), <500€ (production intensive)

**Business Impact Metrics** :

- **Production totale** : Dialogues complets validés (cumulative)
- **Lignes totales** : Progression vers 1M+ lignes (tracking)
- **Adoption utilisateur** : Marc + Mathieu usage quotidien (engagement)