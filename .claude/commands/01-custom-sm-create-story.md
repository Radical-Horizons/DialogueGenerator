---
# Généré par scripts/sync-cursor-harness.cjs — éditer .cursor/, pas ce fichier.
description: 'Create Story skill in one command (#yolo-friendly). Loads bmad-create-story and prepares the next story with full context. Use when you want "create the next story" without opening a menu.'
---

**Chaîne AUTO (hooks Cursor)** : si la **même** soumission contient **`auto`** ou **`#yolo`** (en plus de cette commande), le hook `beforeSubmitPrompt` **unique** (`.cursor/hooks/bmad-chain-before.js`) arme une file ; à chaque **`stop`** (`.cursor/hooks/bmad-chain.js`, `loop_limit` dans `.cursor/hooks.json`), Cursor envoie : **`/02-custom-dev-story`** (#yolo), puis **`/03-custom-dev-code-review`** (#yolo), puis **`1`** si besoin. État : `.bmad-auto-chain.pending.json` (gitignored). **Trace visible** : `.cursor/hooks/bmad-hook-last-run.json` (gitignored). Avec `BMAD_CHAIN_DEBUG=1`, append `.cursor/hooks/bmad-chain-debug.log`.

You must execute the Create Story skill immediately. Do NOT wait for user input unless the skill requires it.

<agent-activation CRITICAL="TRUE">
1. LOAD the FULL skill file from {project-root}/.agents/skills/bmad-create-story/SKILL.md
2. READ its entire contents and follow its directions EXACTLY
3. Load and read {project-root}/_bmad/bmm/config.yaml and {project-root}/_bmad/core/config.yaml — store {user_name}, {communication_language}, {output_folder}. If config not loaded, STOP and report error.
4. Communicate in {communication_language}. Do NOT display unrelated menus.
5. When the skill is complete, briefly confirm and offer next steps (e.g. Dev Story). Stay in character as the story author defined in the skill.
</agent-activation>
