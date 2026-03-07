# Test « interface libre » (US 1-10 à 1-17)

## Objectif

Le **test par interface libre** ne vise pas à dupliquer les tests Playwright existants. Il vise à **aller plus loin** : scénarios exploratoires, jugement UX, cas limites, vérifications qui nécessitent un raisonnement ou une inspection visuelle que des assertions E2E ne capturent pas.

## Ce que Playwright couvre déjà

- **Usage / Budget** : `e2e/cost-governance.spec.ts` — Budget LLM, graphique, quota, warning 90 %, blocage 100 %.
- **Graphe** : `e2e/graph-load-display-nodes.spec.ts` — chargement dialogue, nœuds visibles, drag sans erreurs console ; `e2e/graph-node-accept-reject.spec.ts` — accept/reject (Story 1.4).
- **Génération** : `e2e/graph-node-generation.spec.ts`, `e2e/generation-progress-modal.spec.ts`.

Donc : ne pas recréer des specs Playwright qui ne feraient que répéter ces vérifications.

## Rôle du test interface libre (Browser MCP)

Utiliser le **Browser MCP** pour :

1. **Parcours réels** : enchaîner les écrans (Dashboard → Éditeur de graphe → 💰 Coûts → /usage) et vérifier que les bons éléments sont présents et cohérents avec les US.
2. **Vérifications au-delà du script** :
   - US 1-10 : Ouvrir la modale « Régénérer le nœud », vérifier historique d’instructions, « Utiliser », comportement après régénération (même id, connexions conservées).
   - US 1-11 : Après « Estimer le coût », vérifier que l’affichage (€, tokens, provider, comparaison) est lisible et pertinent ; si budget > 100 %, bouton Générer désactivé.
   - US 1-12 : Panneau Coûts ouvert, clic sur une barre → tooltip détail ; « Comparer tous les dialogues » → liste triée cohérente.
   - US 1-13 : Filtres date/modèle, mise à jour des montants et du graphique après générations, pourcentage budget vs quota.
   - US 1-14 : Contenu du prompt (Dashboard et « Voir le prompt » nœud) cohérent avec ce qui est envoyé au LLM ; copier fonctionne.
   - US 1-16 : En cas de fallback (simuler timeout/503), toast « {fallback_from} indisponible - bascule vers {fallback_to} » et génération qui aboutit.
   - US 1-17 : Pas de nœuds fantômes, positions persistées après drag, edges corrects après rejet/régénération.

3. **Jugement** : repérer incohérences, libellés confus, états inattendus que des `expect().toBeVisible()` ne détectent pas.

**Prérequis** : `npm run dev` ; un onglet Browser MCP sur http://localhost:3000 (ou navigation préalable).

## US laissés aux tests existants ou API

- **US 1-15** (logs de génération) : API `GET .../generation-logs` couverte par `tests/api/test_llm_usage.py` ; l’UI GenerationLogsPanel n’est pas montée, donc pas de test interface libre dessus tant qu’elle n’est pas exposée.
