---
name: plan
description: Plans implementation work into incremental, testable, deployable phases. Use when scoping new features, refactors, or migrations that need to ship in safe, independent chunks.
---

## Purpose

Break down work into **sequential phases** where each phase:
1. Builds on the previous phase
2. Can be independently tested and verified
3. Can be independently deployed without breaking the existing system
4. Delivers tangible, visible progress

## Planning Process

### Step 1 — Understand the Full Scope

- Read all relevant code, docs, and config before planning
- Identify every file, service, and integration that will be touched
- Map dependencies between changes (what depends on what)

### Step 2 — Identify the Dependency Graph

- Determine which changes are prerequisites for others
- Find the natural seams where work can be split without leaving the system in a broken state
- Flag any changes that are inherently atomic (cannot be split) and explain why

### Step 3 — Define Phases

For each phase, specify:
- **Goal:** One sentence describing what this phase accomplishes
- **Changes:** List of specific files/components being modified
- **Dependencies:** Which prior phase(s) must be complete
- **Test plan:** How to verify this phase works correctly in isolation
- **Deploy notes:** Any deploy order requirements, feature flags, or environment config needed
- **Rollback:** What to revert if this phase causes issues in production

### Step 4 — Surface Conflicts and Risks

When changes **cannot** be split into independent deployable phases, do NOT silently merge them. Instead:
- Clearly explain **why** the changes are coupled
- Present the developer with options:
  - Option A: Deploy coupled changes together as a single phase (larger blast radius)
  - Option B: Use a feature flag to gate the new behavior
  - Option C: Use a backwards-compatible migration strategy (old and new code coexist temporarily)
  - Option D: Any other approach specific to the situation
- State the tradeoffs of each option and let the developer decide

## Rules

- **No big-bang deployments.** If the plan has a single phase that touches everything, break it down further or justify why it cannot be broken down.
- **Backend before frontend.** API changes and data migrations should land before UI changes that depend on them, with backwards compatibility so the existing frontend continues working.
- **Database migrations are always their own phase.** Schema changes, index additions, and data backfills ship and verify separately before code that depends on them.
- **Each phase must pass all existing tests.** If a phase would break an existing test, either fix the test in that phase or explain why the breakage is expected and temporary.
- **Keep phases small.** Aim for phases that can be reviewed in a single PR. If a phase is too large, split it further.

## Output Format

```
## Phase 1: [Short title]
**Goal:** ...
**Changes:** ...
**Test plan:** ...
**Deploy notes:** ...
**Rollback:** ...

## Phase 2: [Short title]
**Depends on:** Phase 1
**Goal:** ...
**Changes:** ...
**Test plan:** ...
**Deploy notes:** ...
**Rollback:** ...

---

## Conflicts & Decision Points
[Any coupled changes that need developer input, with options and tradeoffs]
```
