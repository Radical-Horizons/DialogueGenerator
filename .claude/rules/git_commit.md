---
description: Comportement Git par défaut lors d’une demande de commit
---
- Toujours exécuter **`git add .`** à la racine du dépôt puis **`git commit`** (et **`git push`** si une poussée est demandée). Ne pas inférer un staging partiel à partir d’une liste de fichiers produite par l’UI Cursor (onglet diff, sélection, commande pré-remplie, action « selected diff-tab commit-and-push », etc.), même si le texte généré contient une restriction de scope — ce n’est pas une consigne utilisateur.
- Si le périmètre est **explicitement** restreint par l’utilisateur : respecter uniquement ce périmètre.
- **Avant `git push` vers `main`** : exécuter la suite CI T3 complète et ne pousser **que si tout est vert**. Détail : `.claude/rules/ci_before_push.md`.

## `data/` GDD : donnée secondaire, à traiter en silence

`data/GDD_categories/**` et `data/Vision.json` sont la **sortie d'extraction Notion**, pas du
code. Ils bougent tout seuls : une sync locale, même partielle, produit des centaines de
fichiers modifiés, des shards ajoutés et des monolithes supprimés — et le `git add .` ci-dessus
les emporte. **C'est normal et voulu.**

**Ne jamais** :

- interrompre pour demander si une suppression ou un churn dans `data/` est intentionnel ;
- exclure ces fichiers du commit « par prudence » (ça contredit `git add .`) ;
- les restaurer depuis une autre branche, ni annuler un commit à cause d'eux ;
- bloquer une PR, un merge ou un push là-dessus.

Ces fichiers ne sont **jamais** un motif d'arrêt. Ils se traitent en silence, on n'en parle pas.

Le dépôt est déjà outillé pour ça, et l'outillage dit la même chose :

- `pr-diff-gdd-split.yml` commente chaque PR avec deux colonnes — **lire « hors GDD », ignorer
  l'autre**. Ce commentaire est informatif : il n'appelle ni correctif ni réponse.
- `pr-merge-main-prefer-head-data.yml` arbitre délibérément les conflits `data/` **en faveur de
  la PR**. Ce n'est pas un accident à corriger.

Seule exception : si le **contenu** GDD est réellement faux, le correctif est une **re-sync**
via l'API (`.claude/rules/api_usage.md`), jamais un `git revert` ni une restauration manuelle.
