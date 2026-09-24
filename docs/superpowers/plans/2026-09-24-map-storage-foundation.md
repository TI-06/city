# Map Storage Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, compact, copy-on-write map storage layer that can back terrain now and zoning/land-value/service grids later without making normal saves grow with historical edits.

**Architecture:** Runtime map grids use fixed-size 32×32 `Uint8Array` chunks for dense access and bounded copy-on-write updates. Durable saves use an explicit world codec that converts runtime chunks to JSON-safe Base64 strings, keeping typed-array implementation details out of the normal save envelope while preserving the existing identity save path for simple worlds.

**Tech Stack:** TypeScript 5.9.3, Vitest 5.0.1, existing deterministic `SeededRandom`, current-state-only kernel save architecture.

**Spec:** `docs/superpowers/specs/2026-09-24-city-core-design.md`

## Global Constraints

- Simulation code remains independent of React, ReactDOM, Phaser, DOM rendering, and `Math.random()`.
- Map data is dense numeric data; never store one object per cell.
- Runtime grid chunk size is exactly 32×32 cells.
- v0.1 map dimensions are limited to 1–512 cells on each axis.
- Out-of-bounds grid reads/writes must throw instead of wrapping or silently clipping.
- Runtime updates are immutable from the caller's perspective: `withCell()` never mutates the source grid.
- A single-cell update clones only the chunk containing that cell plus the top-level chunk-reference array.
- Save encoding uses Base64 per byte chunk and stores no historical grid versions.
- Base64 encode/decode lives in persistence/platform code, not simulation code.
- Existing identity `createKernelSave()` / `restoreKernelState()` behavior remains backward-compatible.
- The first map generator version is explicit and stored with the map.
- Same map seed + same dimensions + same generator version must produce byte-identical terrain.
- Different representative seeds must produce different river paths.
- Starter map default is 128×128.
- Terrain v1 contains only `LAND = 1` and `WATER = 0`.
- Starter and max-size map snapshots must remain comfortably inside the existing 2 MiB starter save budget.
- 10,000 current-state grid edits must not cause serialized snapshot size to grow with edit history.

## Review Focus

1. Width/height values of 0, negative, non-integer, NaN, Infinity, or >512 must be rejected before allocation.
2. Edge cells `(0,0)` and `(width-1,height-1)` must round-trip correctly; `x === width` or `y === height` must throw.
3. Base64 decode must reject malformed or wrong-length chunk payloads instead of producing truncated grids.
4. Copy-on-write updates must leave the source grid byte-identical and must not retain historical edit metadata.
5. Save decode must reject unsupported codec/generator versions rather than silently reinterpret bytes.

---

### Task 1: Add a world save codec without breaking existing kernel saves

**Files:**
- Modify: `src/simulation/core/kernel-save.ts`
- Modify: `tests/unit/simulation/kernel-save.test.ts`

**Interfaces:**
- Consumes: `SimulationEngine<TWorld>`, `SimulationState<TWorld>`, current `SaveEnvelope`.
- Produces:
  - `WorldSaveCodec<TWorld, TSavedWorld>`
  - `EncodedSimulationState<TSavedWorld>`
  - `EncodedKernelSave<TSavedWorld>`
  - `createKernelSaveWithCodec(engine, savedAtIso, codec)`
  - `restoreKernelStateWithCodec(save, codec)`

- [ ] **Step 1: Write failing codec round-trip tests**

Add a runtime-only world shape containing a `Uint8Array` and a test codec:

```ts
type RuntimeWorld = Readonly<{ name: string; bytes: Uint8Array }>;
type SavedWorld = Readonly<{ name: string; bytes: readonly number[] }>;

const codec: WorldSaveCodec<RuntimeWorld, SavedWorld> = {
  encode: (world) => ({ name: world.name, bytes: Array.from(world.bytes) }),
  decode: (saved) => ({ name: saved.name, bytes: Uint8Array.from(saved.bytes) }),
};
```

Verify:
- `createKernelSaveWithCodec()` stores the encoded world, not the runtime `Uint8Array`.
- `restoreKernelStateWithCodec()` restores the original runtime world.
- revision/clock/random state remain unchanged.
- existing `createKernelSave()` tests still pass.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
npx vitest run tests/unit/simulation/kernel-save.test.ts
```

Expected: FAIL because the codec interfaces/functions do not exist.

- [ ] **Step 3: Implement additive codec support**

Use these exact shapes:

```ts
export type WorldSaveCodec<TWorld, TSavedWorld> = Readonly<{
  encode: (world: TWorld) => TSavedWorld;
  decode: (savedWorld: TSavedWorld) => TWorld;
}>;

export type EncodedSimulationState<TSavedWorld> = Readonly<{
  revision: number;
  clock: SimulationClockState;
  randomState: RandomState;
  world: TSavedWorld;
}>;

export type EncodedKernelSave<TSavedWorld> = SaveEnvelope<EncodedSimulationState<TSavedWorld>>;
```

`createKernelSaveWithCodec()` copies only current authoritative state:

```ts
export function createKernelSaveWithCodec<TWorld, TSavedWorld>(
  engine: SimulationEngine<TWorld>,
  savedAtIso: string,
  codec: WorldSaveCodec<TWorld, TSavedWorld>,
): EncodedKernelSave<TSavedWorld> {
  const state = engine.state;
  return {
    saveVersion: KERNEL_SAVE_VERSION,
    revision: state.revision,
    savedAtIso,
    state: {
      revision: state.revision,
      clock: state.clock,
      randomState: state.randomState,
      world: codec.encode(state.world),
    },
  };
}
```

`restoreKernelStateWithCodec()` validates save version and envelope/state revision exactly as the current restore path does before decoding the world.

- [ ] **Step 4: Run focused and full unit suites**

Run:

```bash
npx vitest run tests/unit/simulation/kernel-save.test.ts
npm run test
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/simulation/core/kernel-save.ts tests/unit/simulation/kernel-save.test.ts
git commit -m "feat: add world save codec support"
```

---

### Task 2: Add validated grid dimensions and coordinates

**Files:**
- Create: `src/simulation/map/grid-dimensions.ts`
- Create: `tests/unit/map/grid-dimensions.test.ts`

**Interfaces:**
- Produces:
  - `MAX_MAP_AXIS_CELLS = 512`
  - `GridDimensions`
  - `createGridDimensions(width, height)`
  - `assertGridCoordinate(dimensions, x, y)`
  - `gridCellCount(dimensions)`

- [ ] **Step 1: Write failing validation tests**

Cover:
- `createGridDimensions(128, 128)` succeeds.
- width/height `0`, `-1`, `1.5`, `NaN`, `Infinity`, and `513` throw.
- `gridCellCount({128,128}) === 16384`.
- coordinates `(0,0)` and `(127,127)` succeed.
- `(-1,0)`, `(128,0)`, `(0,128)` throw.

- [ ] **Step 2: Run focused test and confirm RED**

```bash
npx vitest run tests/unit/map/grid-dimensions.test.ts
```

Expected: module-not-found / missing symbol failure.

- [ ] **Step 3: Implement exact integer/bounds validation**

```ts
export const MAX_MAP_AXIS_CELLS = 512;

export type GridDimensions = Readonly<{
  width: number;
  height: number;
}>;

function assertAxis(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_MAP_AXIS_CELLS) {
    throw new RangeError(
      `${label} must be an integer between 1 and ${MAX_MAP_AXIS_CELLS}`,
    );
  }
}
```

`assertGridCoordinate()` validates safe integers and the half-open bounds `0 <= x < width`, `0 <= y < height`.

- [ ] **Step 4: Run focused test, lint, and typecheck**

```bash
npx vitest run tests/unit/map/grid-dimensions.test.ts
npm run lint
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/simulation/map/grid-dimensions.ts tests/unit/map/grid-dimensions.test.ts
git commit -m "feat: add validated map dimensions"
```

---

### Task 3: Implement 32×32 copy-on-write byte grids

**Files:**
- Create: `src/simulation/map/chunked-byte-grid.ts`
- Create: `tests/unit/map/chunked-byte-grid.test.ts`

**Interfaces:**
- Consumes: `GridDimensions`, `assertGridCoordinate()`.
- Produces:
  - `BYTE_GRID_CHUNK_SIZE = 32`
  - `ChunkedByteGrid`
  - `ChunkedByteGrid.filled(dimensions, value)`
  - `ChunkedByteGrid.generate(dimensions, initializer)`
  - `ChunkedByteGrid.fromChunks(dimensions, chunkSize, chunks)`
  - `get(x, y)`
  - `withCell(x, y, value)`
  - `copyChunks()`
  - `chunkCount`

- [ ] **Step 1: Write failing behavior tests**

Verify:
- a 33×33 grid produces 4 chunks.
- `filled(..., 7)` returns 7 at all four corners and the cross-chunk boundary cells `(31,31)`, `(32,31)`, `(31,32)`, `(32,32)`.
- `generate()` receives exact x/y coordinates and produces deterministic values.
- `withCell()` changes only the returned grid; the source value remains unchanged.
- byte values outside `0..255`, non-integers, and invalid coordinates throw.
- `fromChunks()` rejects a chunk count mismatch or a chunk with the wrong byte length.

- [ ] **Step 2: Run focused test and confirm RED**

```bash
npx vitest run tests/unit/map/chunked-byte-grid.test.ts
```

Expected: missing module failure.

- [ ] **Step 3: Implement chunk geometry**

Use a fixed chunk side of 32. Chunk coordinates are:

```ts
const chunkX = Math.floor(x / BYTE_GRID_CHUNK_SIZE);
const chunkY = Math.floor(y / BYTE_GRID_CHUNK_SIZE);
const chunksAcross = Math.ceil(dimensions.width / BYTE_GRID_CHUNK_SIZE);
const chunkIndex = chunkY * chunksAcross + chunkX;
const localX = x % BYTE_GRID_CHUNK_SIZE;
const localY = y % BYTE_GRID_CHUNK_SIZE;
const localIndex = localY * BYTE_GRID_CHUNK_SIZE + localX;
```

Every chunk is allocated as exactly `32 * 32 = 1024` bytes, including edge chunks. Cells outside the declared dimensions in edge chunks are padding and never addressable.

`withCell()` must:
1. validate coordinate/value,
2. copy the top-level chunks array,
3. clone only `chunks[chunkIndex]`,
4. write one byte to the cloned chunk,
5. return a new `ChunkedByteGrid`.

`copyChunks()` returns cloned `Uint8Array` instances so persistence code cannot mutate authoritative runtime state through shared references.

- [ ] **Step 4: Run focused tests and full unit suite**

```bash
npx vitest run tests/unit/map/chunked-byte-grid.test.ts
npm run test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/simulation/map/chunked-byte-grid.ts tests/unit/map/chunked-byte-grid.test.ts
git commit -m "feat: add chunked byte grid"
```

---

### Task 4: Add browser/headless-safe Base64 byte codec and grid snapshot codec

**Files:**
- Create: `src/persistence/codec/base64-bytes.ts`
- Create: `src/persistence/codec/chunked-byte-grid-codec.ts`
- Create: `tests/unit/persistence/base64-bytes.test.ts`
- Create: `tests/unit/persistence/chunked-byte-grid-codec.test.ts`

**Interfaces:**
- Consumes: `ChunkedByteGrid`, `GridDimensions`.
- Produces:
  - `encodeBytesBase64(bytes)`
  - `decodeBytesBase64(encoded)`
  - `BYTE_GRID_CODEC_VERSION = 1`
  - `EncodedChunkedByteGrid`
  - `encodeChunkedByteGrid(grid)`
  - `decodeChunkedByteGrid(snapshot)`

- [ ] **Step 1: Write failing Base64 tests**

Use byte vectors:
- empty array,
- `[0]`,
- `[0, 1, 2, 127, 128, 254, 255]`,
- all 256 possible byte values.

For every vector:

```ts
expect(decodeBytesBase64(encodeBytesBase64(bytes))).toEqual(bytes);
```

Malformed Base64 such as `'***not-base64***'` must throw.

- [ ] **Step 2: Write failing grid-codec tests**

Exact durable shape:

```ts
export type EncodedChunkedByteGrid = Readonly<{
  codecVersion: 1;
  width: number;
  height: number;
  chunkSize: 32;
  chunks: readonly string[];
}>;
```

Verify:
- a generated 65×34 grid round-trips byte-for-byte,
- unsupported `codecVersion` throws,
- `chunkSize !== 32` throws,
- missing/extra chunk strings throw,
- decoded chunk byte length must equal 1024 exactly.

- [ ] **Step 3: Implement Base64 without Node-only Buffer**

Use the platform `btoa` / `atob` APIs available in browsers, Workers, and the Node 24 CI runtime. Convert bytes to/from binary strings in bounded loops; each map chunk is only 1024 bytes, so no unbounded spread call is needed.

```ts
export function encodeBytesBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return btoa(binary);
}
```

Decode by validating the input syntax, calling `atob`, then copying each character code into a new `Uint8Array`.

- [ ] **Step 4: Implement grid codec with strict version/length checks**

`encodeChunkedByteGrid()` calls `grid.copyChunks()` and Base64-encodes each 1024-byte chunk. `decodeChunkedByteGrid()` reconstructs via `ChunkedByteGrid.fromChunks()`.

- [ ] **Step 5: Run persistence-focused tests**

```bash
npx vitest run tests/unit/persistence/base64-bytes.test.ts
npx vitest run tests/unit/persistence/chunked-byte-grid-codec.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/persistence/codec tests/unit/persistence
git commit -m "feat: add compact byte grid persistence codec"
```

---

### Task 5: Add deterministic starter terrain and map codec

**Files:**
- Create: `src/simulation/map/world-map-state.ts`
- Create: `src/simulation/map/starter-map-generator.ts`
- Create: `src/persistence/codec/world-map-codec.ts`
- Create: `tests/unit/map/starter-map-generator.test.ts`
- Create: `tests/unit/persistence/world-map-codec.test.ts`

**Interfaces:**
- Consumes: `SeededRandom`, `ChunkedByteGrid`, grid codec.
- Produces:
  - `TerrainCode.WATER = 0`
  - `TerrainCode.LAND = 1`
  - `WORLD_MAP_GENERATOR_VERSION = 1`
  - `DEFAULT_STARTER_MAP_SIZE = 128`
  - `WorldMapState`
  - `createStarterWorldMap(seed, dimensions?)`
  - `EncodedWorldMapState`
  - `worldMapSaveCodec`

Exact runtime shape:

```ts
export type WorldMapState = Readonly<{
  generatorVersion: 1;
  mapSeed: string;
  dimensions: GridDimensions;
  terrain: ChunkedByteGrid;
}>;
```

- [ ] **Step 1: Write failing deterministic generator tests**

Verify:
- default dimensions are 128×128,
- same seed yields identical terrain chunks,
- representative seeds `'city-a'` and `'city-b'` produce different terrain,
- only WATER/LAND codes exist,
- all four map corners remain LAND,
- every row contains at least one LAND cell,
- the generated map contains some WATER and some LAND.

- [ ] **Step 2: Implement generator v1**

Generate a narrow deterministic river, not noise:

1. initialize `riverX` from the center 40% of the map using `SeededRandom.fromSeed(`map-v1:${seed}`)`,
2. every 6 rows choose drift `-1`, `0`, or `1`,
3. clamp the river center to `2 .. width - 3`,
4. river width is 2 cells,
5. force the outermost 2-cell border to LAND so later road/tutorial placement always has buildable edges.

Precompute one river-center x value per row, then call `ChunkedByteGrid.generate()` once; do not call `withCell()` thousands of times during generation.

- [ ] **Step 3: Write and implement map save codec tests**

Exact durable shape:

```ts
export type EncodedWorldMapState = Readonly<{
  generatorVersion: 1;
  mapSeed: string;
  terrain: EncodedChunkedByteGrid;
}>;
```

Dimensions come from the encoded terrain snapshot and are revalidated on decode.

`worldMapSaveCodec` implements:

```ts
WorldSaveCodec<WorldMapState, EncodedWorldMapState>
```

Round-trip must preserve generator version, seed, dimensions, and all terrain bytes.

- [ ] **Step 4: Run map/persistence unit suites**

```bash
npx vitest run tests/unit/map/starter-map-generator.test.ts
npx vitest run tests/unit/persistence/world-map-codec.test.ts
npm run test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/simulation/map src/persistence/codec/world-map-codec.ts tests/unit/map tests/unit/persistence/world-map-codec.test.ts
git commit -m "feat: add deterministic starter world map"
```

---

### Task 6: Add save-size and edit-history regression fixtures

**Files:**
- Create: `tests/simulation/map-storage-soak.test.ts`

**Interfaces:**
- Consumes: world map generator, world codec, `createKernelSaveWithCodec()`, `measureJsonBytes()`, starter save budget.
- Produces: no new production API.

- [ ] **Step 1: Add starter-map save budget test**

Create a `SimulationEngine<WorldMapState>` with a 128×128 starter map and encode it through `worldMapSaveCodec`.

Assertions:

```ts
expect(measureJsonBytes(save)).toBeLessThan(64 * 1024);
expect(() => assertSaveWithinBudget(save, SAVE_BUDGET_STARTER_BYTES)).not.toThrow();
```

- [ ] **Step 2: Add max-map serialization budget test**

Create a deterministic 512×512 terrain map and encode it.

Assert serialized map save is below `512 * 1024` bytes. This is intentionally stricter than the overall 2 MiB starter-city budget and leaves room for roads, zoning, buildings, and economy.

- [ ] **Step 3: Add 10,000-edit history-growth test**

Start from one 128×128 terrain grid. Apply 10,000 `withCell()` updates, always retaining only the newest grid in the current `WorldMapState`.

Encode the initial and final map saves using the same `savedAtIso`.

Assert:

```ts
expect(Math.abs(afterBytes - beforeBytes)).toBeLessThan(128);
```

The exact terrain bytes may change, but serialized size must depend on the current 128×128 grid, not on edit count.

- [ ] **Step 4: Add 1,000 deterministic regeneration check**

Generate the same seed/dimensions 1,000 times and compare a compact checksum derived from all terrain bytes. Every checksum must match the first. This catches hidden wall-clock/global-random dependencies.

- [ ] **Step 5: Run simulation suite**

```bash
npm run test:simulation
```

Expected: PASS with existing kernel soak plus the map-storage soak.

- [ ] **Step 6: Commit**

```bash
git add tests/simulation/map-storage-soak.test.ts
git commit -m "test: guard map storage size and determinism"
```

---

### Task 7: Complete stacked PR #3 gate

**Files:**
- Update PR body only; no production file changes unless a review finding requires a RED→GREEN fix.

- [ ] **Step 1: Run repository verification**

```bash
npm run verify
npm run e2e
npx wrangler deploy --dry-run
```

Expected: all PASS.

- [ ] **Step 2: Inspect the branch diff against `feat/simulation-kernel`**

Review specifically for:
- accidental object-per-cell storage,
- `Buffer` or Node-only APIs in browser code,
- typed-array references leaking into durable encoded saves,
- out-of-bounds indexing,
- mutation of source grids,
- hidden historical arrays/caches,
- unsupported codec versions being accepted,
- save snapshots exceeding stated budgets.

- [ ] **Step 3: Fix every Critical/Important finding with TDD**

For each finding:
1. add a focused failing regression test,
2. confirm RED,
3. implement the minimum correction,
4. confirm focused GREEN,
5. rerun `npm run verify`.

- [ ] **Step 4: Update PR #3 body with measured results**

Record:
- latest head SHA,
- unit/simulation test counts,
- starter 128×128 encoded save bytes,
- 512×512 encoded save bytes,
- 10,000-edit before/after byte delta,
- E2E result,
- Wrangler dry-run result.

- [ ] **Step 5: Mark PR #3 Ready only when all gates are green**

Keep it stacked on `feat/simulation-kernel`. Do not merge it before PR #1 and PR #2 are merged in order.

## Acceptance

PR #3 is ready when:
- runtime terrain storage is chunked and dense,
- one-cell writes are immutable/copy-on-write,
- durable map state is compact JSON-safe Base64,
- old kernel identity save behavior still works,
- same seed generates byte-identical terrain,
- different representative seeds generate different river paths,
- 128×128 map save is <64 KiB,
- 512×512 map save is <512 KiB,
- 10,000 edits do not increase save size according to edit history,
- all repository CI gates remain green.
