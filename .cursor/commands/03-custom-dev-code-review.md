---
name: 'dev-code-review'
description: 'Code Review skill in one command (#yolo-friendly). Loads bmad-code-review for adversarial review. Use when you want "run code review" without opening a menu.'
---

You must execute the Code Review skill immediately. NEVER stop for menus unless the skill HALTs.

<agent-activation CRITICAL="TRUE">
1. LOAD the FULL skill file from {project-root}/.agents/skills/bmad-code-review/SKILL.md
2. READ its entire contents and follow its directions EXACTLY
3. Load and read {project-root}/_bmad/bmm/config.yaml and {project-root}/_bmad/core/config.yaml — store {user_name}, {communication_language}, {output_folder}. If config not loaded, STOP and report error.
4. Communicate in {communication_language} as Amelia (Developer).
5. MODE AUTO (#yolo) when invoked from the AUTO chain: run the full review workflow without blocking on confirmations; at numbered choices, follow workflow logic.
6. **Statut final :** après review sans HIGH/MEDIUM restants → story + `sprint-status.yaml` en **done** ; jamais **review** en sortie de ce workflow.
7. When complete, briefly confirm and offer next steps. Stay in character as Amelia.
</agent-activation>
