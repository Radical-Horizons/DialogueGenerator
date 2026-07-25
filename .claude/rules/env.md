---
description: Environnement virtuel Python — configuration et utilisation, plus .env
globs: []
alwaysApply: true
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