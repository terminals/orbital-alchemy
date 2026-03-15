---
name: attacker-learned
description: Knowledge base of security patterns discovered during attacker agent reviews. Loaded alongside the attacker agent.
---

## Learned Patterns

*Patterns discovered during reviews that should always be checked. Update after significant findings.*

### How to Update This Section

After a review where you find something important:
1. **Pattern that should always be checked** → Add to "Active Patterns" below
2. **Bug that was missed** → Add to "Known Misses" above
3. **False positive** → Consider refining the checklist

### Active Patterns

| Date | Pattern | Why It Matters | Source |
|------|---------|----------------|--------|
| - | - | - | - |

*Example:*
| 2026-01-20 | Check req.params IDs against user ownership | IDOR vulnerability pattern | controller review |
