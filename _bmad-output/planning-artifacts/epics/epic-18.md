## Epic 18: Édition in-situ du dialogue dans le nœud

**Status:** backlog — stories **18.1–18.9**

Les auteurs peuvent lire et écrire le dialogue complet — **réplique PNJ et réponses PJ** — directement dans le nœud sur le canvas, par **simple clic dans le texte**, sans ouvrir le panneau de droite et **sans aucune action d'enregistrement**. Le panneau de droite reste disponible pour ce qui ne tient pas dans un nœud (conditions de visibilité, effets, skill checks, métadonnées).

**FRs covered:** FR122 (édition réplique in-situ), FR123 (réplique intégrale, densité bornée), FR124 (réponses PJ éditables en lignes), FR125 (speaker + titre in-situ), FR126 (éditer = sauvegarder), FR127 (source unique nœud ↔ panneau), FR128 (clavier + tactile)

**NFRs covered:** NFR-P1 (rendu 500+ nœuds < 1 s), NFR-P4 (interaction < 100 ms), NFR-A1 / NFR-A3 (focus visible, ARIA), NFR-R2 (zéro perte)

**UX-DRs covered:** UX-DR1 (révision spec UX), UX-DR2 (affordance), UX-DR3 (tokens refonte 2026), UX-DR4 (états de synchronisation), UX-DR5 (cible tactile), UX-DR6 (focus et ordre de tabulation)

**Valeur utilisateur:** Supprimer l'aller-retour canvas → panneau droit → canvas pour l'opération la plus fréquente de l'outil : écrire une réplique et écrire les réponses qui en découlent. Le nœud cesse d'être une vignette de consultation ; il devient le lieu d'écriture.

**Dépendances:** Epic 2 (éditeur de graphe), Epic 16 / ADR-008 (`choiceId` stables). **Aucune dépendance sur Epic 19** — cette epic est livrable et utile seule.

**Référence de cadrage:** [`research/ux-edition-in-situ-articy-notion-2026-10-01.md`](../research/ux-edition-in-situ-articy-notion-2026-10-01.md) — analyse Articy:draft X (chaîne Tab, `Ctrl+Tab`, curseur pré-placé) et éditeurs sans mode (Notion, Confluence : clic simple, `Échap` quitte sans annuler, pas de bouton Enregistrer).

---

## Décisions de cadrage (figées avant découpage)

Trois décisions sont **acquises** et ne sont pas à rouvrir en story. Elles ont chacune coûté un arbitrage.

### D1 — Activation au **clic simple**, pas au double-clic

Le double-clic est déjà attribué trois fois : ouverture de l'`AIGenerationPanel` (`ux-design-specification/ux-consistency-patterns.md:105`), focus nœud (Epic 2, story 2.x), et zoom canvas par défaut de React Flow. Le clic simple dans le texte est à la fois le pattern Notion / Confluence et le seul créneau libre.

**Conséquence sur un nœud non sélectionné** (interaction D1 × D3) : cliquer un nœud en densité résumé le **sélectionne** et le déplie — le texte se reflow, donc la position de clic ne désigne plus rien. Comportement retenu : **premier clic** = sélection + dépliage, curseur placé **en fin de réplique** ; **second clic** = placement du curseur à l'endroit cliqué. Ne pas tenter de projeter la position du premier clic sur le texte reflowé.

**Guillemets :** `DialogueNode.tsx:606` ajoute `« … »` **au rendu**, pas dans la donnée. Ils doivent rester **hors de la zone éditable**, sinon l'auteur les écrase en tapant et ils finissent dans `line`.

### D2 — `Échap` **quitte** le champ, il n'annule pas

ADR-006 interdit le brouillon : le texte est poussé au store **à la saisie**. Il n'y a donc rien à annuler au moment où `Échap` est pressé. `Échap` fait le même flush que toute autre sortie de champ, puis rend le focus au nœud. **L'annulation, c'est `Ctrl+Z`** sur la pile undo existante (zundo).

⚠️ Toute story qui réintroduirait un brouillon local « pour permettre l'annulation » est **non conforme ADR-006** et doit être refusée en revue.

### D3 — Densité **adaptative**, pas déplié par défaut

La maquette 2026 pose un principe explicite : *« Le nœud dit trois choses — qui parle, ce qui est dit, et ce que ça coûte structurellement (réponses, flags) »* (`docs/design/refonte-ui-2026/etats-2a-2e.dc.html:251`). Déplier toutes les réponses en permanence le contredit et met NFR-P1 (500+ nœuds) en danger.

**Arbitrage retenu :** le nœud **résume** par défaut (maquette inchangée) et **déplie** réplique intégrale + réponses quand il est sélectionné **ou** au-delà d'un seuil de zoom. « Voir le texte entier » n'a de valeur que sur le nœud qu'on travaille.

---

## ⚠️ GARDE-FOUS — Vérification de l'Existant (Scrum Master)

**OBLIGATOIRE avant création de chaque story de cet epic.**

1. **Troncature actuelle** : `DialogueNode.tsx:167` (`line.substring(0, 100)`) et le rendu `:606`. Mesurer avant de changer.
2. **Handles de choix** : `getChoiceHandleLeftPercent(index)` positionne les pastilles en pourcentage sur le bord bas. L'identifiant de handle est `choice:${choiceId}` — **il ne doit pas changer**, sinon toutes les arêtes de choix se détachent.
3. **Flush du formulaire** : passer par `mergeDialogueNodeFormIntoStoreData()`. Un spread `{...nodeData, ...formValues}` écrase `choices[N].targetNode` posé par `connectNodes` et casse la liaison d'arête (fait technique documenté dans `CLAUDE.md`).
4. **React Flow** : `GraphCanvas.tsx:674` ne configure **pas** `deleteKeyCode` → valeur par défaut active. Vérifier le comportement réel de `Backspace` en saisie avant de supposer que `isInputDOMNode` protège.
5. **Double debounce** : `NodeEditorPanel.tsx:219-233` pousse déjà au store avec son propre debounce. Ne pas créer un second chemin d'écriture concurrent.
6. **Pas de doublon d'epic** : Epic 14 garde le clavier / ARIA globaux, Epic 17 garde le responsive global, Epic 12 garde les raccourcis desktop. Cette epic ne traite que **l'intérieur du nœud**.

---

### Story 18.1: Densité adaptative du nœud et réplique intégrale (FR123)

As a **auteur de dialogues**,
I want **voir la réplique PNJ en entier dans le nœud que je travaille, sans que le graphe entier devienne illisible**,
So that **je peux juger le texte sans ouvrir le panneau de droite ni survoler quoi que ce soit**.

**Objectif US (vérification existant):** `DialogueNode.tsx:167` tronque à 100 caractères, sans état ni seuil. L'US introduit **deux densités** et supprime la troncature dans la densité dépliée.

**Acceptance Criteria:**

**Given** un nœud non sélectionné et un zoom en dessous du seuil déplié
**When** le graphe est rendu
**Then** le nœud affiche la densité **résumé** conforme à la maquette 2026 — speaker, réplique abrégée, `N RÉPONSES · N flags`
**And** aucune régression visuelle n'est introduite par rapport à l'état actuel

**Given** un nœud sélectionné **ou** un zoom au-dessus du seuil déplié
**When** le nœud est rendu
**Then** la réplique est affichée **intégralement**, sans troncature à 100 caractères
**And** la hauteur du nœud s'adapte au contenu jusqu'à un maximum documenté
**And** au-delà de ce maximum le contenu **scrolle à l'intérieur du nœud**, sans rogner le texte

**Given** la zone de contenu scrollable du nœud
**When** j'utilise la molette au-dessus de cette zone
**Then** le scroll s'applique au contenu du nœud et **ne zoome pas le canvas** (classe `nowheel`)

**Given** un graphe de 500 nœuds ou plus
**When** je charge le dialogue et navigue (zoom, pan)
**Then** NFR-P1 (< 1 s au rendu) et NFR-P4 (< 100 ms à l'interaction) restent tenus
**And** le passage résumé ↔ déplié ne provoque pas de re-render global du graphe

**Given** la densité dépliée
**When** le nœud est rendu
**Then** la typographie respecte les tokens de la refonte 2026 — serif pour la réplique, mono pour les métadonnées (UX-DR3)

**Given** un nœud dont les voisins sont proches sur le canvas
**When** il passe en densité dépliée et grandit
**Then** il passe **au-dessus** de ses voisins (z-index) et **ne les déplace pas** — React Flow ne repousse pas les nœuds frères et les positions sont persistées
**And** au retour en densité résumé il reprend exactement son encombrement initial
**And** aucun re-layout automatique du graphe n'est déclenché par un changement de densité

**Livrable documentaire (UX-DR1):** mettre à jour `ux-design-specification/ux-pattern-analysis-inspiration.md` §« Inline Editing ». Le texte actuel conclut *« Pattern transférable : Panel droit pour édition sans perdre contexte graphe »* — il **écarte** explicitement le pattern que cette epic adopte. Acter la révision plutôt que la contredire en silence.

**References:** FR123, NFR-P1, NFR-P4, UX-DR1, UX-DR3, D3

---

### Story 18.2: Réponses PJ affichées en lignes dans le nœud (FR124 — lecture)

As a **auteur de dialogues**,
I want **lire le texte de chaque réponse joueur directement dans le nœud en densité dépliée**,
So that **je peux juger la cohérence réplique ↔ réponses d'un seul regard, sans survoler les pastilles une par une**.

**Objectif US (vérification existant):** aujourd'hui le texte des réponses n'est accessible **qu'en tooltip au survol d'un handle** (`DialogueNode.tsx:632-700`). Le nœud n'affiche qu'un compteur. L'US les fait exister comme lignes du corps du nœud en densité dépliée — **lecture seule** ; l'édition arrive en 18.4.

**Acceptance Criteria:**

**Given** un nœud en densité dépliée avec N réponses
**When** le nœud est rendu
**Then** chaque réponse apparaît comme une **ligne** du corps du nœud, dans l'ordre de `choices[]`
**And** la distinction visuelle **réplique PNJ / réponses PJ** reste immédiatement lisible (serif vs lignes compactes, pastille orange conservée)

**Given** un nœud en densité résumé
**When** le nœud est rendu
**Then** le compteur `N RÉPONSES` est conservé tel quel — les lignes ne s'affichent pas

**Given** des réponses portant des conditions, effets, skill checks ou coût d'effort
**When** le nœud est en densité dépliée
**Then** ces attributs restent signalés par les **indicateurs compacts existants** (pastille, anneau d'effets, marqueur `COND.`) et **non** dépliés en toutes lettres
**And** leur édition reste au panneau de droite (hors périmètre de cette epic)

**Given** un nœud dont les réponses sont connectées à d'autres nœuds
**When** le rendu passe des handles en pourcentage sur le bord bas à des handles par ligne
**Then** l'identifiant de handle reste `choice:${choiceId}`
**And** **aucune arête n'est détachée, déplacée vers une mauvaise cible ni perdue** — test de régression explicite sur un dialogue à branches multiples

**Given** la densité résumé et la densité dépliée
**When** je passe de l'une à l'autre
**Then** les arêtes sortantes restent attachées et se repositionnent sans scintillement

**References:** FR124, NFR-P4, ADR-008 (`choiceId`), garde-fou 2

---

### Story 18.3: Éditer la réplique PNJ dans le nœud (FR122, FR126)

As a **auteur de dialogues**,
I want **cliquer dans la réplique affichée dans le nœud et écrire directement, sans bouton ni bascule**,
So that **je corrige une ligne en une seconde au lieu de traverser le panneau de droite**.

**Objectif US (vérification existant):** le nœud est aujourd'hui 100 % lecture seule — aucun `input`, aucun `contentEditable`. Toute écriture passe par `NodeEditorPanel`.

**Acceptance Criteria:**

**Given** un nœud en densité dépliée
**When** je clique une seule fois dans le texte de la réplique
**Then** le curseur se place à l'endroit cliqué et je peux écrire immédiatement
**And** aucun bouton « Modifier », aucune bascule de mode, aucun double-clic ne sont requis (D1)

**Given** que je suis en train de saisir dans la réplique
**When** une frappe est enregistrée
**Then** la valeur est poussée au store dans un délai **≤ 100 ms** (ADR-006)
**And** l'écriture passe par `mergeDialogueNodeFormIntoStoreData()`, **jamais** par un spread d'objet
**And** aucun brouillon local n'est conservé

**Given** que je suis en train de saisir
**When** je presse `Échap`
**Then** la saisie est **conservée** (elle est déjà au store), le champ perd le focus, le nœud reste sélectionné (D2)

**Given** une saisie que je veux défaire
**When** je presse `Ctrl+Z`
**Then** la pile undo existante restaure l'état précédent du document
**And** l'affichage du nœud suit, sans rechargement

**Given** que je sélectionne du texte à la souris dans la réplique
**When** je glisse le curseur
**Then** la sélection de texte s'effectue et **le nœud ne se déplace pas** (classe `nodrag` sur la zone éditable)

**Given** que je suis en train de saisir dans la réplique
**When** je presse `Backspace` ou `Suppr` pour effacer un caractère
**Then** le caractère est effacé et **le nœud n'est pas supprimé du graphe**
**And** un **test de régression** couvre explicitement ce cas (`deleteKeyCode` non configuré dans `GraphCanvas.tsx`)

**Given** un nœud en densité résumé
**When** je survole la zone de réplique
**Then** une affordance d'édition discrète apparaît (curseur texte, filet au survol) sans dégrader la lisibilité en lecture (UX-DR2)

**Given** un nœud non sélectionné en densité résumé
**When** je clique dans la zone de réplique
**Then** le nœud est sélectionné et déplié, et le curseur se place **en fin de réplique**
**And** un second clic place le curseur à l'endroit cliqué (D1)

**Given** le mode **playthrough reader** ou le mode **preview de dialogue** actif, **ou** une session **invité**
**When** je clique dans le texte d'un nœud
**Then** **aucune édition ne s'active** — le nœud reste en lecture et le comportement existant du mode est préservé (`playthroughReaderActive`, `dialoguePreviewActive`, invité = lecture seule)
**And** aucune affordance d'édition n'est affichée dans ces modes

**References:** FR122, FR126, NFR-P4, NFR-R2, ADR-006, UX-DR2, D1, D2, Epic 9 (preview), `guest_first_auth`, garde-fous 3 et 4

---

### Story 18.4: Éditer le texte des réponses PJ dans le nœud (FR124, FR126)

As a **auteur de dialogues**,
I want **écrire le texte de chaque réponse joueur directement sur sa ligne dans le nœud**,
So that **j'écris une réplique et ses réponses d'un seul geste, au même endroit**.

**Acceptance Criteria:**

**Given** un nœud en densité dépliée avec N réponses
**When** je clique dans le texte d'une réponse
**Then** le curseur s'y place et je peux écrire, selon les mêmes règles qu'en 18.3 (clic simple, push ≤ 100 ms, `Échap` sort, `Ctrl+Z` annule)

**Given** que je modifie le texte d'une réponse
**When** la valeur est poussée au store
**Then** `choices[N].choiceId` est **inchangé**
**And** `choices[N].targetNode` est **préservé** — un test de régression vérifie que l'arête sortante de cette réponse pointe toujours vers le même nœud après édition
**And** l'ordre de `choices[]` est inchangé

**Given** une réponse dont le texte devient vide
**When** je quitte le champ
**Then** la réponse **n'est pas supprimée** et son `choiceId` est conservé
**And** le nœud signale la réponse vide par l'indicateur de validation existant (Epic 4, FR37)

**Given** un nœud sans réponse (`nextNode` simple)
**When** le nœud est en densité dépliée
**Then** aucune ligne de réponse n'est affichée et l'indicateur `SUITE →` existant est conservé

**Given** un document exporté vers Unity après édition in-situ des réponses
**When** la validation de schéma s'exécute
**Then** le document reste conforme v1.1.0 et `choiceId` est présent sur chaque réponse (ADR-008)


**Modes lecture seule :** les exclusions de la story 18.3 (playthrough reader, preview de dialogue, session invité) s'appliquent **identiquement** ici.

**References:** FR124, FR126, ADR-008, garde-fou 3, story 18.3

---

### Story 18.5: Éditer le speaker et le titre dans le nœud (FR125, FR126)

As a **auteur de dialogues**,
I want **corriger qui parle et le titre du nœud sans quitter le canvas**,
So that **renommer un locuteur ne me coûte pas un aller-retour vers le panneau**.

**Acceptance Criteria:**

**Given** un nœud sélectionné
**When** je clique sur le nom du locuteur dans l'en-tête du nœud
**Then** je peux l'éditer sur place, selon les mêmes règles qu'en 18.3

**Given** un nœud sélectionné
**When** je clique sur le titre du nœud
**Then** je peux l'éditer sur place, selon les mêmes règles qu'en 18.3

**Given** que je modifie le locuteur ou le titre
**When** la valeur est poussée au store
**Then** les champs non touchés du nœud (`choices`, `nextNode`, métadonnées de génération, `stableID`) sont **intacts**

**Given** un speaker ou un titre long
**When** il dépasse la largeur du nœud
**Then** l'ellipse existante est conservée en affichage, et le champ montre la valeur complète pendant l'édition


**Modes lecture seule :** les exclusions de la story 18.3 (playthrough reader, preview de dialogue, session invité) s'appliquent **identiquement** ici.

**References:** FR125, FR126, garde-fou 3, story 18.3

---

### Story 18.6: Source unique — cohérence nœud ↔ panneau de droite (FR127)

As a **auteur de dialogues**,
I want **que ce que j'écris dans le nœud et ce que j'écris dans le panneau de droite soient toujours la même chose**,
So that **je n'ai jamais à me demander laquelle des deux vues dit la vérité**.

**Objectif US (vérification existant):** `NodeEditorPanel.tsx:219-233` pousse au store avec son propre debounce et se `reset` sur changement de sélection (`:300`). Avec un second éditeur sur les mêmes champs, deux debounces concurrents produisent un **dernier-écrivain-gagne** silencieux. L'US ferme ce trou — elle ne le suppose pas fermé.

**Acceptance Criteria:**

**Given** le panneau de droite ouvert sur le nœud que j'édite dans le canvas
**When** je modifie la réplique dans le nœud
**Then** le champ correspondant du panneau reflète la nouvelle valeur **sans que je perde le focus** ni la position du curseur dans le nœud

**Given** le panneau de droite ouvert sur le nœud affiché en densité dépliée
**When** je modifie la réplique dans le panneau
**Then** le texte affiché dans le nœud reflète la nouvelle valeur

**Given** une saisie faite dans le panneau dont le debounce est **encore en attente** (≤ 100 ms)
**When** le focus passe au nœud et que je commence à y saisir
**Then** le debounce en attente du panneau est **flushé ou annulé avant** toute écriture issue du nœud
**And** le debounce obsolète ne réécrit **jamais** par-dessus la valeur saisie dans le nœud
**And** ce scénario séquentiel est couvert par un test de régression

**Given** le même scénario dans l'autre sens (saisie in-situ non flushée, puis focus dans le panneau)
**When** le panneau se `reset` depuis le store (`NodeEditorPanel.tsx:300`)
**Then** il se réinitialise sur la valeur **la plus récente**, pas sur un état antérieur à la saisie in-situ

**Given** je change de nœud sélectionné pendant une saisie in-situ non flushée
**When** la sélection change
**Then** la saisie est flushée vers le store **avant** le changement, via `mergeDialogueNodeFormIntoStoreData()`
**And** `choices[N].targetNode` est préservé (même piège que le flush du panneau)

**Given** une édition in-situ suivie d'un rechargement de la page
**When** le document est rechargé depuis le journal / serveur
**Then** l'édition est présente — zéro perte (NFR-R2, ADR-006)

**References:** FR127, NFR-R2, ADR-006, ADR-007, garde-fous 3 et 5

---

### Story 18.7: Indicateur de synchronisation et annonce accessible (FR126, UX-DR4)

As a **auteur de dialogues**,
I want **un signal permanent et honnête me disant que mon texte est enregistré**,
So that **l'absence de bouton « Enregistrer » ne se traduise pas par un doute permanent**.

**Objectif US (contexte) :** ADR-006 supprime le bouton Enregistrer, et c'est la bonne décision. Mais la littérature UX est constante sur le point : sans bouton, les utilisateurs doutent — et l'absence de retour est particulièrement hostile au lecteur d'écran (esprit WCAG 3.2.2 *On Input*). **Cette US est la contrepartie non négociable de D2.** Sans elle, « éditer = sauvegarder » se vit comme une perte de contrôle.

**Acceptance Criteria:**

**Given** l'éditeur de graphe ouvert
**When** aucune modification n'est en attente
**Then** un indicateur affiche un état **synchronisé** explicite, visible sans action

**Given** que je viens de saisir du texte in-situ
**When** les modifications sont en cours d'envoi
**Then** l'indicateur passe à un état **en cours / en attente** mentionnant le nombre de changements en file
**And** il revient à l'état synchronisé une fois l'acquittement reçu (ADR-006, `seq` / `ack`)

**Given** une erreur de synchronisation (hors-ligne, 409, erreur serveur)
**When** l'envoi échoue
**Then** l'indicateur passe à un état **erreur** distinguable, et le travail reste conservé localement (journal IndexedDB)
**And** aucun texte saisi n'est perdu ni écrasé silencieusement

**Given** un lecteur d'écran actif
**When** l'état de synchronisation change
**Then** le changement est annoncé via une région `aria-live="polite"`
**And** les annonces sont **agrégées**, pas émises à chaque frappe

**Given** un cycle de saisie normal
**When** l'autosave s'exécute
**Then** il ne produit **pas une révision par frappe** dans la pile undo — `Ctrl+Z` défait une unité d'édition sensée, pas un caractère

**References:** FR126, NFR-A3, NFR-R2, UX-DR4, ADR-006, D2

---

### Story 18.8: Clavier — chaîne Tab, sortie de champ multiligne, focus visible, curseur pré-placé (FR128, FR122)

As a **auteur de dialogues au clavier**,
I want **enchaîner les champs d'un nœud sans toucher la souris, et commencer à écrire dès qu'un nœud est créé**,
So that **écrire un nœud complet reste une séquence de frappe continue**.

**Objectif US (référence Articy):** Articy:draft X place le curseur **avant même le premier clic** (Dialogue Line quand le nœud naît d'un drag de connexion), enchaîne les champs au `Tab`, et exige **`Ctrl+Tab`** pour sortir du champ multiligne. C'est le gain de friction le plus élevé et le moins cher de l'epic.

**Acceptance Criteria:**

**Given** un nœud en densité dépliée et le focus sur le titre
**When** je presse `Tab` de façon répétée
**Then** le focus suit une chaîne déterministe et documentée : **Titre → Speaker → Réplique PNJ → Réponse 1 → … → Réponse N**
**And** chaque champ focalisé porte un indicateur de focus **visible** (UX-DR6, NFR-A1)

**Given** le focus dans la réplique PNJ, champ multiligne
**When** je presse `Tab`
**Then** le comportement est celui documenté pour les champs multilignes — `Ctrl+Tab` sort vers le champ suivant, et `Tab` seul ne produit pas de sortie destructrice
**And** le comportement retenu est annoncé dans l'aide clavier existante (Epic 12 / Epic 14)

**Given** que je crée un nœud manuellement ou par drag depuis un handle de réponse
**When** le nœud apparaît sur le canvas
**Then** il est en densité dépliée et le **curseur est déjà placé** dans la réplique PNJ — je peux écrire sans aucun clic

**Given** le focus sur un champ in-situ
**When** je presse `Échap`
**Then** le focus revient au nœud (sélectionné), pas au document entier (D2)

**Given** un nœud en densité dépliée
**When** je navigue au clavier dans le graphe (Epic 14, FR114)
**Then** l'ordre de tabulation global reste cohérent — les champs du nœud ne piègent pas le focus hors d'un nœud explicitement en édition

**References:** FR128, FR122, NFR-A1, UX-DR6, Epic 14 (FR114–FR115), Epic 12 (FR111)

---

### Story 18.9: Édition in-situ au tactile sur viewport étroit (FR128)

As a **auteur relisant sur tablette**,
I want **corriger une réplique ou une réponse au doigt sans ouvrir un panneau plein écran**,
So that **une relecture hors bureau produit une correction immédiate**.

**Acceptance Criteria:**

**Given** un viewport étroit (< seuil tablette défini en Epic 17)
**When** j'appuie sur le texte d'une réplique ou d'une réponse dans un nœud déplié
**Then** l'édition s'active et le clavier logiciel s'ouvre
**And** le champ en cours d'édition **reste visible** au-dessus du clavier logiciel (viewport dynamique, cf. story 17.4)

**Given** un nœud en densité dépliée sur tactile
**When** j'évalue les zones d'appui pour activer l'édition
**Then** elles respectent **minimum 44×44 px** (UX-DR5, cohérent avec la story 17.2)

**Given** que j'édite au doigt
**When** je fais glisser mon doigt dans la zone de texte
**Then** la sélection ou le scroll du texte s'applique et **le nœud ne se déplace pas**, et le canvas ne pan pas

**Given** un viewport étroit
**When** j'ai fini de saisir
**Then** un moyen évident de **quitter l'édition** existe au tactile (appui hors champ, bouton de validation visible), sans dépendre d'une touche `Échap`

**References:** FR128, UX-DR5, Epic 17 (FR118–FR120, stories 17.2 et 17.4)

---

## Couverture — vérification

| Exigence | Story(ies) |
|---|---|
| FR122 — édition réplique in-situ | 18.3, 18.8 |
| FR123 — réplique intégrale, densité bornée | 18.1 |
| FR124 — réponses PJ en lignes, éditables | 18.2 (lecture), 18.4 (édition) |
| FR125 — speaker + titre in-situ | 18.5 |
| FR126 — éditer = sauvegarder | 18.3, 18.4, 18.5, 18.7 |
| FR127 — source unique nœud ↔ panneau | 18.6 |
| FR128 — clavier + tactile | 18.8, 18.9 |
| NFR-P1 / NFR-P4 | 18.1, 18.2 |
| NFR-A1 / NFR-A3 | 18.7, 18.8 |
| NFR-R2 | 18.3, 18.6, 18.7 |
| UX-DR1 — révision spec UX | 18.1 (livrable documentaire) |
| UX-DR2 — affordance | 18.3 |
| UX-DR3 — tokens refonte 2026 | 18.1 |
| UX-DR4 — états de synchronisation | 18.7 |
| UX-DR5 — cible tactile 44 px | 18.9 |
| UX-DR6 — focus et tabulation | 18.8 |

Aucune FR, NFR ni UX-DR de l'epic n'est orpheline. Aucune story ne dépend d'une story ultérieure : 18.1 → 18.2 posent le rendu, 18.3 → 18.5 l'écriture, 18.6 → 18.7 la fiabilité, 18.8 → 18.9 l'accès.
