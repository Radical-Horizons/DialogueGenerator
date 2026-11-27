# Brief d'une session de story

La session fille ne voit que ce texte. Remplir les `<…>`, garder **un seul** des deux
paragraphes « Approbation ».

---

Story `<clé>` de l'epic `<N>` de DialogueGenerator. Note du tableau de sprint :
« <comment, ou « aucune »> ». L'ordre fait foi dans `sprint-status.yaml` : le bloc d'un
epic peut contenir des stories d'un autre numéro, qui en font partie.

**1. Construire.** Invoque le skill `bmad-method:bmad-build` avec la clé `<clé>` et suis-le
en entier. Utilise la clé complète pour `sprint-status.yaml`. Les sous-agents que le
workflow demande sont autorisés.

**Contraintes du poste.** Des modèles IA y tournent presque toujours : aucune mesure ni
vérification ne doit supposer un PC au repos, et ne tue aucun processus qui n'est pas à toi.
N'ouvre jamais de fenêtre de navigateur (navigateur intégré ou Playwright headless).

**Rendre la main.** La session parente est réveillée à chaque fin de ton tour. Lance les
tests et autres commandes longues **au premier plan** (délai de 10 min) plutôt qu'en
arrière-plan, et ne termine pas ton tour avant `PRÊT`, `QUESTION` ou `BLOQUÉ` si tu peux
l'éviter.

**Approbation (mode validation).** À chaque arrêt de `bmad-build` (approbation de spec,
question ouverte, découpage, arbre sale), termine ton tour en posant la question et ses
options dès les premières lignes. La session parente la relaiera à l'utilisateur. Si
`bmad-build` prend la route `oneshot`, qui n'a pas d'approbation, termine ton tour avec
l'`Intent` de la spec **avant** de coder.

**Approbation (mode auto).** L'utilisateur a lancé la boucle avec `auto` : ses mots sont
« <citer son message> ». Si la spec n'a aucune question ouverte, choisis « Approve and
continue » (et « Keep full spec » si elle dépasse la taille visée). Toute question
ouverte, tout découpage en plusieurs livrables et tout écart d'intention arrêtent le
travail : termine ton tour en posant la question dès les premières lignes.

Les arrêts de fin de `bmad-build` (attendre l'utilisateur, proposer une PR) ne terminent pas
ta mission : enchaîne l'étape 2.

**2. Valider.** Après `bmad-build`. Un worktree neuf n'a pas forcément ses dépendances : s'il
manque `.venv`, `node_modules` ou `frontend/node_modules`, installe-les (`npm run setup`,
`npm ci`, `npm --prefix frontend ci`). **Pas de jonction** vers le dépôt principal : la
suppression automatique du worktree pourrait vider les vraies dépendances.


- `npm run test:premerge` vert (corrige et relance sinon) ;
- si `frontend/` a bougé : `npm --prefix frontend run typecheck` ;
- si le changement se voit : preuve dans le navigateur intégré avec la configuration
  `dialogue-generator-dev-sans-llm`, avec captures, puis `npm run dev:stop`.

Aucun appel LLM facturé : un worktree hérite du `.env` du dépôt principal, donc tout
serveur lancé autrement doit avoir `OPENAI_API_KEY` vidée.

**3. Livrer.** Passe la story à `done` dans `sprint-status.yaml` (et `last_updated`), sans
toucher aux autres lignes : ce statut n'atteindra `main` qu'à la fusion. Commit, push,
puis `gh pr create --base main`. **Ne fusionne pas**, la session parente vérifie et
fusionne. N'attends pas la CI.

L'utilisateur veut que la boucle soit réveillée quand la CI échoue : après `gh pr create`,
lis `mcp__ccd_pr__get_status` ; si `monitor.auto_fix` est faux, active-le avec
`mcp__ccd_pr__set_monitor`. Réveillée par un échec : corrige, pousse, et rends compte de
nouveau avec la même première ligne.

**4. Rendre compte.** La première ligne de ton dernier message est exactement l'une de :

- `PRÊT <clé> <url de la PR>`
- `QUESTION <clé> : <la question>`
- `BLOQUÉ <clé> : <la cause, avec la sortie qui la prouve>`

Ensuite, en quelques lignes : ce qui a été fait, les tests exécutés et leur résultat, ce
qui a été reporté. N'ouvre pas d'autre session et n'envoie pas de message à la parente :
l'application la prévient quand ton tour se termine.
