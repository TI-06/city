# Automatic Development Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make valid zoned land automatically develop into deterministic building entities while keeping save state compact, hourly simulation bounded, and the next population/jobs phase easy to layer on.

**Architecture:** Buildings are sparse normalized entities with stable monotonic IDs and implicit 1×1 footprints. Development demand is a tiny persisted state with bounded 0–100 values. The automatic-development system caches only derived runtime indexes: zoned candidate cells are rebuilt only when zoning version changes, while road/building coordinate indexes are rebuilt only when their topology/version changes. Those indexes are never serialized.

**Tech Stack:** TypeScript 5.9.3, Vitest 5.0.1, existing SimulationEngine / seeded RNG / CityWorld codec / ChunkedByteGrid / road-access index.

**Spec:** `docs/superpowers/specs/2026-09-24-city-core-design.md`

## Global Constraints

- Initial building uses are residential, commercial, and industrial.
- Initial footprint is exactly one cell; multi-cell buildings are deferred.
- Initial building level is exactly 1; upgrades/redevelopment are deferred.
- Building entities use stable positive numeric IDs and unique coordinates.
- Building arrays contain current entities only; no historical generations or lifecycle logs.
- Existing buildings may remain when their underlying zoning later changes or is cleared. Rezoning does not instant-demolish a building.
- New roads may not be built through existing buildings.
- Automatic development requires:
  - non-NONE zoning,
  - orthogonally adjacent road access,
  - no building already occupying the cell,
  - positive demand for that zone.
- Demand values are safe integers in 0..100.
- Starter demand is 60 for each R/C/I category. Dynamic demand simulation is deferred to the next phase.
- The automatic-development system creates at most one building per simulated hour.
- Candidate zoning cells are scanned only when zoning version changes, not every simulated hour.
- Runtime zoning/road/building lookup caches are derived only and must never enter durable saves.
- Candidate ordering is deterministic row-major.
- Per hour the system checks at most 16 candidate cells starting from one seeded-random offset.
- Demand succeeds when a seeded 0..99 roll is lower than that zone's demand value.
- Save → restore → continue must be byte/state-equivalent to uninterrupted simulation when the same systems are reattached.
- CityWorld codec increments to version 2 on this stacked branch.
- Ordinary request/response budgets remain unchanged; automatic development uses no large mutation command.
- Population, households, companies, tax revenue, building upgrades, demolition, abandonment and rendering are out of scope.

## Review Focus

1. Duplicate building IDs or coordinates must be rejected on runtime construction and decode.
2. Building coordinates must remain inside map bounds, on LAND, and off road cells.
3. Road construction must reject newly planned nodes on existing buildings before state commit/cache.
4. Rezoning or clearing an occupied building cell must remain valid and must not silently remove the building.
5. A rebuilt runtime cache after restore must not change deterministic development outcomes.
6. Long-run development/save state must grow according to current building count, never total historical attempts/hours.

---

### Task 1: Add normalized building state and compact codec

**Files:**
- Create: `src/simulation/buildings/building-state.ts`
- Create: `src/persistence/codec/building-codec.ts`
- Create: `tests/unit/buildings/building-state.test.ts`
- Create: `tests/unit/persistence/building-codec.test.ts`

**Runtime shape:**

```ts
export type BuildingUse = 'residential' | 'commercial' | 'industrial';

export type Building = Readonly<{
  id: number;
  x: number;
  y: number;
  use: BuildingUse;
  level: 1;
}>;

export type BuildingState = Readonly<{
  version: number;
  nextBuildingId: number;
  buildings: readonly Building[];
}>;
```

**Durable shape:**

```ts
export type EncodedBuildingState = Readonly<{
  codecVersion: 1;
  version: number;
  nextBuildingId: number;
  buildings: readonly (readonly [
    id: number,
    x: number,
    y: number,
    useCode: 1 | 2 | 3,
    level: 1,
  ])[];
}>;
```

- [ ] RED: empty state, valid fixture, ID/coordinate uniqueness, safe integer checks, next ID, level/use checks.
- [ ] RED: codec round-trip and strict tuple-length/version validation.
- [ ] Implement no persistent lookup Map/Set.
- [ ] Add `findBuildingAt()`.
- [ ] Run focused + unit/typecheck.

---

### Task 2: Add bounded development-demand state and codec

**Files:**
- Create: `src/simulation/development/development-demand-state.ts`
- Create: `src/persistence/codec/development-demand-codec.ts`
- Create: `tests/unit/development/development-demand-state.test.ts`
- Create: `tests/unit/persistence/development-demand-codec.test.ts`

**Runtime shape:**

```ts
export type DevelopmentDemandState = Readonly<{
  version: number;
  residential: number;
  commercial: number;
  industrial: number;
}>;
```

- [ ] Values must be safe integers 0..100.
- [ ] Version must be non-negative safe integer.
- [ ] Starter state = 60 / 60 / 60.
- [ ] Provide `getDevelopmentDemandForZone(demand, zone)`; NONE returns 0.
- [ ] Compact codec v1 stores `[version, residential, commercial, industrial]`.
- [ ] Strict tuple length and codec version validation.
- [ ] Run focused + unit suite.

---

### Task 3: Extend CityWorld to buildings + demand and codec v2

**Files:**
- Modify: `src/simulation/world/city-world-state.ts`
- Modify: `src/persistence/codec/city-world-codec.ts`
- Modify: `tests/unit/persistence/city-world-codec.test.ts`
- Update existing fixtures only where required.

**CityWorld v2:**

```ts
export type CityWorldState = Readonly<{
  map: WorldMapState;
  roads: RoadNetworkState;
  zoning: ZoningState;
  buildings: BuildingState;
  developmentDemand: DevelopmentDemandState;
}>;
```

- [ ] `createCityWorldState(map, roads, zoning?, buildings?, developmentDemand?)` remains additive for stacked-call-site compatibility.
- [ ] Starter world gets empty buildings and default demand.
- [ ] Validate every building:
  - in map bounds,
  - LAND,
  - not on a road.
- [ ] Do **not** require current zoning to match an existing building; rezoning persistence is intentional.
- [ ] CityWorld codec version becomes 2 and persists buildings + demand.
- [ ] Unsupported version rejected.
- [ ] Save is JSON-safe and contains no runtime indexes/functions.
- [ ] Run unit + simulation fixtures.

---

### Task 4: Preserve cross-domain invariants in road and zoning commands

**Files:**
- Modify: `src/simulation/roads/build-road-command.ts`
- Modify: `tests/unit/roads/build-road-command.test.ts`
- Modify: `tests/unit/zoning/set-zone-command.test.ts`

- [ ] RED: road construction through an existing building fails before commit/cache.
- [ ] Implement building-coordinate conflict check only for `plan.nodesToAdd`.
- [ ] RED: setting a different zone or NONE on an occupied building cell remains valid and preserves the building entity.
- [ ] Verify zoning command does not mutate buildings.
- [ ] Run focused + unit suite.

---

### Task 5: Add deterministic automatic-development system

**Files:**
- Create: `src/simulation/development/automatic-development-system.ts`
- Create: `tests/unit/development/automatic-development-system.test.ts`

**Constants:**
- `DEVELOPMENT_ATTEMPTS_PER_HOUR = 16`
- at most one spawned building per hour

**Derived runtime caches inside the system closure:**
- zoning candidates keyed by zoning version:
  - deterministic row-major `{x,y,zone}` array
- road access index keyed by road topology version
- building coordinate Set keyed by building version

**Hourly step:**
1. Rebuild only stale derived caches.
2. If no zoned candidates, return world unchanged without consuming RNG.
3. Choose one random starting index using seeded RNG.
4. Inspect up to 16 unique candidates cyclically.
5. Skip occupied or non-road-accessible cells.
6. Read demand for candidate zone.
7. If demand <= 0, continue.
8. Roll `random.nextUint32() % 100`.
9. If roll < demand, append one level-1 building with `nextBuildingId`, increment building version/ID, and return immediately.
10. Otherwise continue attempts; create at most one building per hour.

- [ ] RED: demand 0 never builds.
- [ ] RED: no adjacent road never builds.
- [ ] RED: road-accessible R/C/I cells spawn matching building uses with demand 100.
- [ ] RED: occupied candidates are skipped.
- [ ] RED: at most one building per hour.
- [ ] RED: no-zoning world returns same world and consumes no RNG.
- [ ] RED: same seed/state/horizon produces identical buildings.
- [ ] RED: uninterrupted 48h == save at 24h → restore with fresh system caches → 24h.
- [ ] Run focused + unit/simulation suite.

---

### Task 6: Add building persistence/long-run regressions and final review

**Files:**
- Create: `tests/simulation/automatic-development-soak.test.ts`
- Update PR body after verification.

- [ ] 128×128 starter CityWorld v2 save remains <128 KiB.
- [ ] 512×512 empty CityWorld v2 save remains <1 MiB.
- [ ] Build a deterministic fixture of at least 5,000 current buildings and assert encoded city save <512 KiB.
- [ ] Verify building codec/save contains no candidate/road/building runtime index data.
- [ ] Run at least 2,000 simulated development hours on a bounded fixture and confirm:
  - finite/safe IDs and versions,
  - no duplicate IDs/coordinates,
  - no road overlap,
  - current-state save remains inside budget.
- [ ] Save/restore deterministic continuation regression.
- [ ] Run:
  - `npm run verify`
  - `npm run e2e`
  - `npx wrangler deploy --dry-run`
- [ ] Whole-PR self-review for cross-domain and save/history issues.
- [ ] Any Critical/Important issue gets RED→GREEN correction.
- [ ] Record measured sizes/test counts in PR body and mark Ready only on latest fully green head.

## Acceptance

PR #6 is ready when:
- zoned + road-accessible cells can autonomously develop deterministic R/C/I buildings;
- buildings are normalized sparse entities with stable IDs;
- existing buildings survive rezoning/zone clearing;
- roads cannot overwrite buildings;
- automatic development does not scan the full map every hour;
- runtime candidate/access/occupancy indexes are not serialized;
- save/restore continuation remains deterministic;
- 5,000+ current buildings fit inside the stated save budget;
- unit, simulation, build, E2E, and Cloudflare dry-run gates are green.
