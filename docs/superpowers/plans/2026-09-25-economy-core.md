# Economy Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic city treasury loop where current population/employment generate tax revenue, roads create operating costs, and road construction spends city funds without introducing financial-history save bloat.

**Architecture:** Persist only the authoritative current treasury and its version. Daily revenue/cost/net figures are derived from current households, companies, employment, and road state and are never redundantly serialized. A daily economy system settles once every 24 simulated hours. Road construction reuses the existing compact `constructionCost` plan value and deducts funds atomically before committing roads.

**Tech Stack:** TypeScript 5.9.3, Vitest 5.0.1, existing SimulationEngine / CityWorld v3 / compact codecs / population-jobs statistics / road build plan.

**Spec:** `docs/superpowers/specs/2026-09-24-city-core-design.md`

## Global Constraints

- All money uses safe integer currency units; no floating-point currency.
- Default starting treasury: **1,000,000**.
- Operating deficits may make treasury negative.
- Player construction commands may not spend more than the current treasury.
- EconomyState stores current state only:
  - `version`
  - `treasury`
- Do not persist daily/monthly/yearly history arrays.
- Do not persist derived revenue/cost/net values.
- Daily tax model for this phase:
  - resident tax: **3 / person / day**
  - employment tax: **7 / employed worker / day**
- Daily operating cost model for this phase:
  - two-lane road maintenance: **1 / current road node / day**
- Daily flow:
  - `taxRevenue = population * 3 + employed * 7`
  - `operatingCost = roadNodeCount * 1`
  - `net = taxRevenue - operatingCost`
- Economy settlement occurs at the end of each simulated 24-hour day.
- A zero-net settlement preserves EconomyState object/version.
- Economy settlement consumes no RNG.
- Existing `ROAD_TWO_LANE_CELL_COST = 100` remains the road construction price source.
- Road command no-op with `constructionCost = 0` must preserve EconomyState object/version.
- Insufficient construction funds must fail before road mutation and command caching.
- CityWorld codec increments to version 4.
- Taxes/policies sliders, bonds, loans, public-service costs, utility fees, budget history graphs, land value, dynamic demand and traffic remain out of scope.

## Review Focus

1. No floating-point or unsafe-integer money.
2. No financial ledger/history arrays in durable saves.
3. Road spending is atomic with road mutation.
4. Duplicate command replay never double-charges.
5. Revision conflicts / validation errors / insufficient funds never charge.
6. Daily settlement fires exactly once per 24 simulated hours.
7. Save → restore → continue gives the same treasury as uninterrupted simulation.
8. Long-running simulation changes scalar values only; serialized size must not grow with elapsed days.

---

### Task 1: Add compact economy state + codec

**Files:**
- Create: `src/simulation/economy/economy-state.ts`
- Create: `src/persistence/codec/economy-codec.ts`
- Create: `tests/unit/economy/economy-state.test.ts`
- Create: `tests/unit/persistence/economy-codec.test.ts`

**Runtime:**
```ts
type EconomyState = {
  version: number;
  treasury: number;
}
```

**Codec:** `[version, treasury]`

- [ ] version is non-negative safe integer.
- [ ] treasury is any safe integer, including negative.
- [ ] default = version 0 / treasury 1,000,000.
- [ ] `applyTreasuryDelta()` guards overflow.
- [ ] `spendTreasury()` accepts non-negative safe integer cost and rejects insufficient funds.
- [ ] zero delta/cost preserves object identity.
- [ ] strict codec tuple/version validation.

---

### Task 2: Add derived daily economy flow

**Files:**
- Create: `src/simulation/economy/daily-economy-flow.ts`
- Create: `tests/unit/economy/daily-economy-flow.test.ts`

**Derived output:**
```ts
type DailyEconomyFlow = {
  taxRevenue: number;
  operatingCost: number;
  net: number;
}
```

- [ ] use current population/jobs statistics.
- [ ] resident tax = population × 3.
- [ ] employment tax = employed × 7.
- [ ] road maintenance = road nodes × 1.
- [ ] all multiplication/addition/subtraction safe-integer guarded.
- [ ] empty city => all zero.
- [ ] unemployed workers do not contribute employment tax.
- [ ] flow is derived only and never persisted.

---

### Task 3: Extend CityWorld with economy and codec v4

**Files:**
- Modify: `src/simulation/world/city-world-state.ts`
- Modify: `src/persistence/codec/city-world-codec.ts`
- Modify: `tests/unit/persistence/city-world-codec.test.ts`

- [ ] add `economy: EconomyState` as final additive create argument.
- [ ] starter city receives default economy.
- [ ] CityWorld codec version = 4.
- [ ] encoded world persists compact economy tuple only.
- [ ] JSON save contains no derived flow/history.
- [ ] unsupported version and malformed economy tuple rejected.

---

### Task 4: Make road construction actually spend treasury

**Files:**
- Modify: `src/simulation/roads/build-road-command.ts`
- Modify: `tests/unit/roads/build-road-command.test.ts`

- [ ] successful 2-cell starter road costs 200 and treasury decreases by 200.
- [ ] economy version increments once for a non-zero construction spend.
- [ ] all-existing road no-op costs 0 and preserves economy object/version.
- [ ] insufficient funds rejects before road/economy commit and command cache.
- [ ] water/zone/building/invalid path rejection never charges.
- [ ] stale revision never charges.
- [ ] duplicate command ID replay returns cached response and never double-charges.
- [ ] construction response stays below ordinary response budget.

---

### Task 5: Add deterministic daily economy settlement system

**Files:**
- Create: `src/simulation/economy/daily-economy-system.ts`
- Create: `tests/unit/economy/daily-economy-system.test.ts`

**Hourly behavior:**
- settle when `(clock.elapsedHours + 1) % 24 === 0`.
- otherwise return world unchanged.
- derive current daily flow at settlement time.
- apply net to treasury.
- if net = 0, preserve world/economy identity.
- consume no RNG.

- [ ] 23 hours => no settlement.
- [ ] 24th hour => exactly one settlement.
- [ ] 48 hours => exactly two settlements.
- [ ] population/employment increases tax revenue.
- [ ] roads create maintenance cost.
- [ ] deficit may move treasury below zero.
- [ ] no RNG consumption.
- [ ] same state/horizon deterministic.
- [ ] uninterrupted 30 days == 15 days → save/restore with fresh system → 15 days.

---

### Task 6: Long-run economy/storage regression + review

**Files:**
- Create: `tests/simulation/economy-soak.test.ts`
- Update PR body after verification.

- [ ] fully populated developed fixture remains below the existing 512 KiB current-state budget.
- [ ] 10-year developed-city economy run remains finite/safe.
- [ ] additional years with unchanged live entities do not create history-sized save growth.
- [ ] 50-year smaller fixture remains deterministic and within safe integer money range.
- [ ] save/restore long-horizon treasury matches uninterrupted run.
- [ ] encoded save contains no `dailyHistory`, `ledger`, `transactions`, or derived flow cache.
- [ ] run:
  - `npm run verify`
  - `npm run e2e`
  - `npx wrangler deploy --dry-run`
- [ ] whole-PR review.
- [ ] any Critical/Important issue gets RED→GREEN correction.
- [ ] mark Ready only on latest fully green head.

## Acceptance

PR #8 is ready when:
- city treasury is authoritative and compact;
- current population/employment creates daily tax revenue;
- current roads create daily operating costs;
- road construction deducts its existing construction cost atomically;
- insufficient funds cannot mutate roads;
- no finance history grows with elapsed simulation time;
- save/restore remains deterministic;
- unit, simulation, build, E2E and Cloudflare dry-run gates are green.
