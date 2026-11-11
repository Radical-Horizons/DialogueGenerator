---
description: Environnement virtuel Python — configuration et utilisation, plus .env
---
- **Environnement virtuel** : Le projet utilise un venv Python (`.venv/`) pour isoler les dépendances
- **Utilisation automatique** : Tous les scripts npm utilisent automatiquement le venv (pas d'activation manuelle nécessaire)
- **Installation initiale** : `npm run setup` (créer venv + installer toutes les dépendances)
- **Vérification** : `npm run verify:venv` (vérifier que le venv est correctement configuré)
- **Scripts adaptés** : 
  - `scripts/getPythonPath.js` : Détecte et retourne le chemin Python du venv (Node.js)
  - `scripts/Get-VenvPython.ps1` : Détecte et retourne le chemin Python du venv (PowerShell)
  - `scripts/setup-venv.ps1` : Créer et configurer le venv
  - `scripts/verify-venv.ps1` : Vérifier l'installation du venv
  - `scripts/activate-venv.ps1` : Activer manuellement le venv (si nécessaire)
- **Activation manuelle** (seulement si commandes Python directes) : `.\scripts\activate-venv.ps1` ou `.\.venv\Scripts\Activate.ps1`
- **Fallback gracieux** : Si le venv n'existe pas, le système utilise Python global avec un avertissement
- **Dépannage** :
  - "Python non trouvé" ou "module non trouvé" : `npm run setup`
  - Dépendances manquantes : `npm run verify:venv` puis `npm run setup`
  - Venv corrompu : Supprimer `.venv/` puis `npm run setup`

Le fichier .env est à bien présent à la racine du projet.
Il est en .gitignore (donc tu ne le vois pas, c'est normal, demander à l'user quand il faut le 
modifier)

⚠️ **Une variable d'environnement Windows l'emporte sur `.env`.** `api/main.py` appelle
`load_dotenv()` sans `override` : une clé déjà présente dans l'environnement (variable
utilisateur ou système Windows) masque celle du `.env`, en silence. Vécu en septembre 2026 :
`OPENAI_API_KEY` et `NOTION_API_KEY` étaient définies au niveau utilisateur — pytest en
héritait (d'où le retrait dans `tests/conftest.py`), et après révocation, la clé morte aurait
masqué la nouvelle clé du `.env`. `OPENAI_API_KEY` a été retirée des variables utilisateur le
2026-09-30 ; `NOTION_API_KEY` y est toujours. Une variable retirée reste dans l'environnement
des processus déjà lancés (Claude Desktop, terminaux ouverts, `npm run dev` lancé depuis eux)
jusqu'à leur redémarrage. Diagnostic sans afficher de valeur :
`[Environment]::GetEnvironmentVariable('OPENAI_API_KEY','User')` non vide ⇒ elle masque le `.env`.

⚠️ **Un worktree sans `.env` hérite de celui du dépôt principal.** `load_dotenv()` sans
chemin remonte les dossiers parents depuis `api/` ; un worktree vit sous
`.claude/worktrees/<nom>/`, donc il trouve le `.env` de `F:\Projets\DialogueGenerator` et
sa vraie `OPENAI_API_KEY`. Vécu le 2026-11-11 : un agent comptait sur `DummyLLMClient` dans
son worktree et a déclenché deux vrais appels facturés. Pour une API locale sans dépense,
lancer avec la clé vidée explicitement (`OPENAI_API_KEY=` dans l'environnement du processus).