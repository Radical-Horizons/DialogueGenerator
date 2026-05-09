# Functional Requirements

### 1. Dialogue Authoring & Generation

**FR1:** Users can generate a single dialogue node with LLM assistance based on selected GDD context  
**FR2:** Users can generate batch of multiple nodes (3-8) from existing player choices  
**FR3:** Users can specify generation instructions (tone, style, theme) for dialogue nodes  
**FR4:** Users can accept or reject generated nodes inline in the graph editor  
**FR5:** Users can manually edit generated node content (text, speaker, metadata)  
**FR6:** Users can create new dialogue nodes manually (without LLM generation)  
**FR7:** Users can duplicate existing nodes to create variations  
**FR8:** Users can delete nodes from dialogues  
**FR9:** System can auto-link generated nodes to existing graph structure  
**FR10:** Users can regenerate rejected nodes with adjusted instructions  

---

### 2. Context Management & GDD Integration

**FR11:** Users can browse available GDD entities (characters, locations, regions, themes)  
**FR12:** Users can manually select GDD context relevant for dialogue generation  
**FR13:** System can automatically suggest relevant GDD context based on configured relevance rules *(Depends on FR14-15)*  
**FR14:** Users can define explicit context selection rules (lieu → region → characters → theme)  
**FR15:** Users can configure context selection rules per dialogue type  
**FR16:** System can measure context relevance (% GDD used in generated dialogue)  
**FR17:** Users can view which GDD sections were used in node generation  
**FR18:** System can sync GDD data from Notion (V2.0+)  
**FR19:** Users can update GDD data without regenerating existing dialogues  
**FR20:** Users can configure token budget for context selection *(NEW - Context budget management)*  
**FR21:** System can optimize context to fit within token budget while maintaining relevance *(NEW)*

---

### 3. Graph Editor & Visualization

**FR22:** Users can view dialogue structure as a visual graph (nodes and connections)  
**FR23:** Users can navigate large graphs (500+ nodes) *(Note: Performance target in NFRs)*  
**FR24:** Users can zoom, pan, and focus on specific graph areas  
**FR25:** Users can drag-and-drop nodes to reorganize graph layout  
**FR26:** Users can create connections between nodes manually  
**FR27:** Users can delete connections between nodes  
**FR28:** Users can search for nodes by text content or speaker name  
**FR29:** Users can jump to specific node by ID or name  
**FR30:** Users can filter graph view (show/hide node types, speakers)  
**FR31:** Users can select multiple nodes in graph (shift-click, lasso selection) *(NEW - Bulk selection)*  
**FR32:** Users can apply operations to multiple selected nodes (delete, tag, validate) *(NEW)*  
**FR33:** Users can access contextual actions on nodes (right-click menu) *(NEW)*  
**FR34:** System can auto-layout graph for readability  
**FR35:** Users can undo/redo graph edit operations  

---

### 4. Quality Assurance & Validation

**FR36:** System can validate node structure (required fields: DisplayName, stableID, text)  
**FR37:** System can detect empty nodes (missing text content)  
**FR38:** System can detect explicit lore contradictions (conflicting GDD facts) *(SPLIT from FR35 - Explicit contradictions)*  
**FR39:** System can flag potential lore inconsistencies for human review *(SPLIT from FR35 - Potential issues)*  
**FR40:** System can detect orphan nodes (nodes not connected to graph)  
**FR41:** System can detect cycles in dialogue flow  
**FR42:** System can assess dialogue quality with LLM judge (score 0-10, ±1 margin for variance) *(CLARIFIED - Added variance tolerance)*  
**FR43:** System can detect "AI slop" patterns (GPT-isms, repetition, generic phrases)  
**FR44:** System can detect context dropping in generated dialogue (lore explicite vs subtil) *(NEW - Context dropping detection)*  
**FR45:** Users can configure anti-context-dropping validation rules *(NEW)*  
**FR46:** Users can simulate dialogue flow to detect dead ends  
**FR47:** Users can view simulation coverage report (% reachable nodes, unreachable nodes)  
**FR48:** System can validate JSON Unity schema conformity (100%)  

---

### 5. Export & Integration

**FR49:** Users can export single dialogue to Unity JSON format  
**FR50:** Users can batch export multiple dialogues to Unity JSON  
**FR51:** System can validate exported JSON against Unity custom schema  
**FR52:** Users can download exported JSON files  
**FR53:** Users can preview export before download (JSON structure, size)  
**FR54:** System can generate export logs with metadata (generation date, cost, validation status)  

---

### 6. Template & Knowledge Management

**FR55:** Users can create custom instruction templates for dialogue generation  
**FR56:** Users can save, edit, and delete templates  
**FR57:** Users can apply templates to dialogue generation  
**FR58:** System can provide pre-built templates (salutations, confrontation, révélation, etc.)  
**FR59:** Users can configure anti-context-dropping templates (subtilité lore vs explicite) *(NEW)*  
**FR60:** Users can browse template marketplace (V1.5+)  
**FR61:** System can A/B test templates and score quality (V2.5+)  
**FR62:** Users can share templates with team members  
**FR63:** System can suggest templates based on dialogue scenario  

---

### 7. Collaboration & Access Control

**FR64:** Users can create accounts with username/password authentication  
**FR65:** Users can log in and log out of the system  
**FR66:** Administrators can assign roles to users (Admin, Writer, Viewer)  
**FR67:** Writers can create, edit, and delete dialogues  
**FR68:** Viewers can read dialogues but cannot edit  
**FR69:** Users can share dialogues with specific team members  
**FR70:** Users can view who has access to each dialogue  
**FR71:** System can track user actions for audit logs (V1.5+)  

---

### 8. Cost & Resource Management

**FR72:** System can estimate LLM cost before generating nodes  
**FR73:** Users can view cost breakdown per dialogue (total cost, cost per node)  
**FR74:** Users can view cumulative LLM costs (daily, monthly)  
**FR75:** System can enforce cost limits per user or team (V1.5+)  
**FR76:** Administrators can configure cost budgets and alerts  
**FR77:** System can display prompt transparency (show exact prompt sent to LLM)  
**FR78:** Users can view generation logs (prompts, responses, costs)  
**FR79:** System can fallback to alternate LLM provider on primary failure (OpenAI → Anthropic) *(NEW - Fallback provider)*  

---

### 9. Dialogue Database & Search

**FR80:** Users can list all dialogues in the system  
**FR81:** Users can search dialogues by name, character, location, or theme  
**FR82:** Users can filter dialogues by metadata (creation date, author, status)  
**FR83:** Users can sort dialogues (alphabetically, by date, by size)  
**FR84:** Users can create dialogue collections or folders for organization  
**FR85:** System can index dialogues for fast search (1000+ dialogues)  
**FR86:** Users can view dialogue metadata (node count, cost, last edited)  
**FR87:** Users can batch validate multiple dialogues *(NEW - Batch validation)*  
**FR88:** Users can batch generate nodes from multiple starting nodes *(NEW - Batch generation)*  

---

### 10. Variables & Game System Integration

**FR89:** Users can define variables and flags in dialogues (V1.0+)  
**FR90:** Users can set conditions on node visibility (if variable X = Y, show node)  
**FR91:** Users can define effects triggered by player choices (set variable, unlock flag)  
**FR92:** Users can preview scenarios with different variable states  
**FR93:** System can validate variable references (detect undefined variables)  
**FR94:** Users can integrate game system stats (character attributes, reputation) (V3.0+)  

---

### 11. Session & State Management

**FR95:** System can auto-save user work every 2 minutes (V1.0+)  
**FR96:** System can restore session after browser crash  
**FR97:** Users can manually save dialogue progress  
**FR98:** Users can commit dialogue changes to Git repository (manual workflow external)  
**FR99:** System can detect unsaved changes and warn before navigation  
**FR100:** Users can view previous versions of dialogue (basic history MVP) *(NEW - Basic history)*  
**FR101:** Users can view edit history for dialogue (detailed V2.0+)  

---

### 12. Onboarding & Guidance

**FR102:** New users can access wizard onboarding for first dialogue creation (V1.0+)  
**FR103:** Users can access in-app documentation and tutorials  
**FR104:** System can provide contextual help based on user actions  
**FR105:** Users can access sample dialogues for learning  
**FR106:** System can detect user skill level and adapt UI (power vs guided mode) (V1.5+)  
**FR107:** Power users can toggle advanced mode for full control *(NEW - Power mode explicit)*  
**FR108:** New users can activate guided mode with step-by-step wizard *(NEW - Guided mode explicit)*  

---

### 13. User Experience & Workflow

**FR109:** Users can preview estimated node structure before LLM generation (dry-run mode) *(NEW - Preview before generation)*  
**FR110:** Users can compare two dialogue nodes side-by-side *(NEW - Comparison)*  
**FR111:** Users can access keyboard shortcuts for common actions (Ctrl+G generate, Ctrl+S save, Ctrl+Z undo, etc.) *(NEW - Keyboard shortcuts)*  

---

### 14. Performance Monitoring

**Note:** Performance targets (generation time, rendering speed, API latency) moved to Non-Functional Requirements.

**FR112:** Users can monitor system performance metrics (generation time, API latency)  
**FR113:** Users can view performance trends over time (dashboard analytics)  

---

### 15. Accessibility & Usability

**FR114:** Users can navigate the graph editor with keyboard (Tab, Arrow keys, Enter, Escape, and shortcuts)  
**FR115:** System can provide visible focus indicators for keyboard navigation  
**FR116:** Users can customize color contrast (WCAG AA minimum)  
**FR117:** System can support screen readers with ARIA labels (V2.0+)  

---