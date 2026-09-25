# Traffic Pressure Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic aggregate road traffic so developed cities create visible traffic pressure without persisting or simulating one authoritative vehicle per citizen.

**Architecture:** Persist only current per-edge traffic volume. Capacity, congestion, and speed are derived from road type + current volume. Traffic is recalculated at most once per simulated day and only when authoritative traffic inputs changed. Commute demand uses at most 64 deterministic representative OD cohorts, weighted to the city's total employed workers, so route-search work is bounded as population grows.

**Tech Stack:** TypeScript 5.9.3, Vitest 5.0.1, CityWorld v4, existing road graph, households/companies, derived population/jobs statistics, SimulationEngine.

**Spec:** `docs/superpowers/specs/2026-09-24-city-core-design.md`

## Global Constraints

- Do not create durable vehicle or trip entities.
- Authoritative traffic is aggregate current state per road edge.
- Persist:
  - traffic state version,
  - source road topology version,
  - positive per-edge volume tuples only.
- Derive rather than persist:
  - edge capacity,
  - congestion percent,
  - speed.
- Initial two-lane traffic constants:
  - capacity = **100 weighted commute trips / day / edge**
  - free-flow speed = **40 km/h**
  - minimum congested display speed = **5 km/h**
- Congestion percent = `floor(volume * 100 / capacity)`, capped at 999%.
- Speed:
  - volume <= capacity => 40 km/h
  - volume > capacity => `max(5, floor(40 * capacity / volume))`
- Recalculation occurs at most once at the end of a 24-hour day.
- If roads/buildings/households/companies did not change since the last completed traffic calculation, daily traffic processing is O(1) and preserves state identity.
- Representative commute routing is capped at **64 cohorts** regardless of population.
- Total cohort weight must equal current `employed` count whenever at least one routable household/company pair exists.
- Cohort origins/destinations are selected deterministically from sorted household/company IDs; no RNG.
- Every building access node uses the lowest-ID orthogonally adjacent road node.
- Route selection uses deterministic shortest path; equal-cost ties use ascending node/edge IDs.
- Unroutable cohorts contribute no edge traffic.
- Current traffic volume is recomputed from scratch; no historical accumulation.
- Road topology changes immediately clear traffic volumes and update the traffic topology version so stale edge IDs are never persisted.
- CityWorld codec increments to version 5.
- Traffic visualization sprites, vehicle animation, road widening, signals, transit, congestion feedback into land value/demand, and route-choice sophistication are deferred.

## Review Focus

1. No per-citizen/per-vehicle save growth.
2. Pathfinding work is bounded by 64 OD cohorts per recalculation.
3. Daily recalculation is skipped entirely when authoritative source versions are unchanged.
4. Traffic edge IDs always resolve against the current road topology.
5. Road construction cannot leave stale traffic records.
6. Save → restore → continue reproduces traffic exactly.
7. Traffic save size grows with current road edges only, not elapsed simulation days.

---

### Task 1: Add compact traffic state + codec

**Files:**
- Create: `src/simulation/traffic/traffic-state.ts`
- Create: `src/persistence/codec/traffic-codec.ts`
- Create: `tests/unit/traffic/traffic-state.test.ts`
- Create: `tests/unit/persistence/traffic-codec.test.ts`

**Runtime:**
```ts
type TrafficEdgeVolume = {
  edgeId: number;
  volume: number;
}

type TrafficState = {
  version: number;
  roadTopologyVersion: number;
  edgeVolumes: readonly TrafficEdgeVolume[];
}
```

**Codec:**
- metadata tuple `[version, roadTopologyVersion]`
- volume tuples `[edgeId, volume]`

- [ ] versions are non-negative safe integers.
- [ ] edge IDs are positive safe integers.
- [ ] volumes are positive safe integers; zero-volume entries are omitted.
- [ ] edge IDs unique and strictly sorted.
- [ ] empty starter traffic targets current road topology.
- [ ] replaceTrafficVolumes() preserves identity if topology/volumes are identical.
- [ ] resetTrafficForRoadTopology() clears volumes and only changes state when topology differs.
- [ ] strict codec version/tuple validation.

---

### Task 2: Add derived traffic metrics

**Files:**
- Create: `src/simulation/traffic/traffic-metrics.ts`
- Create: `tests/unit/traffic/traffic-metrics.test.ts`

- [ ] capacity for two-lane edge = 100.
- [ ] free-flow speed = 40 km/h.
- [ ] empty/zero volume => congestion 0%, speed 40.
- [ ] volume 100 => congestion 100%, speed 40.
- [ ] volume 200 => congestion 200%, speed 20.
- [ ] very high volume speed bottoms at 5 km/h.
- [ ] safe integer overflow guarded.
- [ ] metrics are derived only and never persisted.

---

### Task 3: Add deterministic road routing index

**Files:**
- Create: `src/simulation/traffic/road-routing-index.ts`
- Create: `tests/unit/traffic/road-routing-index.test.ts`

Runtime-only index:
- nodeByCoordinate
- adjacency by node ID, sorted by edge ID / neighbor ID
- edgeById

APIs:
- `findBuildingAccessNode(x, y)`
- `findShortestPathEdgeIds(originNodeId, destinationNodeId)`

- [ ] access uses orthogonal adjacency and lowest road node ID.
- [ ] shortest route uses deterministic BFS.
- [ ] disconnected destinations return undefined.
- [ ] same node returns empty path.
- [ ] no runtime Map/Set is serializable through CityWorld.

---

### Task 4: Extend CityWorld with traffic and codec v5

**Files:**
- Modify: `src/simulation/world/city-world-state.ts`
- Modify: `src/persistence/codec/city-world-codec.ts`
- Modify: `tests/unit/persistence/city-world-codec.test.ts`
- Modify: `src/simulation/roads/build-road-command.ts`
- Modify: `tests/unit/roads/build-road-command.test.ts`

- [ ] add `traffic: TrafficState` as final additive CityWorld argument.
- [ ] starter city traffic targets road topology 0 with no volumes.
- [ ] CityWorld validates traffic roadTopologyVersion === roads.topologyVersion.
- [ ] every traffic edge ID resolves to a current road edge.
- [ ] CityWorld codec version = 5.
- [ ] road construction topology changes clear traffic immediately.
- [ ] road no-op preserves traffic identity.
- [ ] save contains no routing maps/path caches/trips/vehicles.

---

### Task 5: Add bounded deterministic traffic calculation system

**Files:**
- Create: `src/simulation/traffic/traffic-pressure-system.ts`
- Create: `tests/unit/traffic/traffic-pressure-system.test.ts`

Constants:
- `MAX_TRAFFIC_COHORTS = 64`

Recalculation trigger:
- only on the end of a simulated day,
- and only if one of these differs from the last successfully calculated source snapshot:
  - road topology version,
  - building version,
  - household version,
  - company version.

Recalculation:
1. derive current employed workers.
2. if employed = 0, replace traffic with empty current-topology state.
3. build a runtime routing index for current road topology.
4. collect routable household origins and company destinations using building ID references + adjacent road access.
5. choose `min(64, employed, routableHouseholdsCount)` representative cohorts.
6. distribute exactly `employed` integer weight across cohorts using quotient/remainder.
7. choose origins evenly from sorted household IDs.
8. choose destinations deterministically across sorted companies with a stable offset/permutation.
9. route each cohort by deterministic shortest path.
10. add cohort weight to each traversed edge with safe-integer guards.
11. replace current traffic volumes from scratch.

- [ ] no employment => no traffic.
- [ ] one home + one workplace connected through edges loads the path.
- [ ] disconnected route contributes no volume.
- [ ] at most 64 shortest-path searches per recalculation.
- [ ] 1,000+ employed workers still uses <=64 cohorts.
- [ ] aggregate cohort weight equals employed for routable fixture.
- [ ] unchanged next day preserves traffic identity and performs no route rebuild.
- [ ] source-state change triggers recalculation.
- [ ] no RNG consumption.
- [ ] same state/horizon deterministic.
- [ ] save/restore with fresh runtime caches == uninterrupted.

---

### Task 6: Long-run traffic/storage regression + review

**Files:**
- Create: `tests/simulation/traffic-soak.test.ts`
- Update PR body after verification.

- [ ] representative connected road grid with 5,000 buildings remains below 512 KiB current-state target.
- [ ] traffic volumes only reference current edge IDs.
- [ ] at least one edge reaches congestion >100% under heavy employment.
- [ ] 10-year unchanged developed city does not accumulate traffic history.
- [ ] serialized size after 10 additional unchanged years changes only by scalar digit growth (<128 bytes).
- [ ] route recalculation count remains unchanged when traffic inputs are unchanged.
- [ ] long-horizon save/restore traffic equals uninterrupted.
- [ ] encoded save contains no `vehicle`, `tripHistory`, `routeCache`, `nodeByCoordinate`, or path arrays.
- [ ] run:
  - `npm run verify`
  - `npm run e2e`
  - `npx wrangler deploy --dry-run`
- [ ] whole-PR review.
- [ ] any Critical/Important issue gets RED→GREEN correction.
- [ ] mark Ready only on latest fully green head.

## Acceptance

PR #9 is ready when:
- traffic pressure is authoritative per current road edge;
- capacity/volume/speed/congestion can be queried;
- no per-vehicle durable state exists;
- commute route work is bounded at 64 representative cohorts per recalculation;
- unchanged cities do not re-route every day or grow traffic history;
- road topology changes cannot leave stale traffic edge references;
- save/restore remains deterministic;
- unit, simulation, build, E2E and Cloudflare dry-run gates are green.
