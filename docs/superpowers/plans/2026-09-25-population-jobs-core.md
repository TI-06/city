# Population & Jobs Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn developed buildings into population and jobs using compact household/company abstractions, deterministic occupancy growth, and derived city statistics without introducing per-citizen save bloat.

**Architecture:** Residential buildings may host one household entity; commercial/industrial buildings may host one company entity. Households and companies store stable building IDs instead of embedded building copies. Macro population/labor/jobs/employment statistics are derived from current entities and are not redundantly persisted. Occupancy candidates are cached by building/occupancy versions and rebuilt only when authoritative inputs change.

**Tech Stack:** TypeScript 5.9.3, Vitest 5.0.1, existing SimulationEngine / seeded RNG / CityWorld v2 / automatic-development system / compact tuple codecs.

**Spec:** `docs/superpowers/specs/2026-09-24-city-core-design.md`

## Global Constraints

- Do not create one durable entity per citizen.
- One residential building may host at most one household in this phase.
- One commercial/industrial building may host at most one company in this phase.
- Household references `homeBuildingId`; company references `buildingId`.
- No household/company embeds a Building object.
- Stable positive numeric IDs; monotonic next IDs; no historical entity arrays.
- Household tuple stores current `memberCount` and `workerCount`.
- Initial household memberCount: 1..4.
- Initial household workerCount: 1..min(2, memberCount).
- Commercial level-1 company job capacity: 8.
- Industrial level-1 company job capacity: 12.
- Company kind must match the referenced building use.
- Existing households/companies follow their building entity even if underlying zoning later changes.
- Population statistics are derived:
  - population = sum household memberCount
  - laborForce = sum household workerCount
  - jobs = sum company jobCapacity
  - employed = min(laborForce, jobs)
  - unemployed = laborForce - employed
- Derived statistics are runtime values only and are not duplicated into the save.
- Occupancy simulation creates at most one household and at most one company per simulated hour.
- Candidate lists are derived/cache-only and are never serialized.
- If no eligible occupancy candidate exists, that side of the occupancy system consumes no RNG.
- Save growth must remain proportional to current households/companies, not simulation hours or failed move-in attempts.
- CityWorld codec increments to version 3 on this stacked branch.
- Demolition/relocation/birth/death/aging/commuting/taxes/dynamic demand remain out of scope.

## Review Focus

1. Household/company building references must resolve on CityWorld construction/decode.
2. A residential household cannot reference a non-residential building.
3. A company cannot reference a residential building and its kind must match commercial/industrial building use.
4. Duplicate occupancy of a building must be rejected.
5. Durable entities contain only IDs and compact scalar fields.
6. Occupancy runtime caches must rebuild correctly after save/restore and must not be serialized.
7. Long-run save size follows current entity counts only.

---

### Task 1: Add normalized household state + compact codec

**Files:**
- Create: `src/simulation/population/household-state.ts`
- Create: `src/persistence/codec/household-codec.ts`
- Create: `tests/unit/population/household-state.test.ts`
- Create: `tests/unit/persistence/household-codec.test.ts`

**Runtime:**
```ts
type Household = {
  id: number;
  homeBuildingId: number;
  memberCount: number;
  workerCount: number;
}
type HouseholdState = {
  version: number;
  nextHouseholdId: number;
  households: readonly Household[];
}
```

**Codec tuple:** `[id, homeBuildingId, memberCount, workerCount]`.

- [ ] version non-negative safe integer.
- [ ] IDs/homeBuildingId positive safe integers.
- [ ] memberCount 1..4.
- [ ] workerCount 1..min(2, memberCount).
- [ ] unique household IDs and unique homeBuildingIds.
- [ ] next ID > current maximum.
- [ ] strict tuple length/version decode.
- [ ] no Map/Set persisted in state.

---

### Task 2: Add normalized company state + compact codec

**Files:**
- Create: `src/simulation/economy/company-state.ts`
- Create: `src/persistence/codec/company-codec.ts`
- Create: `tests/unit/economy/company-state.test.ts`
- Create: `tests/unit/persistence/company-codec.test.ts`

**Runtime:**
```ts
type CompanyKind = 'commercial' | 'industrial';
type Company = {
  id: number;
  buildingId: number;
  kind: CompanyKind;
  jobCapacity: number;
}
```

**Codec tuple:** `[id, buildingId, kindCode, jobCapacity]`.

- [ ] stable IDs and unique company/building IDs.
- [ ] jobCapacity positive safe integer.
- [ ] strict kind/tuple validation.
- [ ] next ID monotonic.

---

### Task 3: Add derived population/jobs statistics

**Files:**
- Create: `src/simulation/population/population-jobs-statistics.ts`
- Create: `tests/unit/population/population-jobs-statistics.test.ts`

**Produces:**
```ts
type PopulationJobsStatistics = {
  population: number;
  laborForce: number;
  jobs: number;
  employed: number;
  unemployed: number;
}
```

- [ ] derive from household/company current state only.
- [ ] do not persist these statistics.
- [ ] use safe-integer overflow guards.
- [ ] empty city returns all zeroes.
- [ ] jobs > laborForce and laborForce > jobs cases covered.

---

### Task 4: Extend CityWorld to households + companies and codec v3

**Files:**
- Modify: `src/simulation/world/city-world-state.ts`
- Modify: `src/persistence/codec/city-world-codec.ts`
- Modify: `tests/unit/persistence/city-world-codec.test.ts`
- Update fixtures only where required.

**CityWorld v3 additions:**
- `households: HouseholdState`
- `companies: CompanyState`

Validation:
- each household homeBuildingId resolves;
- referenced building use must be residential;
- no residential building has >1 household;
- each company buildingId resolves;
- company building use must be commercial/industrial;
- company kind must match building use;
- no company building has >1 company.

- [ ] starter city gets empty states.
- [ ] codec v3 persists compact household/company states.
- [ ] malformed/dangling/mismatched references rejected on decode.
- [ ] current building survives zoning changes; references remain valid.
- [ ] JSON save contains no embedded building objects in household/company tuples.

---

### Task 5: Add deterministic occupancy growth system

**Files:**
- Create: `src/simulation/population/occupancy-growth-system.ts`
- Create: `tests/unit/population/occupancy-growth-system.test.ts`

**Derived runtime caches:**
- eligible residential building IDs keyed by building version + household version;
- eligible commercial/industrial building IDs keyed by building version + company version;
- building ID→building lookup keyed by building version.

**Each simulated hour:**
- if residential candidates exist:
  - choose one seeded-random candidate;
  - generate household memberCount `1 + rng % 4`;
  - workerCount `1 + rng % min(2, memberCount)`;
  - append one household.
- if company candidates exist:
  - choose one seeded-random candidate;
  - create one company:
    - commercial -> 8 jobs
    - industrial -> 12 jobs.
- at most one household + one company per hour.
- if one side has no candidates, it consumes no RNG for that side.
- no full building scan every hour unless a relevant version changed.

- [ ] no building -> no occupancy/no RNG.
- [ ] residential only -> households only.
- [ ] commercial/industrial only -> companies only.
- [ ] building already occupied -> skipped.
- [ ] same seed/state/horizon deterministic.
- [ ] save at midpoint + restore with fresh caches == uninterrupted run.
- [ ] derived population/jobs stats increase as entities appear.

---

### Task 6: Long-run storage and simulation regression

**Files:**
- Create: `tests/simulation/population-jobs-soak.test.ts`
- Update PR body after verification.

- [ ] 5,000 mixed buildings fully occupied into households/companies.
- [ ] assert compact CityWorld save remains <512 KiB for the 5,000-building fixture.
- [ ] run 5,000 simulated hours on a bounded developed city and verify:
  - no duplicate household/company IDs;
  - no duplicate occupied building IDs;
  - all references resolve;
  - derived counts are finite/safe;
  - save contains no candidate caches or historical attempts.
- [ ] save/restore deterministic continuation over a long horizon.
- [ ] verify current-state size is stable after additional hours once all buildings are occupied.
- [ ] run:
  - `npm run verify`
  - `npm run e2e`
  - `npx wrangler deploy --dry-run`
- [ ] whole-PR self-review.
- [ ] any Critical/Important issue gets RED→GREEN correction.
- [ ] mark Ready only on latest fully green head.

## Acceptance

PR #7 is ready when:
- developed residential buildings gain compact household entities;
- developed commercial/industrial buildings gain compact company/job entities;
- population/jobs/employment/unemployment can be derived without per-citizen persistence;
- entities reference buildings by stable IDs only;
- save/restore continuation is deterministic;
- occupancy caches/history are not serialized;
- long-run save size is tied to current households/companies only;
- unit, simulation, build, E2E, and Cloudflare dry-run gates are green.
