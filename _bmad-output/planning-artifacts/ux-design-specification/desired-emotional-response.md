# Desired Emotional Response

> ⚠️ **Remplacée le 2026-11-20 pour tout écran repris par l'epic 20 (refonte « Scène »).** Font foi :
> [`docs/design/refonte-scene/README.md`](../../../docs/design/refonte-scene/README.md) (écrans, composants,
> raccourcis, table « où va chaque fonction »), les boards `docs/design/refonte-scene/*.dc.html`,
> [`docs/architecture/refonte-scene-architecture.md`](../../../docs/architecture/refonte-scene-architecture.md)
> (A1–A16) et [`epic-20.md`](../epics/epic-20.md). En cas de contradiction, la refonte l'emporte. Restent valables :
> la charte de `design-system-foundation.md` (couleurs, polices, filets, un seul bouton bleu) et les exigences
> d'accessibilité générales. Ce document est conservé pour l'historique ; ne pas en tirer de critère d'acceptation.

## Primary Emotional Goals

**Concentration & Flow (état de travail optimal)**
- L'utilisateur entre dans un état de **concentration profonde** où l'outil disparaît
- Le workflow "Generate Next" devient **fluide et automatique** — pas de friction cognitive
- Sensation de **flow** : l'utilisateur se concentre sur le contenu créatif, pas sur l'outil
- L'outil est un **instrument de travail transparent** qui ne distrait pas de la création narrative

**Satisfaction de la qualité IA (micro-niveau)**
- **Satisfaction immédiate** quand l'IA génère un nœud pertinent et bien écrit
- Sentiment de **collaboration efficace** avec l'IA (80%+ nœuds acceptés sans modification)
- **Confiance** dans la génération : l'utilisateur sait que l'IA comprend le contexte
- **Délice** occasionnel : surprise positive quand l'IA propose quelque chose d'inattendu mais pertinent

**Efficacité productive (macro-niveau)**
- Sentiment d'**accomplissement** : générer des centaines de nœuds en ≤1H
- **Productivité visible** : le graphe se construit rapidement, progression claire
- **Contrôle** : l'utilisateur maîtrise le processus, pas submergé par la complexité
- **Fiabilité** : l'outil ne casse pas, les données ne se perdent pas (zero data loss)

## Emotional Journey Mapping

**Première découverte :**
- **Curiosité** : "Comment ça marche ?" → Interface claire, pas de confusion initiale
- **Confiance** : L'outil semble professionnel et fiable (pas de bugs visibles)

**Pendant le workflow "Generate Next" (boucle principale) :**
- **Concentration** : Focus sur le contenu, l'outil reste en arrière-plan
- **Flow** : Rythme régulier, pas d'interruptions, progression fluide
- **Expectative positive** : Attente confiante de la génération IA (pas d'anxiété)
- **Satisfaction micro** : Plaisir à voir chaque nœud bien généré

**Après complétion d'un dialogue :**
- **Accomplissement** : Fierté d'avoir créé un dialogue complet
- **Satisfaction** : Le travail est bien fait, prêt pour Unity
- **Confiance** : L'export est fiable, pas de corruption

**En cas d'erreur (génération échoue, bug) :**
- **Frustration minimisée** : Retry clair, pas de perte de travail (auto-save)
- **Confiance dans la récupération** : L'outil gère les erreurs gracieusement
- **Pas d'anxiété** : L'utilisateur sait qu'il peut réessayer sans conséquences

**Retour à l'outil :**
- **Familiarité** : L'interface est cohérente, pas besoin de réapprendre
- **Reprise rapide** : Session recovery, l'utilisateur reprend où il en était
- **Efficacité immédiate** : Pas de friction pour recommencer à travailler

## Micro-Emotions

**Confiance vs Confusion :**
- **Confiance** : L'utilisateur sait toujours où il en est dans le graphe (auto-focus, highlight)
- **Confiance** : Les connexions auto-apply sont fiables, pas besoin de vérifier
- **Éviter confusion** : Navigation claire, labels explicites au survol (barre 4 résultats)

**Confiance vs Scepticisme :**
- **Confiance** : L'auto-apply des connexions fonctionne correctement (pas de bugs)
- **Confiance** : L'auto-save protège le travail (zero data loss)
- **Éviter scepticisme** : Feedback visible ("Sauvegardé il y a Xs"), statut génération toujours visible

**Excitement vs Anxiété :**
- **Excitement positif** : La génération IA est un moment intéressant (streaming visible)
- **Éviter anxiété** : Pas d'incertitude sur "est-ce que ça marche ?" (progression claire)
- **Éviter anxiété** : Pas de peur de perdre le travail (auto-save, session recovery)

**Accomplissement vs Frustration :**
- **Accomplissement** : Progression visible (graphe qui grandit, nœuds qui s'ajoutent)
- **Accomplissement** : Critère de succès clair (80%+ nœuds acceptés)
- **Éviter frustration** : Pas de bugs bloquants, retry facile, pas de perte de temps

**Délice vs Satisfaction basique :**
- **Délice occasionnel** : Surprise positive quand l'IA propose quelque chose d'inattendu mais pertinent
- **Satisfaction régulière** : Chaque nœud bien généré apporte une petite satisfaction
- **Éviter satisfaction basique** : L'outil doit dépasser les attentes, pas juste fonctionner

## Design Implications

**Pour favoriser Concentration & Flow :**
- **Minimiser les interruptions** : Auto-save silencieux, pas de modals bloquantes
- **Feedback discret** : Indicateurs visuels subtils (pas de popups agressives)
- **Workflow fluide** : Réduire les clics, defaults intelligents, auto-apply connexions
- **Mode plein écran** : Raccourci discret (F11) pour immersion totale

**Pour créer Satisfaction micro (qualité IA) :**
- **Preview avant génération** : L'utilisateur voit ce qui va être généré (cibles, contexte)
- **Streaming visible** : Voir le texte se construire en temps réel (excitement positif)
- **Feedback qualité** : Indicateur "80%+ acceptés" pour renforcer la confiance
- **Retry facile** : Bouton "Re-générer" visible, pas de friction

**Pour renforcer Efficacité (macro) :**
- **Progression visible** : Graphe qui grandit, compteur de nœuds, indicateurs de complétion
- **Auto-focus après génération** : L'utilisateur voit immédiatement le résultat (satisfaction)
- **Batch génération** : "Générer tous les choix" pour productivité maximale
- **Validation non-bloquante** : Warnings cliquables, pas d'interruption du workflow

**Pour éviter Frustration (erreurs/bugs) :**
- **Retry clair** : Bouton visible, pas de confusion sur comment réessayer
- **Auto-save visible** : "Sauvegardé il y a Xs" pour rassurer
- **Session recovery** : Message "Modifications récupérées" au démarrage
- **Validation actionnable** : Warnings cliquables → zoom → highlight (pas juste des erreurs)

**Pour créer Délice occasionnel :**
- **Surprises positives** : L'IA propose parfois quelque chose d'inattendu mais pertinent
- **Animations subtiles** : Transitions fluides, feedback visuel agréable (pas de flashy)
- **Moments de satisfaction** : Auto-apply connexions "juste fonctionne" (magie invisible)

## Emotional Design Principles

**1. Flow-first : L'outil disparaît**
   - Minimiser toute friction cognitive dans la boucle "Generate Next"
   - L'utilisateur se concentre sur le contenu créatif, pas sur l'outil
   - Auto-apply, defaults intelligents, feedback discret

**2. Satisfaction micro régulière**
   - Chaque nœud bien généré apporte une petite satisfaction
   - Streaming visible pour excitement positif
   - Preview et feedback qualité pour renforcer la confiance

**3. Efficacité visible**
   - Progression claire (graphe qui grandit, nœuds qui s'ajoutent)
   - Batch génération pour productivité maximale
   - Auto-focus pour voir immédiatement les résultats

**4. Confiance & fiabilité**
   - Auto-save visible, session recovery, zero data loss
   - Auto-apply connexions fiables (pas de bugs)
   - Retry facile, pas d'anxiété en cas d'erreur

**5. Délice occasionnel**
   - Surprises positives de l'IA (inattendu mais pertinent)
   - Animations subtiles, transitions fluides
   - Magie invisible : les choses "juste fonctionnent" (auto-apply)

**6. Éviter frustration**
   - Pas de bugs bloquants, retry clair
   - Validation non-bloquante mais actionnable
   - Pas de perte de temps, pas de perte de travail
