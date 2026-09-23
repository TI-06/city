# PR #2 Simulation Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans in this harness. Every behavior change follows superpowers:test-driven-development and completion claims require superpowers:verification-before-completion.

**Goal:** Add a deterministic, headless simulation kernel with seeded randomness, simulation time, revisioned commands, bounded idempotency metadata, and current-state-only snapshots that remain small regardless of command history length.

**Architecture:** The kernel lives entirely under `src/simulation/` and must not import React or Phaser. It owns authoritative simulation state and deterministic progression. Runtime-only retry/deduplication data stays outside durable state, so long play sessions cannot inflate saves merely because many commands have been issued.

**Tech Stack:** TypeScript 5.9.3, Vitest 5.0.1, existing Foundation transport/save contracts.

**Spec:** `docs/superpowers/specs/2026-09-24-city-core-design.md`

## Global Constraints

- No React, ReactDOM, or Phaser imports from `src/simulation/**`.
- No `Math.random()` inside simulation code.
- Same seed + same initial world + same command/tick sequence must produce identical state.
- RNG state must be serializable and restorable.
- Command payload hard guard from Foundation must run at the real dispatch boundary.
- Duplicate command IDs are checked before revision conflicts so retrying a successfully applied command is idempotent.
- Deduplication metadata is bounded to 256 recent commands by default.
- Deduplication metadata is runtime-only and must never be included in a normal save.
- Normal command responses remain compact deltas; no command response may default to a `GameSave`.
- Revision conflicts return a compact conflict object; they must not silently overwrite state.
- Headless stepping must not require DOM, React, Phaser, or browser globals.
- A 100-year empty-world soak must complete deterministically without NaN/Infinity.
- Replaying 10,000 no-op commands must not make serialized save size grow linearly with historical command count.
- PR #2 is stacked on `feat/foundation` until PR #1 is merged.

## Review Focus

1. Duplicate retry after revision advances must replay the cached compact response rather than execute twice.
2. Cache eviction must be bounded and deterministic; oldest entries leave first.
3. Restoring RNG state must continue the exact same random sequence.
4. Snapshot serialization must exclude the recent-command cache.
5. Unknown commands and revision conflicts must not mutate world, clock, RNG, or revision.
6. Kernel modules must remain free of React/Phaser and direct `Math.random()`.
7. Batch stepping must equal repeated single-step execution for the same seed and systems.

---

### Task 1: Add repository-level AI/project instructions

**Files:**
- Create: `AGENTS.md`
- Modify: `eslint.config.js`

**Produces:** durable project-specific rules; architecture enforcement for simulation imports and randomness.

- [ ] Create `AGENTS.md` documenting:
  - core loop and architecture boundaries,
  - save/request size rules,
  - required development skills: brainstorming for new mechanics, writing-plans before multi-step code, TDD for behavior, systematic-debugging for failures, verification-before-completion, product-design/get-context + ideate + design-qa for UI/art,
  - no project-specific custom Skill: project conventions live here,
  - graphic direction is selected before mass asset generation,
  - fixed-seed visual fixtures for UI/render regression.

- [ ] Add an ESLint override for `src/simulation/**/*.{ts,tsx}`:
  - reject imports from `react`, `react-dom`, and `phaser`,
  - reject `Math.random`.

- [ ] Run `npm run lint` and `npm run typecheck`.

---

### Task 2: Implement serializable deterministic RNG

**Files:**
- Create: `src/simulation/core/seeded-random.ts`
- Create: `tests/unit/simulation/seeded-random.test.ts`

**Produces:**
- `RandomSeed = string | number`
- `RandomState = readonly [number, number, number, number]`
- `SeededRandom.fromSeed(seed)`
- `SeededRandom.fromState(state)`
- `nextUint32()`
- `nextFloat()`
- `snapshot()`

- [ ] RED: same seed produces same sequence; different seeds differ.
- [ ] RED: snapshot/restore continues the exact sequence.
- [ ] RED: `nextFloat()` remains in `[0, 1)`.
- [ ] GREEN: implement a deterministic 32-bit xoshiro-style generator initialized from a stable string/number hash.
- [ ] Run focused test then full unit suite.

---

### Task 3: Implement simulation clock and headless system contract

**Files:**
- Create: `src/simulation/core/simulation-clock.ts`
- Create: `src/simulation/core/simulation-system.ts`
- Create: `tests/unit/simulation/simulation-clock.test.ts`

**Produces:**
- `SimulationClockState { elapsedHours: number }`
- `SIMULATION_HOURS_PER_DAY = 24`
- `SIMULATION_DAYS_PER_YEAR = 365`
- `SIMULATION_HOURS_PER_YEAR = 8760`
- `advanceClock(clock, hours)`
- `SimulationSystem<TWorld>`

- [ ] RED: clock advances exactly by integer hours.
- [ ] RED: negative/non-integer/non-finite hour advancement is rejected.
- [ ] RED: 100 years remains a finite safe integer.
- [ ] GREEN: pure clock functions only; no wall clock access.

---

### Task 4: Implement bounded recent-command cache

**Files:**
- Create: `src/simulation/core/recent-command-cache.ts`
- Create: `tests/unit/simulation/recent-command-cache.test.ts`

**Produces:**
- `DEFAULT_RECENT_COMMAND_LIMIT = 256`
- `RecentCommandCache<T>`
- `get(commandId)`, `set(commandId, response)`, `size`

- [ ] RED: duplicate key returns stored response.
- [ ] RED: inserting beyond limit evicts oldest entry first.
- [ ] RED: updating an existing key does not exceed size and makes it newest.
- [ ] RED: invalid limits (0, negative, non-integer) throw.
- [ ] GREEN: use bounded Map insertion order; no persistence dependency.

---

### Task 5: Implement revisioned SimulationEngine command dispatch

**Files:**
- Create: `src/simulation/core/simulation-state.ts`
- Create: `src/simulation/core/command-handler.ts`
- Create: `src/simulation/core/simulation-engine.ts`
- Create: `tests/unit/simulation/simulation-engine-command.test.ts`

**Produces:**
- `SimulationState<TWorld>`
- `CommandHandler<TWorld>`
- `SimulationEngine<TWorld>`
- compact dispatch result union using Foundation `MutationResponse` / `RevisionConflict`.

**Command order:**
1. measure/reject oversized command,
2. replay matching recent command ID if cached,
3. compare `baseRevision`,
4. resolve handler,
5. apply world mutation with deterministic RNG context,
6. increment revision,
7. store compact response in bounded cache.

- [ ] RED: compact command applies exactly once and increments revision.
- [ ] RED: duplicate command ID replays same response without reapplying mutation.
- [ ] RED: retry still replays after later revision advances.
- [ ] RED: stale unknown command returns/throws without mutation as specified.
- [ ] RED: revision conflict returns compact conflict and leaves all state unchanged.
- [ ] RED: >256 KiB command is rejected before handler execution.
- [ ] GREEN: implement minimal engine.
- [ ] Run unit suite and typecheck.

**Ruling:** Unknown command should throw `UnknownSimulationCommandError` because it is a programmer/protocol error, while revision mismatch is an expected synchronization condition returned as data.

---

### Task 6: Add deterministic systems stepping and headless runner

**Files:**
- Modify: `src/simulation/core/simulation-engine.ts`
- Create: `src/simulation/core/headless-runner.ts`
- Create: `tests/unit/simulation/simulation-engine-step.test.ts`
- Create: `tests/simulation/kernel-soak.test.ts`

**Produces:**
- `engine.step(hours = 1)`
- `runHeadless(engine, hours)`

- [ ] RED: a deterministic system receives clock + RNG and returns a new world.
- [ ] RED: `step(24)` equals 24 calls to `step(1)`.
- [ ] RED: same seed/system/horizon produces identical final state.
- [ ] RED: 100-year empty-world headless soak completes with finite clock/revision and deterministic state.
- [ ] RED: invalid step counts are rejected.
- [ ] GREEN: run systems one in-game hour at a time to preserve equivalence and deterministic RNG ordering.
- [ ] Run unit + simulation suites.

---

### Task 7: Add current-state kernel save/restore and history-growth regression

**Files:**
- Create: `src/simulation/core/kernel-save.ts`
- Create: `tests/unit/simulation/kernel-save.test.ts`
- Modify: `tests/simulation/kernel-soak.test.ts`

**Produces:**
- `KERNEL_SAVE_VERSION = 1`
- `createKernelSave(engine, savedAtIso)`
- `restoreKernelState(save)`

- [ ] RED: save/restore preserves world, revision, clock, and RNG state.
- [ ] RED: continuing after restore produces the same state as uninterrupted execution.
- [ ] RED: runtime recent-command cache is not serialized.
- [ ] RED: after 10,000 no-op commands, serialized snapshot growth is bounded to metadata digit growth (<128 bytes versus an equivalent initial world), not command-history growth.
- [ ] RED: save remains under Foundation starter budget for the kernel fixture.
- [ ] GREEN: save contains only `SimulationState<TWorld>` inside Foundation `SaveEnvelope`.
- [ ] Run unit + simulation suites.

---

### Task 8: Strengthen CI and complete stacked PR

**Files:**
- Modify only if needed: `.github/workflows/quality.yml`
- Update PR body.

- [ ] Run `npm run verify`.
- [ ] Run `npm run e2e`.
- [ ] Run `npx wrangler deploy --dry-run`.
- [ ] Inspect diff against `feat/foundation`.
- [ ] Whole-branch review with focus on determinism, mutation on error paths, cache bounds, save exclusion, and dependency boundaries.
- [ ] Fix Critical/Important findings using RED→GREEN.
- [ ] Open stacked PR against `feat/foundation`.
- [ ] Keep PR #1 and PR #2 unmerged until explicit merge authorization.

## Acceptance

PR #2 is ready when:
- the kernel is deterministic and headless,
- all command mutations are revisioned,
- duplicate commands are bounded/idempotent,
- oversized commands are guarded at dispatch,
- runtime retry metadata is excluded from saves,
- 100-year empty-world soak is green,
- 10,000-command history does not linearly inflate the save,
- all repository quality gates remain green.
