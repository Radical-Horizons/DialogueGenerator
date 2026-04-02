# Rapport Monkey Testing — 2026-03-07

**Outil :** Browser MCP (interface libre)  
**Cible :** http://localhost:3000 (DialogueGenerator)  
**Durée :** session unique, enchaînement rapide d’actions.

---

## Actions réalisées

1. **Navigation et onglets**
   - Accès à `/` → Dashboard.
   - Clics rapides : **Édition de Dialogues** → **📊 Éditeur de Graphe** (pas de freeze, refs cohérents).

2. **Inputs « monkey » (recherche dialogue)**
   - Champ « Rechercher un dialogue... » rempli avec :  
     `<script>alert(1)</script> ../../etc/passwd {{7*7}}`
   - **Résultat :** Pas d’alerte XSS, pas de crash. La liste se filtre (vide car aucun match). Après vidage du champ, la liste revient. Comportement attendu (contenu traité comme texte de recherche).

3. **Sélection dialogue + panneau Coûts**
   - Sélection du dialogue « Dialogue_Unity.json ».
   - Clic **💰 Coûts** → panneau Coûts ouvert (Fermer, Comparer tous les dialogues, barre « Nœud OICE_3, coût €0.0014 »).
   - Clics sur **Exporter** et **Replier le panneau droit** : **interceptés** par le panneau Coûts (dialog en premier plan). Comportement correct (pas de clic « à travers » le modal).
   - Clic **Fermer le panneau des coûts** → panneau se ferme, retour à l’état normal.

4. **Page Usage — champs extrêmes**
   - Navigation vers `/usage`.
   - **Date de début** : `0000-00-00`.
   - **Date de fin** : `9999-12-31`.
   - **Modèle** : `'; DROP TABLE usage;--`
   - **Résultat :** Aucun crash. Page reste affichée (Suivi d’utilisation LLM, Budget LLM, Évolution des coûts). Les valeurs sont acceptées comme filtres (côté API, le filtre modèle est très probablement un paramètre string, pas d’exécution SQL côté client).

---

## Synthèse

| Type de test        | Résultat | Note |
|---------------------|----------|------|
| Bascule rapide onglets | OK       | Pas de désync ni erreur visible. |
| Input XSS / path / template | OK   | Pas d’exécution de script, recherche en texte. |
| Modal Coûts (focus / blocage) | OK | Les clics derrière sont bloqués par le dialog. |
| Dates / filtre « SQL » Usage | OK | Pas de crash ; champs utilisés comme filtres. |

**Bugs critiques constatés :** Aucun.  
**Comportements à surveiller (non bloquants) :**  
- Dates `0000-00-00` et `9999-12-31` : à confirmer côté API (validation, plage autorisée, timezone).  
- Filtre modèle avec caractères spéciaux : si l’API renvoie une erreur ou une liste vide, c’est acceptable ; à vérifier en backend que le paramètre est bien sanitized (injection, log, etc.).

---

## Recommandations

- **Régressions :** Répéter ce type de monkey test (Browser MCP) après gros changements UI (modals, routing, formulaires).
- **Données limites :** Ajouter si besoin des tests API ou E2E pour plages de dates extrêmes et caractères spéciaux dans les filtres Usage.
