# Public Services Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add placeable parks, schools, fire stations, police stations, and hospitals that spend treasury, create daily operating costs, and expose deterministic road-network service coverage for later land-value/building-response systems.

**Architecture:** Public services are sparse normalized entities with stable numeric IDs. Only current service entities are persisted. Coverage is a runtime-only multi-source road-distance index rebuilt only when service version or road topology version changes. CityWorld gains compact public-service state; economy derives service operating cost from current service entities rather than storing finance history.

**Tech Stack:** TypeScript 5.9.3, Vitest 5.0.1, CityWorld v5, existing road graph/routing primitives, Economy Core, SimulationEngine.

**Spec:** `docs/superpowers/specs/2026-09-24-city-core-design.md`

## Global Constraints

- Initial public-service kinds:
  - `park`
  - `school`
  - `fire`
  - `police`
  - `hospital`
- Initial footprints are exactly one cell.
- Service entities use stable positive numeric IDs and unique coordinates.
- Services may be placed only:
  - in map bounds,
  - on LAND,
  - on `ZoneCode.NONE`,
  - off road cells,
  - off normal building cells,
  - off existing public-service cells,
  - with at least one orthogonally adjacent road node.
- Service placement cost is charged atomically before state commit.
- Initial placement costs:
  - park: **5,000**
  - school: **20,000**
  - fire: **30,000**
  - police: **30,000**
  - hospital: **50,000**
- Initial daily operating costs:
  - park: **25**
  - school: **100**
  - fire: **150**
  - police: **150**
  - hospital: **250**
- Initial road-network coverage distances:
  - park: **8 road cells**
  - school: **16**
  - fire: **24**
  - police: **24**
  - hospital: **32**
- Coverage uses the service cell's lowest-ID orthogonally adjacent road node.
- Coverage for a road node is shortest-path road-edge distance from the nearest service of that kind.
- Coverage index is runtime-only and must never be serialized.
- Multi-source BFS is used per service kind; do not perform service×building pathfinding.
- Coverage rebuild occurs only when:
  - road topology version changes, or
  - public-service state version changes.
- No incident simulation, student enrollment, hospital patients, police calls, fire spread, park visitors, service vehicles, or visual sprites in this PR.
- No finance ledger/history arrays.
- CityWorld codec increments to version 6.
- Existing save/request/response budgets remain in force.

## Review Focus

1. Placement validation must finish before treasury or service state mutation.
2. Duplicate command replay must never double-charge.
3. Insufficient funds must not place a service or cache the failed command.
4. Roads/zoning/buildings/services must never overlap authoritatively.
5. Coverage indexes must be derived/runtime-only.
6. Coverage rebuild work must scale with road graph size, not simulated hours.
7. Long unchanged simulation must not grow service or coverage history in saves.

---

### Task 1: Add normalized public-service state + compact codec

**Files:**
- Create: `src/simulation/services/public-service-state.ts`
- Create: `src/persistence/codec/public-service-codec.ts`
- Create: `tests/unit/services/public-service-state.test.ts`
- Create: `tests/unit/persistence/public-service-codec.test.ts`

**Runtime:**
```ts
type PublicServiceKind = 'park' | 'school' | 'fire' | 'police' | 'hospital';

type PublicService = {
  id: number;
  x: number;
  y: number;
  kind: PublicServiceKind;
};

type PublicServiceState = {
  version: number;
  nextServiceId: number;
  services: readonly PublicService[];
};
```

**Codec:** tuple `[id, x, y, kindCode]`; metadata `[version, nextServiceId]`.

- [ ] empty state = version 0 / next ID 1 / [].
- [ ] positive safe IDs, safe integer coordinates.
- [ ] unique service IDs and coordinates.
- [ ] exact kind validation.
- [ ] nextServiceId > max current ID.
- [ ] strict tuple length / codec version validation.
- [ ] no persistent Map/Set.

---

### Task 2: Add service catalog constants and economy integration

**Files:**
- Create: `src/simulation/services/public-service-catalog.ts`
- Modify: `src/simulation/economy/daily-economy-flow.ts`
- Modify: `tests/unit/economy/daily-economy-flow.test.ts`
- Create: `tests/unit/services/public-service-catalog.test.ts`

**Catalog APIs:**
- `getPublicServicePlacementCost(kind)`
- `getPublicServiceDailyOperatingCost(kind)`
- `getPublicServiceCoverageDistance(kind)`

- [ ] constants exactly match Global Constraints.
- [ ] all values positive safe integers.
- [ ] daily economy operating cost = road maintenance + current service operating costs.
- [ ] empty service state preserves previous economy flow behavior.
- [ ] service operating costs are derived only and not persisted.

---

### Task 3: Extend CityWorld with services and codec v6

**Files:**
- Modify: `src/simulation/world/city-world-state.ts`
- Modify: `src/persistence/codec/city-world-codec.ts`
- Modify: `tests/unit/persistence/city-world-codec.test.ts`

- [ ] add `publicServices` as final additive CityWorld argument.
- [ ] starter city gets empty public-service state.
- [ ] validate every service:
  - in bounds,
  - LAND,
  - NONE zoning,
  - no road overlap,
  - no building overlap,
  - no duplicate service coordinate.
- [ ] require at least one orthogonally adjacent road node.
- [ ] CityWorld codec version = 6.
- [ ] save persists only compact public-service tuples.
- [ ] decode re-runs all cross-domain validation.
- [ ] JSON save contains no coverage index/distances/route caches.

---

### Task 4: Add PLACE_PUBLIC_SERVICE command and conflict protection

**Files:**
- Create: `src/simulation/services/place-public-service-command.ts`
- Create: `tests/unit/services/place-public-service-command.test.ts`
- Modify: `src/simulation/roads/build-road-command.ts`
- Modify: `tests/unit/roads/build-road-command.test.ts`
- Modify: `src/simulation/zoning/set-zone-command.ts`
- Modify: `tests/unit/zoning/set-zone-command.test.ts`

**Payload:**
```ts
type PlacePublicServicePayload = {
  kind: PublicServiceKind;
  x: number;
  y: number;
};
```

**Delta:**
```ts
type PlacePublicServiceDelta = {
  serviceId: number;
  kind: PublicServiceKind;
  placementCost: number;
};
```

- [ ] valid placement appends one service, increments service version/next ID, charges treasury.
- [ ] invalid coordinates/water/zone/road/building/service/no-road-access fail before mutation.
- [ ] insufficient treasury fails before service/treasury mutation.
- [ ] duplicate command ID returns cached response and does not double-charge.
- [ ] stale revision does not charge.
- [ ] response remains below ordinary response budget.
- [ ] road construction through a service cell is rejected before spend.
- [ ] setting non-NONE zoning on a service cell is rejected.
- [ ] clearing NONE on a service cell remains a no-op and preserves service.

---

### Task 5: Add runtime multi-source road service coverage index

**Files:**
- Create: `src/simulation/services/service-coverage-index.ts`
- Create: `tests/unit/services/service-coverage-index.test.ts`

**Runtime-only index:**
- keyed to road topology version + public-service version.
- node access map from road coordinate.
- adjacency list from road edges.
- one shortest-distance map per service kind.

**APIs:**
- `createServiceCoverageIndex(roads, publicServices)`
- `getServiceDistanceAtRoadNode(kind, nodeId)`
- `isRoadNodeCovered(kind, nodeId)`
- `findBuildingAccessNode(x, y)`
- `isBuildingCovered(kind, x, y)`

- [ ] multi-source BFS produces nearest distance.
- [ ] equal service distances remain deterministic.
- [ ] unreachable components are uncovered.
- [ ] exact coverage boundary included; boundary+1 excluded.
- [ ] building coverage uses lowest-ID orthogonally adjacent road node.
- [ ] no service of kind => uncovered without pathfinding.
- [ ] runtime Maps/Sets/functions absent from encoded CityWorld.

---

### Task 6: Add service-coverage summary + long-run regression and final review

**Files:**
- Create: `src/simulation/services/service-coverage-summary.ts`
- Create: `tests/unit/services/service-coverage-summary.test.ts`
- Create: `tests/simulation/public-services-soak.test.ts`
- Update PR body.

**Derived summary:**
```ts
type ServiceCoverageSummary = {
  totalBuildings: number;
  coveredByKind: {
    park: number;
    school: number;
    fire: number;
    police: number;
    hospital: number;
  };
};
```

- [ ] summary scans current buildings against one runtime coverage index.
- [ ] summary is derived only and never serialized.
- [ ] representative developed 5,000-building city + services remains <512 KiB.
- [ ] at least one fixture has mixed covered/uncovered buildings.
- [ ] 20 unchanged simulated years create no service/coverage history growth (<128-byte scalar-only delta).
- [ ] daily service operating costs settle through Economy Core.
- [ ] save/restore coverage rebuilt from current roads/services yields identical summary.
- [ ] encoded save contains no `coverageIndex`, `distanceByNode`, `serviceHistory`, or routing cache.
- [ ] run:
  - `npm run verify`
  - `npm run e2e`
  - `npx wrangler deploy --dry-run`
- [ ] whole-PR review and RED→GREEN fix for any Critical/Important finding.
- [ ] mark Ready only on latest fully green head.

## Acceptance

PR #10 is ready when:
- park/school/fire/police/hospital can be placed as compact current entities;
- placement costs treasury atomically and operating costs affect daily economy;
- services cannot overlap invalid world content;
- service coverage follows road travel distance rather than Euclidean circles;
- coverage computation is runtime-only and rebuilt only from current versions;
- long unchanged simulation does not grow service history;
- save/restore reproduces coverage from current state;
- unit, simulation, build, E2E and Cloudflare dry-run gates are green.
