# Audit maquette « Scène » / stories restantes de l'epic 20 — 2026-11-28

Règle : aucun écart entre la maquette et la story ; la maquette prime, sauf si elle est manifestement moins bonne. Les
corrections sans choix sont dans `epic-20.md`, `epic-18.md`, le README de la maquette et l'architecture. Ce qui reste
est ici.

## Questions : Q1 à Q5 tranchées le 2026-11-28, Q6 ouverte

L'auteur a répondu « ok pour tes 5 recommandations ». Les réponses sont inscrites dans les stories.

**Q1. Texte tapé dans l'emplacement à écrire — tranché le 2026-11-28 (20.11).** C'est la réplique ; la consigne a un
champ distinct.

**Q2. Travaux serveur que la maquette suppose — tranché le 2026-11-28.** Ils sont faits, en lots ajoutés : issue de
test générée seule (20.8), texte et trace en direct avec interruption (20.11), lots par emplacement retrouvés au
rechargement et arrivant À VALIDER (20.12), Jouer avec traits, respect, influence et flags (20.24). Estimation :
≈ +13 sessions avec Q4 et Q5, soit ≈ 77 sur le chemin critique.

**Q3. Test dans Jouer — tranché le 2026-11-28 (20.24).** Score comparé à la difficulté, comme le code ; pas de dé.
La règle du jeu n'a pas été donnée : à revoir si elle l'est.

**Q4. Écrans sans story — tranché le 2026-11-28.** Stories 20.26 « Accueil » et 20.27 « Réglages », avant 20.11.

**Q5. Fonctions actuelles que la maquette ignore — tranché le 2026-11-28.** Rien ne disparaît sans décision écrite
(20.24, 20.25).

**Q6. Ouverte, non urgente.** Source des images d'Ambiance (18 fiches seulement ont une URL, ni Grish ni Uresaïr :
recommandé, dépôt manuel par fiche) ; guides d'auteur pour l'aide de 20.22 (recommandé : livrer la question au GDD
seule) ; juge des notes d'intention de 20.23 (recommandé : juge LLM à l'aveugle puis votre échantillon, seuil 0,3 point
sur 10).

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
| `Generer` | Ligne « TRACE ▸ » absente ; libellé de l'emplacement (le texte est la réplique) et champ de consigne distinct ; ÉCHAP replie |
| `Jouer` | Retirer le dé (« JET », 1 et 20 critiques) : score comparé à la difficulté |
| `Main`, `Fiche`, `Reecrire` | Emplacement : le texte tapé est la réplique, la consigne a son champ |
| `Graphe` | Port sur la ligne « 4 ISSUES · À ÉCRIRE » ; « Influence » dans le popover ; puce « ■ FIN » ; « + Réponse » et « + » mécanique |
| `Carte` | Retirer « / INSÉRER » (hors epic) ; « + Réponse » |
| `Lot` | Retirer la durée (aucune source) ; montrer la barre de lot de sélection |
| `Contexte` | PNJ et PJ non retirables ; retirer « résumées d'abord » tant que le résumé n'existe pas |
| `Palette` | Retirer « TAB ACTIONS » (aucune action définie) |
| `Bibliotheque`, `Ambiance` | Dire lequel est Liste et lequel Couvertures ; ajouter la sélection multiple, les collections et les filtres date et auteur (20.26) |
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
  `targetNode`) ; une session le corrige depuis le 2026-11-28, avec le budget des lots (prérequis de 20.12).
- Le contrôle de budget des lots compte un forfait de 6 000 tokens par parent contre ≈ 12 500 par nœud.
- Le serveur ajoute un figurant au hasard à chaque génération (`scene_dramatis.py`) : l'aperçu du prompt le montrera.
- Seule une génération d’un nœud unique arrive `pending` : un lot arrive accepté (`generationSlice.ts`).

## Limites de l'audit

Boards lus en HTML, non rendus : couleurs, tailles et espacements non comparés. `Lot` et plusieurs boards lus par
tranches. Constats sur le code par lecture seule, sans test. Inventaire des fonctions actuelles tiré des composants,
pas d'un parcours réel. `canvas.json`, `captures/` et le PRD non lus.
