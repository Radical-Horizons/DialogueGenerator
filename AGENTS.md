# AGENTS.md

**Les instructions de ce dépôt vivent dans [`CLAUDE.md`](CLAUDE.md).** Lis-le en premier — il est canonique.

Ce fichier n'est qu'un pointeur, conservé pour les outils qui cherchent `AGENTS.md` par convention (agents cloud, Codex, etc.).

Ce que tu y trouveras :

- Le rôle de l'application et les commandes de démarrage des services.
- Les règles toujours actives (importées) et la **table de routage** des règles conditionnelles — à consulter avant de toucher à un fichier.
- La grille de tests T0–T3 et l'obligation d'exécuter les tests plutôt que de les suggérer.
- Le protocole d'appel de l'API REST (ne pas réimplémenter la logique backend dans des scripts).
- Les subagents disponibles et le protocole de revue globale.
- BMAD et la boucle `bmad-loop`.
- Les caveats non évidents (`.env`, auth guest-first, Windows-first, SDK mistralai…).
- Les préférences utilisateur et faits techniques appris sur le projet.
