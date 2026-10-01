## Epic 19: Canvas-first — surfaces à la demande, récupération de l'espace graphe

**Status:** backlog — **squelette assumé.** Objectif, périmètre et dépendance figés ; découpage en stories **volontairement différé**.

Les auteurs lancent la **génération**, les **détails GDD** et les **variables / systèmes de jeu** en overlays appelés **depuis le nœud lui-même**. Le panneau de droite permanent disparaît et sa largeur revient au graphe.

**FRs covered:** FR129 (surfaces à la demande depuis le nœud), FR130 (suppression du panneau permanent, espace rendu au canvas)

**NFRs concernées:** NFR-P4 (ouverture d'overlay < 100 ms), NFR-A1 / NFR-A3 (focus trap, retour de focus, ARIA de dialogue), NFR-P1 (le gain d'espace ne doit pas coûter le rendu)

**Dépendances:** **Epic 18 — bloquante.**

**Valeur utilisateur:** Récupérer la largeur du panneau de droite pour le graphe, sans perdre l'accès à une seule de ses fonctions. Le canvas redevient la surface principale au lieu d'être la colonne du milieu.

---

## Pourquoi cette epic est un squelette, et pourquoi c'est délibéré

Ce n'est pas un report par prudence, et ce n'est pas « parce que c'est gros ».

**Epic 19 est un pari sur le retour d'usage.** Il faut avoir vécu l'édition in-situ quelques jours pour savoir ce qui **reste réellement** dans le panneau de droite une fois que l'écriture quotidienne — réplique, réponses, locuteur — n'y passe plus. Détailler maintenant les stories reviendrait à décider à l'aveugle de ce que l'usage dira.

**Et Epic 18 est ce qui rend Epic 19 possible sans régression.** On ne retire pas le panneau tant que l'édition quotidienne en dépend. Tant que 18 n'est pas livrée, « supprimer le panneau » signifie « supprimer le seul moyen d'écrire ».

**Condition d'ouverture du découpage :** Epic 18 livrée **et** une période d'usage réel suffisante pour répondre à la question — *qu'est-ce qui reste indispensable dans le panneau de droite ?*

---

## Périmètre pressenti (à confirmer après Epic 18)

Trois surfaces à déplacer du panneau permanent vers des overlays à la demande :

| Surface | Déclencheur pressenti | Contenu |
|---|---|---|
| **Génération** | action sur le nœud (`AIGenerationPanel` existe déjà — il devient un overlay, il n'est pas réécrit) | instructions, contexte, paramètres, coût estimé |
| **Détails GDD** | action sur le nœud ou sur une entité citée | fiche GDD, sections utilisées, justifications |
| **Variables / systèmes de jeu** | « + » sur le nœud ou sur une réponse | conditions de visibilité, effets, skill checks, coût d'effort |

**Ce qui reste explicitement hors périmètre d'Epic 18 et atterrit ici :** l'édition des conditions, effets, skill checks et métadonnées. Trop dense pour tenir dans un nœud — c'est précisément ce que l'overlay doit porter.

---

## ⚠️ GARDE-FOUS — à poser avant le découpage

1. **Inventaire avant suppression.** Lister exhaustivement ce que `NodeEditorPanel.tsx` (1272 lignes) expose aujourd'hui, et pour **chaque** fonction nommer sa destination. Aucune fonction ne disparaît sans décision explicite. Un panneau retiré avec trois fonctions oubliées est une régression, pas un gain d'espace.
2. **Ne pas réécrire ce qui existe.** `AIGenerationPanel`, `ContextSelector`, `GameSystemsIntegrationPanel` existent et fonctionnent. Les déplacer dans un overlay est un changement de conteneur, pas une réimplémentation.
3. **Accessibilité des overlays.** Focus trap à l'ouverture, retour du focus au déclencheur à la fermeture, `Échap` ferme, rôle de dialogue correct. Coordonner avec Epic 14 sans dupliquer.
4. **Articulation avec Epic 17.** Sur viewport étroit, les panneaux sont **déjà** en drawers / plein écran (stories 17.3 et 17.5). L'overlay desktop doit converger avec ce pattern, pas en créer un troisième.
5. **Mesurer le gain.** La largeur rendue au canvas est l'objet de l'epic : la mesurer avant / après, et vérifier que NFR-P1 ne se dégrade pas sur un graphe 500+ nœuds une fois le canvas élargi.
6. **Réversibilité.** Prévoir comment on revient en arrière si l'usage dit que le panneau manquait. Un panneau supprimé sans chemin de retour est un pari non couvert.

---

## Questions ouvertes (à trancher au découpage, pas avant)

- Le panneau est-il **supprimé** ou **repliable par défaut** ? FR130 dit « collapse ou remove » — l'usage tranchera.
- Un déclencheur unique (« + » sur le nœud, ouvrant un menu) ou un déclencheur par surface ?
- Les overlays sont-ils ancrés au nœud (popover) ou centrés (modal) ? L'ancrage préserve le contexte spatial ; le modal supporte plus de contenu.
- Que devient la consultation **multi-nœuds** — comparer deux nœuds est-il encore possible sans panneau permanent ? (Epic 12 / FR110 : comparaison side-by-side.)

---

### Stories

*À créer après le retour d'usage d'Epic 18, via `/bmad-create-story`.*

**References:** FR129, FR130, Epic 18 (bloquante), Epic 12 (FR110), Epic 14, Epic 17 (stories 17.3, 17.5)
