# Audit maquette « Scène » / stories restantes de l'epic 20 — 2026-11-28

Règle : aucun écart entre la maquette et la story ; la maquette prime, sauf si elle est manifestement moins bonne. Les
corrections sans choix sont dans `epic-20.md`, `epic-18.md`, le README de la maquette et l'architecture. Ce qui reste
est ici.

## À trancher

**Q1. Texte tapé dans l'emplacement à écrire (20.11).** Le board dit « Écrire la réplique de Grish, ou décrire ce qui
doit se passer… », et tout s'enregistre à la frappe.
- a (recommandé) : c'est la réplique ; la consigne a un champ distinct.
- b : texte + CTRL+↵ = consigne, sinon réplique à la sortie du champ.
- c : une bascule explicite.

**Q2. Travaux serveur que la maquette suppose (20.8, 20.11, 20.12, 20.24).** Le graphe ne diffuse ni texte ni trace ;
une issue de test ne se génère pas seule ; les lots travaillent par parent (10 à 100) et leurs résultats ne se
retrouvent pas après fermeture ; Jouer ignore traits, respect, influence et flags.
- a (recommandé) : les faire, en lots ajoutés aux stories (tailles à relever).
- b : retirer des boards ce qui n'est pas servi.

**Q3. Test dans Jouer (20.24).** Le board tire un dé (1 et 20 critiques) ; le code compare score et difficulté.
- a : dé comme sur le board, si c'est la règle du jeu.
- b (recommandé tant que la règle manque) : score contre difficulté.

**Q4. Deux écrans de la maquette sans story, à faire avant 20.11.** L'« Accueil » tient en une phrase, et les fonctions
de liste actuelles (collections, export et validation par lot, journal d'export) n'y sont pas ; seuls les « Réglages ›
Apparence » ont une story, et les autres onglets d'options, la gestion des voix et des templates, et des réglages de la
page Générer n'ont pas de destination.
- a (recommandé) : créer les stories « Accueil » et « Réglages ».
- b : répartir en critères dans 20.5, 20.16 et 20.25.
- c : abandonner des fonctions, une par une et par écrit.

**Q5. Fonctions actuelles que la maquette ignore.** Suggestions, pertinence, usage des sections, comparaison et
optimisation du contexte (20.25) ; tiroir de réglage de la partie, couverture des choix testés et raccourcis de
l'aperçu jouable (20.24).
- a (recommandé) : rien ne disparaît sans votre accord ; garder « État de la partie » éditable et la marque « testé ».
- b : abandon assumé, inscrit au README § 13.

**Q6. Non urgent.** Source des images d'Ambiance (18 fiches seulement ont une URL, ni Grish ni Uresaïr : recommandé,
dépôt manuel par fiche) ; guides d'auteur pour l'aide de 20.22 (recommandé : livrer la question au GDD seule) ; juge
des notes d'intention de 20.23 (recommandé : juge LLM à l'aveugle puis votre échantillon, seuil 0,3 point sur 10).

## Tranché sans vous (vous pouvez revenir dessus)

Maquette jugée moins bonne :
- Script : un clic dans le texte d'une réponse écrit ; numéro, état et marges suivent le chemin (le board suit partout).
- ÉCHAP sur des options générées les replie sans les rejeter (le board rejette du texte payé).
- Supprimer une scène garde une confirmation (le board : aucune question, jamais).
- Didascalie à la ligne, comme dans le reste de l'application (le board `Main` la met en ligne).
- Un test non écrit montre quand même le sélecteur d'issue, et sa ligne repliée sur le graphe garde un port.
- Texte généré teinté en permanence jusqu'à la retouche, L réservée à la lentille (le board `Gestes` dit l'inverse).
- Estimation en tokens et en €, dépense en $ (plusieurs boards omettent le prix ou mélangent).

Autres choix :
- « + Réponse » sous la liste, suppression au survol avec toast ; un seul popover de mécaniques, ouvert aussi par « + ».
- « Fin voulue » : métadonnée d'éditeur retirée à l'export ; `END` par défaut reste « à écrire ».
- Verrouillage du panneau champ par champ (18.5b, 18.6, 18.7).
- 20.5 : « Actions ▾ » dans les trois vues ; menu de compte ; GRAPHE par défaut ; anciens raccourcis retirés.
- Génération : une option par défaut ; réécriture : trois propositions.
- « Pourquoi ? » rouvre la dernière discussion ; version créée à la sortie du champ et à chaque génération.
- Catalogues : alias de genre pour les traits, flags du dialogue acceptés.
- Export : seul `validate-schema` bloque ; export et golden inchangés.
- Une seule relecture LLM ; slop heuristique joint sans coût.
- Nouvel endpoint « aperçu du prompt » (20.25) et d'estimation des discussions (20.21).
- Aucun bouton « Synchroniser maintenant » (18.8).

## Corrections restant à faire dans les boards

| Board | À corriger |
|---|---|
| `Fiche` | « Salutation / première rencontre » et sa consigne sont un template, pas une voix : mettre une voix ; menu « Enregistrer comme template » et « Appliquer un template… » ; montrer le prix à côté des tokens |
| `Main` | Texte d'une réponse = champ, pas un bouton ; didascalie à la ligne ; sélecteur d'issue sur un test non écrit ; prix dans l'emplacement ; légende TAB « suites vides » |
| `Gestes` | Provenance permanente (pas sur L, pas « Tout voir ») ; toast mais confirmation pour une scène |
| `Generer` | Ligne « TRACE ▸ » absente ; libellé de l'emplacement après Q1 ; ÉCHAP replie |
| `Graphe` | Port sur la ligne « 4 ISSUES · À ÉCRIRE » ; « Influence » dans le popover ; puce « ■ FIN » ; « + Réponse » et « + » mécanique |
| `Carte` | Retirer « / INSÉRER » (hors epic) ; « + Réponse » |
| `Lot` | Retirer la durée (aucune source) ; montrer la barre de lot de sélection |
| `Contexte` | PNJ et PJ non retirables ; retirer « résumées d'abord » tant que le résumé n'existe pas |
| `Palette` | Retirer « TAB ACTIONS » (aucune action définie) |
| `Bibliotheque`, `Ambiance` | Dire lequel est Liste et lequel Couvertures ; accueil sans sélection multiple (Q4) |
| `Reglages` | Section Ambiance absente |
| `Versions`, `Discussion` | Liste des discussions dans Versions |
| `Technique` | Renommage « partout » et valeur inconnue non dessinés |
| `Mobile` | « fiche de scène ▾ » (pas « fiche ▾ ») ; « PARTIE » (pas « ESSAI ») ; prix en € ; menu « ⋯ » sans contenu |
| `Problemes` | Bouton « Relire la scène · ≈ x € » ; groupe bloquant limité à la validation de schéma |

`requirements-inventory.md` redit l'ancienne FR137 (« chaque élément ouvre son détail ») : non modifié ici.

## Défauts de code relevés (lus, pas reproduits)

- Un enregistrement retire les réponses de test sans texte (déjà noté ; carte de correction proposée).
- La régénération peut écrire dans un autre dialogue (déjà noté ; carte proposée).
- Un test déjà rempli semble régénéré et repayé par un lot (`services/graph_generation_service.py`, filtre sur
  `targetNode`).
- Le contrôle de budget des lots compte un forfait de 6 000 tokens par parent contre ≈ 12 500 par nœud.
- Le serveur ajoute un figurant au hasard à chaque génération (`scene_dramatis.py`) : l'aperçu du prompt le montrera.
- Seule une génération d’un nœud unique arrive `pending` : un lot arrive accepté (`generationSlice.ts`).

## Limites de l'audit

Boards lus en HTML, non rendus : couleurs, tailles et espacements non comparés. `Lot` et plusieurs boards lus par
tranches. Constats sur le code par lecture seule, sans test. Inventaire des fonctions actuelles tiré des composants,
pas d'un parcours réel. `canvas.json`, `captures/` et le PRD non lus.
