# Summary: Automated Testing & Quality Framework

DialogueGenerator implements a **4-layer quality framework** inspired by EQ-Bench Creative Writing v3, adapted for CRPG narrative authoring:

**Layer 0 (Foundation):** Dual-tier baselines (Planescape: Torment professional reference + character-specific manual baselines)

**Layer 1 (MVP, $0):** Structural tests (orphans, cycles, agency, branching) - real-time inline badges

**Layer 2 (V1.0, $0):** Slop detection — Slop Score **EQ-Bench aligned** (60% words, 25% not-x-but-y, 15% trigrams, listes officielles) + métriques DG (lore dumps, lexical diversity) et méta-métrique DG Quality Index

**Layer 3 (V1.5, $0.01/node):** Rubric LLM judge (13 CRPG abilities, user toggle) - targeted quality feedback

**Layer 4 (V2.5, $0.02/comparison):** Pairwise Elo ranking (character ranking, template A/B testing) - nice-to-have

**Total annual cost:** ~$1,100 for 1M nodes production (très acceptable)

**Key innovations:**
- **Zero-cost validation** via deterministic tests + baselines (Layers 1-2)
- **Dual-tier baselines** enable character-specific voice validation + genre-level quality benchmarking
- **Planescape: Torment baseline** provides marketing-ready quality badge ("PS:T Quality: 8.6/10 ⭐")
- **Selective LLM judging** (user toggle, 10% sampling) balances quality feedback with cost

**Success criteria:**
- 80%+ generated nodes within baseline thresholds (Slop Score EQ-bench ≤ PS:T+margin, vocab ±0.5, DG Quality Index dans cible)
- <20% manual revision rate (Marc accepts 80%+ as-is)
- 70%+ dialogues achieve "PS:T Quality: 8+/10" (marketing benchmark)

This framework enables DialogueGenerator to achieve **professional CRPG narrative quality at scale (1M+ lines)** while preserving Marc's unique character voices and maintaining cost-conscious LLM usage.