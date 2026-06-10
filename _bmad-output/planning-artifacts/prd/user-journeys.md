# User Journeys

### Journey 1 : Marc - Le Power User / Content Producer

**Persona :** Marc  
*Content producer qui a appris à coder, pas dev qui apprend le contenu*

**Context & Background :**

- Utilise DialogueGenerator 40h/semaine (usage intensif)
- Expert du GDD Alteir (500 pages produites en 1 an avec LLM)
- Responsable qualité narrative finale
- Tolère la friction technique si contrôle total
- Mental workflow déjà efficace, besoin d'outils qui s'adaptent

**Primary Goal :** Produire des dialogues de qualité Disco Elysium scale en maximisant le contrôle créatif et la vitesse de production.

**Opening Scene - Le Problème Subtil :**

Marc génère un dialogue pour **Akthar-Neth** (personnage philosophe) discutant avec le joueur sur **Deimos** (lune-gardienne d'Amatru, monde sans étoiles).

**Génération LLM produit :**

> "Akthar : Oui, les étoiles brillent dans le ciel... Deimos les protège."

**❌ ERREUR DE LORE** : Le monde Amatru n'a PAS d'étoiles (lore établi : ciel vide gardé par Deimos).

**Frustration Marc :** *"Context dropping ENCORE. L'IA a reçu le GDD, mais elle n'a pas intégré la lore subtilement. Elle mentionne 'étoiles' explicitement alors que c'est une révélation narrative tardive que ce monde n'en a pas."*

**Rising Action - Le Workflow Actuel :**

1. **Itération manuelle** : Marc modifie le prompt pour renforcer "absence étoiles"
2. **Re-génération** : Nouveau nœud, meilleur mais encore trop explicite
3. **3ème tentative** : Enfin, un nœud subtil et philosophique :
  > "Akthar : Uresaïr médite sous Deimos... Certains cherchent ce qui n'existe plus. D'autres gardent ce qui demeure."

**✅ SUCCESS** : Le nœud capture la voice d'Uresaïr (calme, philosophique) ET la lore (Deimos gardien, absence étoiles) SANS l'expliquer explicitement.

**Climax - Le Moment "Aha!" :**

Marc sélectionne le nœud parfait. **Mais maintenant il a 8 choix joueur à développer.**

Il clique : **"Générer tous les nœuds suivants"**.

DialogueGenerator génère **batch 8 nœuds en 90 secondes**. Marc les review rapidement :

- **6/8 nœuds** : Qualité parfaite, acceptés immédiatement
- **2/8 nœuds** : Minimes ajustements (reformulation)

**🎯 Moment "Aha!" :** *"C'est ça. Je viens de produire en 2 minutes ce qui me prenait 1H. ET la qualité est là."*

**Resolution - Le Nouveau Workflow :**

Marc continue l'itération. En **3H**, il a :

- 1 dialogue complet (120 nœuds)
- 80% des nœuds générés acceptés sans modification
- Coût total : 0.75€ LLM
- Export Unity : JSON validé, 0 erreurs

**Milestone atteint** : Dialogue complet de qualité professionnelle en quelques heures.

**Emotional Arc :**

- **Frustration** (context dropping, lore explicite) → **Expérimentation** (itération prompts) → **Découverte** (node parfait) → **Émerveillement** (batch generation qualité) → **Confiance** (workflow rapide + contrôle)

**Edge Cases & Pain Points :**

1. **LLM API down** (OpenAI 503) :
  - **Current** : Génération échoue, Marc attend ou retry manuel
  - **Desired (V1.0)** : Fallback automatique Anthropic, 0 friction
2. **Context dropping récurrent** (lore non intégrée) :
  - **Current** : Itération manuelle prompts
  - **Desired (V2.0)** : Template System anti-context-dropping (instructions optimisées)
3. **Debug mystérieux** (génération échoue sans raison) :
  - **Current** : Marc examine logs backend manuellement
  - **Desired (V1.0)** : Debug Console avec chat LLM intégré (diagnostic automatique)
4. **Session loss** (crash navigateur) :
  - **Current** : Perte des modifications non sauvegardées
  - **Desired (V1.0)** : Auto-save toutes les 2min, recovery automatique

**Required Capabilities :**

- ✅ MVP : Génération continue + batch, validation structure, export Unity fiable
- 🟡 V1.0 : Multi-provider LLM (fallback), auto-save, debug console, RBAC
- 🟢 V2.0 : Template System (anti context-dropping), lore checker, LLM judge qualité

**Success Metrics :**

- **Qualité** : >80% nœuds acceptés sans re-génération
- **Efficacité** : <4H par dialogue complet (120 nœuds)
- **Coûts** : <1€ par dialogue complet
- **Stabilité** : 0 bugs bloquants, 0 data loss

---

### Journey 2 : Mathieu - Le Writer Occasionnel

**Persona :** Mathieu  
*Game Designer / Writer occasionnel, temps limité*

**Context & Background :**

- Utilise DialogueGenerator quelques heures/semaine (usage occasionnel)
- Connaît bien le lore Alteir, mais pas expert technique de l'outil
- Temps limité : veut produire rapidement sans friction
- Besoin d'autonomie : préfère ne pas appeler Marc pour chaque question
- Workflow idéal : wizard guidé, automation maximale

**Primary Goal :** Produire un dialogue de qualité rapidement (1-2H max) sans support technique externe.

**Opening Scene - La Découverte :**

Mathieu a une idée narrative : **"Taverne des Poutres Brisées"** (lieu) → Conversation NPC sur **Avili de l'Éternel Retour** (région mythique des Nids-Cités).

Il ouvre DialogueGenerator. **Dashboard intimidant** : nombreux champs, options avancées.

**Hésitation :** *"Par où commencer ? Je veux juste générer un dialogue simple..."*

**Rising Action - Le Workflow Guidé :**

**V1.0 : Wizard Onboarding activé automatiquement (mode Guided détecté).**

1. **Step 1** : "Quel lieu pour ce dialogue ?" → Mathieu tape "Taverne" → Liste filtrée apparaît : "Taverne des Poutres Brisées"
2. **Step 2** : "Quel personnage parle ?" → Mathieu sélectionne "NPC Tavernier"
3. **Step 3** : "Contexte ou thème ?" → Mathieu écrit : "Légende Avili Éternel Retour"
4. **Step 4** : "Instructions spéciales ?" → Template pré-rempli : *"Ton informel, ambiance taverne, révélation progressive lore"*

**Bouton** : **"Générer dialogue"**

**Climax - Le Moment "Connect-the-dots" :**

DialogueGenerator génère le 1er nœud :

> "Tavernier : T'as entendu parler des Nids-Cités ? Y'en a qui disent qu'Avili revient tous les cycles... Moi j'y crois pas, mais les vieux du coin jurent l'avoir vue."

**🎯 Moment "Aha!" :** *"Wow. L'IA a connecté les points : Taverne → Avili → Nids-Cités. Je n'ai pas eu à expliquer les liens, elle a compris le contexte."*

Mathieu génère 4 choix joueur, puis batch 4 nœuds suivants. **Tout fonctionne.**

**Resolution - Autonomie Atteinte :**

En **1H30**, Mathieu a :

- 1 dialogue complet (80 nœuds)
- Qualité validée (cohérence lore, ton approprié)
- Export Unity : prêt pour intégration
- **0 fois** : Besoin d'appeler Marc pour support

**Auto-save** : Mathieu ferme son navigateur pour une réunion. Quand il revient, **tout son travail est restauré automatiquement**.

**Emotional Arc :**

- **Hésitation** (interface intimidante) → **Guidance** (wizard clair) → **Découverte** (connect-the-dots auto) → **Confiance** (autonomie complète) → **Satisfaction** (production rapide sans friction)

**Edge Cases & Pain Points :**

1. **Interface trop complexe** (mode power par défaut) :
  - **Current (MVP)** : Mathieu hésite, appelle Marc
  - **Desired (V1.0)** : Détection automatique skill level → wizard guided activé
2. **Perte de travail** (navigateur fermé accidentellement) :
  - **Current (MVP)** : Modifications perdues
  - **Desired (V1.0)** : Auto-save toutes les 2min + recovery session automatique
3. **Recherche lente** (GDD 500 pages, difficile de trouver contexte pertinent) :
  - **Current (MVP)** : Recherche manuelle
  - **Desired (V1.0)** : Search & Index Layer (metadata search, filtres rapides)
4. **Qualité incertaine** (Mathieu pas sûr si le dialogue est bon) :
  - **Current (MVP)** : Demande validation à Marc
  - **Desired (V1.5)** : LLM judge qualité automatique (score 8/10) + suggestions

**Required Capabilities :**

- 🟡 V1.0 : Wizard Onboarding (guided mode), auto-save, search performante, mode detection
- 🟢 V1.5 : LLM judge qualité, templates pré-remplis, validation automatique
- 🟢 V2.0 : Context Intelligence (connect-the-dots automatique)

**Success Metrics :**

- **Autonomie** : >95% sessions sans support Marc
- **Efficacité** : <2H par dialogue complet (80 nœuds)
- **Onboarding** : <30min pour 1er dialogue complet produit

---

### Journey 3 : Sophie - Le Viewer / Productrice

**Persona :** Sophie  
*Productrice, stakeholder, lecture seule*

**Context & Background :**

- Ne produit pas de dialogues, mais suit la production
- Besoin de visibilité sur l'avancement (combien de dialogues produits, qualité, métriques)
- Consulte DialogueGenerator pour reporting stakeholders
- Utilise le graphe en mode lecture seule pour review narratif

**Primary Goal :** Suivre la production narrative et reporter aux stakeholders (investisseurs, CNC, équipe).

**Opening Scene - Le Besoin de Visibilité :**

Sophie prépare un rapport mensuel pour les investisseurs :

- **Question 1** : Combien de dialogues complets produits ce mois ?
- **Question 2** : Quelle est la qualité moyenne (taux acceptation) ?
- **Question 3** : Sommes-nous on track pour 1M lignes d'ici 2028 ?

**Current (MVP)** : Sophie envoie email à Marc : *"Peux-tu me donner les chiffres ?"*

**Rising Action - Dashboard Viewer :**

**V1.5 : RBAC activé. Sophie a un compte "Viewer".**

Elle se connecte à DialogueGenerator :

- **Dashboard** : Affiche métriques globales
  - **Dialogues produits** : 45 complets (ce mois : +12)
  - **Lignes totales** : 4,500 (progression : +1,200 ce mois)
  - **Taux acceptation qualité** : 82% (target : >80% ✅)
  - **Coût moyen** : 0.75€ par dialogue (target : <1€ ✅)

**Climax - Le Graphe en Lecture Seule :**

Sophie ouvre un dialogue : **"Akthar-Neth_Taverne_LegendeAvili"**.

Le graphe s'affiche en **mode lecture seule** (pas d'édition possible). Elle peut :

- Naviguer les nœuds
- Lire le contenu
- Voir les branches narratives

**🎯 Moment "Aha!" :** *"Je peux montrer ça aux investisseurs. Ils vont voir la complexité des dialogues produits."*

**Resolution - Reporting Autonome :**

Sophie génère un rapport PDF depuis DialogueGenerator (V1.5 feature) :

- Métriques de production (volume, qualité, coûts)
- Screenshots graphes dialogues clés
- Projection 2028 : **On track pour 1M lignes**

**Stakeholders validés.** Sophie n'a pas eu besoin de Marc pour les chiffres.

**Emotional Arc :**

- **Frustration** (dépendance Marc pour chiffres) → **Découverte** (dashboard viewer) → **Confiance** (données fiables) → **Satisfaction** (reporting autonome)

**Edge Cases & Pain Points :**

1. **Accès lecture seule non garanti** (risque édition accidentelle) :
  - **Current (MVP)** : Pas de RBAC, Sophie pourrait modifier par erreur
  - **Desired (V1.5)** : RBAC strict (Viewer = read-only garanti)
2. **Métriques indisponibles** (pas de dashboard analytics) :
  - **Current (MVP)** : Sophie demande à Marc
  - **Desired (V1.5)** : Dashboard analytics complet (métriques temps réel)

**Required Capabilities :**

- 🟡 V1.5 : RBAC (3 roles : Admin/Writer/Viewer), dashboard analytics, export PDF reporting

**Success Metrics :**

- **Autonomie** : >90% reporting sans support Marc
- **Fiabilité** : Métriques temps réel, 0 erreurs données

---

### Journey 4 : Thomas - Le Unity Dev / Intégrateur

**Persona :** Thomas  
*Unity Developer, responsable intégration dialogues in-game*

**Context & Background :**

- Utilise système de dialogue maison (codé en C# dans Unity) pour intégrer les dialogues
- Reçoit les JSON produits par DialogueGenerator (export Unity)
- Ne produit pas de dialogues, mais doit les intégrer sans friction
- Besoin : JSON 100% conformes au schema Unity custom (pas d'erreurs import)
- Edge case critique : Erreur schema → blocage pipeline

**Primary Goal :** Intégrer les dialogues dans Unity sans erreurs, tester in-game rapidement, détecter problèmes avant build production.

**Opening Scene - L'Import Échoue :**

Thomas ouvre DialogueGenerator (compte Viewer). Il voit :

- **"Akthar-Neth_Taverne_LegendeAvili"** - Status: **Exported**

Il télécharge le JSON, l'importe dans Unity via le système de dialogue maison.

**❌ ERREUR Unity :**

```
Invalid JSON schema - missing stableID on node 7
```

**Frustration Thomas :** *"Le JSON ne respecte pas le schema. Je dois demander à Marc de corriger... Encore une itération perdue."*

**Rising Action - Validation Stricte :**

**V1.0 : JSON Validation Unity stricte activée.**

Marc re-génère le dialogue. **Avant export**, DialogueGenerator exécute :

1. **Schema validation** : Vérifie tous les champs requis (stableID, DisplayName, etc.)
2. **Structure validation** : Vérifie cohérence nœuds/liens (pas d'orphans, cycles OK)
3. **Unity compatibility check** : Teste conformité 100% schema custom Unity

**Résultat** : **✅ Validation passed. Export autorisé.**

**Climax - L'Import Réussit :**

Thomas télécharge le nouveau JSON. Import Unity → **✅ Success. 0 erreurs.**

Il teste le dialogue in-game :

- Les choix joueur fonctionnent
- Les branches narratives sont cohérentes
- Les conditions/variables sont correctes

**🎯 Moment "Aha!" :** *"Enfin. DialogueGenerator garantit JSON Unity-ready. Je n'ai plus à debugger les exports."*

**Resolution - Pipeline Smooth :**

Thomas intègre 12 dialogues ce mois. **100% imports réussis, 0 erreurs schema.**

**Nouveau workflow** : DialogueGenerator → Export validé → Unity import → Test in-game → Production.

**Emotional Arc :**

- **Frustration** (import échoue, schema invalide) → **Découverte** (validation stricte activée) → **Confiance** (exports garantis valides) → **Efficacité** (pipeline sans friction)

**Edge Cases & Pain Points :**

1. **Schema Unity change** (système dialogue C# update) :
  - **Current (MVP)** : Exports cassés après update schema Unity
  - **Desired (V1.0)** : Validation schema paramétrable (accord dev Unity/IA pour évolutions)
2. **Test in-game lent** (besoin d'importer → build → tester) :
  - **Current (MVP)** : Workflow lourd
  - **Desired (V2.5)** : Simulation gameplay in-tool (preview branches sans Unity)
3. **Debugging erreurs in-game** (dialogue bugs, conditions incorrectes) :
  - **Current (MVP)** : Difficile de tracer l'origine (Unity logs peu clairs)
  - **Desired (V1.5)** : Export logs enrichis (metadata debug, trace génération)

**Required Capabilities :**

- ✅ MVP : Export Unity basique (JSON valide structure)
- 🟡 V1.0 : Validation JSON Unity stricte (100% conformité schema custom Unity)
- 🟡 V1.5 : Export logs enrichis (metadata debug)
- 🟢 V2.5 : Simulation gameplay in-tool (preview branches)

**Success Metrics :**

- **Integration** : 100% exports Unity sans erreurs schema
- **Efficacité** : <5min par dialogue pour import + test in-game
- **Fiabilité** : 0 bugs schema détectés post-import

---

