# Road Network Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, normalized two-lane road graph that can be previewed, built through simulation commands, saved compactly, restored safely, and used by later zoning/service/traffic systems.

**Architecture:** Roads are authoritative sparse entities, not a dense cell grid. Runtime state stores normalized node and edge arrays with stable monotonic numeric IDs; one road node occupies one map cell and edges connect orthogonally adjacent road nodes. Construction is planned purely from current map + road state, then applied immutably. Durable saves use compact tuple arrays and omit all lookup caches/history.

**Tech Stack:** TypeScript 5.9.3, Vitest 5.0.1, existing `SimulationEngine`, current-state-only save codecs, deterministic map storage from PR #3.

**Spec:** `docs/superpowers/specs/2026-09-24-city-core-design.md`

## Global Constraints

- Simulation Core must remain runnable without DOM, React, ReactDOM, Phaser, or `Math.random()`.
- Durable saves contain authoritative current state only.
- Road entities reference stable node IDs; edges never nest duplicate node objects.
- Initial road type is two-lane only.
- Road changes increment a topology version only when topology actually changes.
- Construction payloads contain at most 256 path cells.
- A road path contains 2–256 unique, orthogonally adjacent map cells.
- Roads may be built only on `TerrainCode.LAND`; bridges are out of scope.
- Reusing an existing road cell costs 0 and never creates a duplicate node.
- Every unordered pair of adjacent road nodes has at most one edge.
- Newly created road cells cost exactly 100 currency units each.
- Building an all-existing path is a valid no-op: simulation revision may advance, but road topology version, next IDs, save topology, and construction cost do not change.
- Runtime lookup maps/sets are temporary only and are never serialized.
- Road save codec v1 stores nodes and edges as compact tuples.
- Existing map-only codec/API remains backward-compatible.
- Traffic volume, routing, zoning, treasury deduction, road deletion, upgrades, bridges, diagonals, and rendering are explicitly out of this PR.

## Review Focus

1. A path containing water or an out-of-bounds cell must fail before any road state changes.
2. Repeated cells, diagonal jumps, gaps, and paths over 256 cells must be rejected deterministically.
3. Extending through an existing intersection must reuse node IDs and must not create duplicate unordered edges.
4. Malformed saved road tuples (duplicate IDs/coordinates, dangling edge references, duplicate edge pairs, invalid next IDs) must be rejected on decode.
5. Save → restore → continue building must preserve monotonic IDs with no collisions and identical topology for the same command sequence.

---

### Task 1: Define normalized road network state and invariants

**Files:**
- Create: `src/simulation/roads/road-network-state.ts`
- Create: `tests/unit/roads/road-network-state.test.ts`

**Interfaces:**
- Produces:
  - `RoadNodeId = number`
  - `RoadEdgeId = number`
  - `RoadType = 'two-lane'`
  - `RoadNode`
  - `RoadEdge`
  - `RoadNetworkState`
  - `createEmptyRoadNetwork()`
  - `createRoadNetworkState(input)`
  - `findRoadNodeAt(state, x, y)`
  - `hasRoadEdge(state, nodeA, nodeB)`

Exact runtime shapes:

```ts
export type RoadNode = Readonly<{
  id: number;
  x: number;
  y: number;
}>;

export type RoadEdge = Readonly<{
  id: number;
  nodeA: number;
  nodeB: number;
  roadType: 'two-lane';
  laneCount: 2;
  lengthCells: 1;
}>;

export type RoadNetworkState = Readonly<{
  topologyVersion: number;
  nextNodeId: number;
  nextEdgeId: number;
  nodes: readonly RoadNode[];
  edges: readonly RoadEdge[];
}>;
```

- [ ] **Step 1: Write failing state/invariant tests**

Cover:
- empty network is `topologyVersion=0`, `nextNodeId=1`, `nextEdgeId=1`.
- valid two-node/one-edge fixture succeeds.
- node IDs must be positive safe integers and unique.
- node coordinates must be safe integers and unique.
- edge IDs must be positive safe integers and unique.
- `nodeA < nodeB` is required for canonical unordered pairs.
- edge endpoints must exist.
- duplicate unordered node pairs are rejected.
- all edges must be `two-lane / laneCount=2 / lengthCells=1`.
- `nextNodeId` and `nextEdgeId` must be strictly greater than every existing ID.
- `findRoadNodeAt` and `hasRoadEdge` return exact results.

- [ ] **Step 2: Run focused test and confirm RED**

Run:

```bash
npx vitest run tests/unit/roads/road-network-state.test.ts
```

Expected: missing-module failure.

- [ ] **Step 3: Implement the state factory and validation**

Use array state only; do not add persistent `Map`/cache fields.

Canonical edge helper:

```ts
function canonicalPair(nodeA: number, nodeB: number): readonly [number, number] {
  if (nodeA === nodeB) throw new RangeError('Road edge endpoints must differ');
  return nodeA < nodeB ? [nodeA, nodeB] : [nodeB, nodeA];
}
```

`createRoadNetworkState()` clones the supplied arrays and validates all invariants before returning them.

- [ ] **Step 4: Run focused + full unit tests**

```bash
npx vitest run tests/unit/roads/road-network-state.test.ts
npm run test
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/simulation/roads/road-network-state.ts tests/unit/roads/road-network-state.test.ts
git commit -m "feat: add normalized road network state"
```

---

### Task 2: Add compact road-network persistence codec

**Files:**
- Create: `src/persistence/codec/road-network-codec.ts`
- Create: `tests/unit/persistence/road-network-codec.test.ts`

**Interfaces:**
- Consumes: `RoadNetworkState`, `createRoadNetworkState()`.
- Produces:
  - `ROAD_NETWORK_CODEC_VERSION = 1`
  - `EncodedRoadNetworkState`
  - `encodeRoadNetworkState(state)`
  - `decodeRoadNetworkState(saved)`

Exact durable shape:

```ts
export type EncodedRoadNetworkState = Readonly<{
  codecVersion: 1;
  topologyVersion: number;
  nextNodeId: number;
  nextEdgeId: number;
  nodes: readonly (readonly [id: number, x: number, y: number])[];
  edges: readonly (readonly [id: number, nodeA: number, nodeB: number])[];
}>;
```

Road type/lane count/length are implied by codec v1 and are restored as the v1 constants.

- [ ] **Step 1: Write failing round-trip and malformed-save tests**

Verify:
- valid fixture round-trips exactly.
- unsupported `codecVersion` throws.
- duplicate node IDs throw.
- duplicate node coordinates throw.
- dangling edge endpoint throws.
- duplicate canonical edge pair throws.
- `nextNodeId <= max node ID` throws.
- `nextEdgeId <= max edge ID` throws.

- [ ] **Step 2: Run focused test and confirm RED**

```bash
npx vitest run tests/unit/persistence/road-network-codec.test.ts
```

Expected: missing-module failure.

- [ ] **Step 3: Implement tuple codec**

Encode by mapping current arrays only. Decode tuples into runtime objects, then call `createRoadNetworkState()` so durable-state validation has one authority.

- [ ] **Step 4: Run focused + unit suite**

```bash
npx vitest run tests/unit/persistence/road-network-codec.test.ts
npm run test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/persistence/codec/road-network-codec.ts tests/unit/persistence/road-network-codec.test.ts
git commit -m "feat: add compact road network codec"
```

---

### Task 3: Compose map and roads into CityWorldState

**Files:**
- Create: `src/simulation/world/city-world-state.ts`
- Create: `src/persistence/codec/city-world-codec.ts`
- Create: `tests/unit/persistence/city-world-codec.test.ts`

**Interfaces:**
- Consumes:
  - `WorldMapState`
  - `RoadNetworkState`
  - `worldMapSaveCodec`
  - road-network codec
- Produces:
  - `CityWorldState`
  - `createStarterCityWorld(seed, dimensions?)`
  - `EncodedCityWorldState`
  - `cityWorldSaveCodec`

Exact runtime shape:

```ts
export type CityWorldState = Readonly<{
  map: WorldMapState;
  roads: RoadNetworkState;
}>;
```

Exact encoded shape:

```ts
export type EncodedCityWorldState = Readonly<{
  map: EncodedWorldMapState;
  roads: EncodedRoadNetworkState;
}>;
```

- [ ] **Step 1: Write failing composition tests**

Verify:
- `createStarterCityWorld('seed')` contains deterministic starter map + empty roads.
- codec round-trip preserves every map terrain byte and road tuple.
- map-only `worldMapSaveCodec` behavior remains unchanged.
- encoded city world contains no `Uint8Array`, `Map`, or command history.

- [ ] **Step 2: Run focused test and confirm RED**

```bash
npx vitest run tests/unit/persistence/city-world-codec.test.ts
```

Expected: missing-module failure.

- [ ] **Step 3: Implement world composition and codec**

`createStarterCityWorld()` delegates to `createStarterWorldMap()` and `createEmptyRoadNetwork()`; no duplicate generation logic.

- [ ] **Step 4: Run focused + full unit tests**

```bash
npx vitest run tests/unit/persistence/city-world-codec.test.ts
npm run test
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/simulation/world src/persistence/codec/city-world-codec.ts tests/unit/persistence/city-world-codec.test.ts
git commit -m "feat: compose city world map and roads"
```

---

### Task 4: Add deterministic road-build planning and validation

**Files:**
- Create: `src/simulation/roads/road-build-plan.ts`
- Create: `tests/unit/roads/road-build-plan.test.ts`

**Interfaces:**
- Consumes:
  - `WorldMapState`
  - `RoadNetworkState`
  - `TerrainCode`
- Produces:
  - `ROAD_TWO_LANE_CELL_COST = 100`
  - `MAX_ROAD_PATH_CELLS = 256`
  - `RoadGridPoint`
  - `RoadBuildValidationCode`
  - `RoadBuildValidationError`
  - `RoadBuildPlan`
  - `planRoadBuild(map, roads, cells)`

Exact point type:

```ts
export type RoadGridPoint = Readonly<{ x: number; y: number }>;
```

Exact validation codes:

```ts
export type RoadBuildValidationCode =
  | 'PATH_TOO_SHORT'
  | 'PATH_TOO_LONG'
  | 'INVALID_COORDINATE'
  | 'OUT_OF_BOUNDS'
  | 'WATER'
  | 'REPEATED_CELL'
  | 'NON_ADJACENT';
```

Exact plan output:

```ts
export type RoadBuildPlan = Readonly<{
  nodesToAdd: readonly RoadNode[];
  edgesToAdd: readonly RoadEdge[];
  constructionCost: number;
}>;
```

- [ ] **Step 1: Write failing validation tests**

Cover:
- two adjacent land cells produce two nodes, one edge, cost 200 on empty network.
- one-cell path throws `PATH_TOO_SHORT`.
- 257-cell path throws `PATH_TOO_LONG`.
- non-integer/NaN coordinate throws `INVALID_COORDINATE`.
- coordinate equal to width/height throws `OUT_OF_BOUNDS`.
- water cell throws `WATER`.
- repeated path cell throws `REPEATED_CELL`.
- diagonal or gap between consecutive cells throws `NON_ADJACENT`.
- validation failure does not mutate road state.

- [ ] **Step 2: Write failing existing-road/intersection tests**

Create an existing L-shaped fixture and verify:
- existing nodes are reused.
- construction cost counts only new road cells.
- planned node IDs start at `nextNodeId`.
- planned edge IDs start at `nextEdgeId`.
- edges are canonical `nodeA < nodeB`.
- newly added cells connect to every orthogonally adjacent existing/new road cell.
- an existing unordered edge is never planned twice.
- an all-existing valid path produces empty additions and cost 0.

- [ ] **Step 3: Run focused test and confirm RED**

```bash
npx vitest run tests/unit/roads/road-build-plan.test.ts
```

Expected: missing-module failure.

- [ ] **Step 4: Implement pure planning**

Build temporary lookup structures inside the function:

```ts
const nodeByCoordinate = new Map<string, RoadNode>();
const edgePairs = new Set<string>();
```

These structures are local variables only and never added to authoritative state.

Process validation first. Only after all path cells pass validation may IDs be allocated into the returned plan.

When a new node is planned, inspect its four orthogonal neighbors against both existing nodes and nodes already planned in this call. Add missing canonical edges exactly once.

- [ ] **Step 5: Run focused + unit suite**

```bash
npx vitest run tests/unit/roads/road-build-plan.test.ts
npm run test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/simulation/roads/road-build-plan.ts tests/unit/roads/road-build-plan.test.ts
git commit -m "feat: add deterministic road construction planning"
```

---

### Task 5: Apply road plans immutably

**Files:**
- Create: `src/simulation/roads/apply-road-build.ts`
- Create: `tests/unit/roads/apply-road-build.test.ts`

**Interfaces:**
- Consumes: `RoadNetworkState`, `RoadBuildPlan`.
- Produces:
  - `applyRoadBuild(state, plan): RoadNetworkState`

- [ ] **Step 1: Write failing immutable-apply tests**

Verify:
- applying a non-empty plan appends nodes/edges in ascending ID order.
- source state remains deep-equal to its pre-apply snapshot.
- `nextNodeId` and `nextEdgeId` advance to one above the highest allocated ID.
- `topologyVersion` increments exactly once for a non-empty plan.
- applying an empty plan returns an equivalent road topology with unchanged topology version and next IDs.
- applying a plan whose IDs no longer match the state's next IDs throws rather than corrupting topology.

- [ ] **Step 2: Run focused test and confirm RED**

```bash
npx vitest run tests/unit/roads/apply-road-build.test.ts
```

Expected: missing-module failure.

- [ ] **Step 3: Implement minimal immutable apply**

For non-empty plans, concatenate arrays and validate through `createRoadNetworkState()`. Do not mutate input arrays.

For an empty plan, return `state` directly.

- [ ] **Step 4: Run focused + full unit suite**

```bash
npx vitest run tests/unit/roads/apply-road-build.test.ts
npm run test
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/simulation/roads/apply-road-build.ts tests/unit/roads/apply-road-build.test.ts
git commit -m "feat: apply road build plans immutably"
```

---

### Task 6: Integrate BUILD_ROAD_PATH with SimulationEngine

**Files:**
- Create: `src/simulation/roads/build-road-command.ts`
- Create: `tests/unit/roads/build-road-command.test.ts`

**Interfaces:**
- Consumes:
  - `CityWorldState`
  - `planRoadBuild()`
  - `applyRoadBuild()`
  - existing `CommandHandler<TWorld>`
- Produces:
  - `BuildRoadPathPayload`
  - `BuildRoadPathDelta`
  - `buildRoadPathHandler: CommandHandler<CityWorldState>`

Exact payload:

```ts
export type BuildRoadPathPayload = Readonly<{
  cells: readonly RoadGridPoint[];
}>;
```

Exact delta:

```ts
export type BuildRoadPathDelta = Readonly<{
  topologyVersion: number;
  addedNodeIds: readonly number[];
  addedEdgeIds: readonly number[];
  constructionCost: number;
}>;
```

- [ ] **Step 1: Write failing command-handler tests**

Verify:
- dispatching two adjacent land cells updates `world.roads`, preserves `world.map`, and returns node/edge IDs + cost.
- simulation revision increments once.
- duplicate `commandId` returns the cached response and does not rebuild roads.
- stale `baseRevision` returns compact revision conflict without road mutation.
- invalid water/non-adjacent payload throws before state commit/cache.
- all-existing path returns cost 0, no new IDs, unchanged road topology version, while simulation revision advances.
- a 256-cell valid path response remains under `ORDINARY_RESPONSE_TARGET_BYTES`.

- [ ] **Step 2: Run focused test and confirm RED**

```bash
npx vitest run tests/unit/roads/build-road-command.test.ts
```

Expected: missing-module failure.

- [ ] **Step 3: Implement handler**

Handler logic:

```ts
const plan = planRoadBuild(world.map, world.roads, payload.cells);
const roads = applyRoadBuild(world.roads, plan);

return {
  world: { ...world, roads },
  delta: {
    topologyVersion: roads.topologyVersion,
    addedNodeIds: plan.nodesToAdd.map((node) => node.id),
    addedEdgeIds: plan.edgesToAdd.map((edge) => edge.id),
    constructionCost: plan.constructionCost,
  },
};
```

No treasury deduction or UI events in this PR.

- [ ] **Step 4: Run focused + unit suite**

```bash
npx vitest run tests/unit/roads/build-road-command.test.ts
npm run test
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/simulation/roads/build-road-command.ts tests/unit/roads/build-road-command.test.ts
git commit -m "feat: add build road simulation command"
```

---

### Task 7: Add road save-size, restore-continuation, and history regressions

**Files:**
- Create: `tests/simulation/road-network-soak.test.ts`

**Interfaces:**
- Consumes:
  - `SimulationEngine<CityWorldState>`
  - `buildRoadPathHandler`
  - `cityWorldSaveCodec`
  - kernel codec save/restore
  - `measureJsonBytes()`
- Produces: no new production API.

- [ ] **Step 1: Add save/restore continuation test**

Build several connected road paths, save, restore, create a new engine from restored state, then build one more path.

Verify:
- restored topology is byte/tuple-equivalent to pre-save topology.
- next node and edge IDs continue monotonically.
- no ID collision occurs.
- same command sequence from same seed produces the same encoded city-world save when `savedAtIso` is fixed.

- [ ] **Step 2: Add 10,000 no-op command history regression**

Create one valid two-cell road, then dispatch the same already-existing path 10,000 times using unique command IDs and current revisions.

Measure before/after saves with the same `savedAtIso`.

Assert:
- recent command cache stays at 256.
- road topology version and road tuple counts do not change after the first build.
- serialized save contains no command IDs.
- absolute save-size growth is <128 bytes; only revision digit width may grow.

- [ ] **Step 3: Add large-network save budget fixture**

Generate a deterministic snake-like set of roads on a 128×128 land-safe area using multiple legal <=256-cell commands.

Target at least 8,000 road nodes.

Assert:
- encoded city save is <1 MiB.
- every edge references an existing node.
- no duplicate coordinate or canonical edge pair exists.

Print metrics:

```ts
console.info(
  `road-storage-metric nodes=${roads.nodes.length} edges=${roads.edges.length} saveBytes=${bytes}`,
);
```

- [ ] **Step 4: Run simulation suite**

```bash
npm run test:simulation
```

Expected: PASS including existing kernel/map soak suites.

- [ ] **Step 5: Run complete repository gate**

```bash
npm run verify
npm run e2e
npx wrangler deploy --dry-run
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/simulation/road-network-soak.test.ts
git commit -m "test: guard road persistence and long-run history"
```

---

### Task 8: Whole-PR review and Ready gate

**Files:**
- Update PR body only unless review finds a Critical/Important defect.

- [ ] **Step 1: Review branch diff against `feat/map-storage-foundation`**

Review specifically for:
- graph state storing duplicated nested nodes,
- persistent lookup caches/Maps leaking into save state,
- unstable/non-monotonic IDs,
- duplicate unordered edges,
- water/out-of-bounds partial mutation,
- no-op builds incorrectly incrementing topology version,
- save/load altering topology,
- response/save size regressions.

- [ ] **Step 2: Fix every Critical/Important finding using RED→GREEN**

For each finding:
1. add a focused failing regression test,
2. confirm RED for the expected reason,
3. implement the minimum fix,
4. run focused GREEN,
5. rerun `npm run verify`.

- [ ] **Step 3: Update PR #4 body with measured results**

Record:
- latest head SHA,
- unit/simulation counts,
- 8,000+ node network encoded save bytes,
- 10,000 no-op command before/after save delta,
- E2E result,
- Wrangler dry-run result.

- [ ] **Step 4: Mark PR #4 Ready only after the latest head is fully green**

Keep PR #4 stacked on PR #3. Do not merge shared branches automatically.

## Acceptance

PR #4 is ready when:
- roads are a normalized node/edge graph with stable numeric IDs,
- initial roads are strictly two-lane,
- legal road paths can be previewed and built deterministically,
- invalid paths fail before mutation,
- existing intersections reuse nodes/edges,
- no-op builds do not change road topology,
- save/restore preserves topology and future ID allocation,
- 10,000 historical no-op commands do not bloat durable road state,
- an 8,000+ node fixture remains below 1 MiB encoded city-save size,
- command responses remain below the existing 128 KiB ordinary response budget,
- unit, simulation, build, E2E, and Cloudflare dry-run gates are green.
