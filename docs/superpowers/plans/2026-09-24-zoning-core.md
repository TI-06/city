# Zoning Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add compact residential/commercial/industrial zoning state, deterministic zoning commands, durable save support, and reusable road-access queries for the next automatic-development phase.

**Architecture:** Zoning is dense cell data and therefore reuses the existing 32×32 `ChunkedByteGrid`; it is not stored as one object per cell. Runtime `CityWorldState` becomes map + roads + zoning. Zoning placement is independent from road access: players may designate valid LAND cells without road access, while a transient road-access index exposes whether a zoned cell is eligible for later development.

**Tech Stack:** TypeScript 5.9.3, Vitest 5.0.1, existing `ChunkedByteGrid`, `SimulationEngine`, compact persistence codecs.

**Spec:** `docs/superpowers/specs/2026-09-24-city-core-design.md`

## Global Constraints

- Initial zones are residential, commercial, and industrial.
- `ZoneCode.NONE = 0`, `RESIDENTIAL = 1`, `COMMERCIAL = 2`, `INDUSTRIAL = 3`.
- Zoning is dense numeric state stored as bytes, never object-per-cell JSON.
- Runtime zoning dimensions must exactly match map dimensions.
- Non-NONE zoning may exist only on LAND and never on a road cell.
- Setting NONE is allowed on any in-bounds cell, including water/road cells, so clearing is always safe.
- A zone does **not** require road access to be placed; road access is a later development condition.
- Development road access means at least one orthogonally adjacent road node.
- One zoning command contains 1–256 unique cells.
- Zoning version increments exactly once if at least one cell actually changes and remains unchanged for a complete no-op.
- Simulation revision may still advance for a valid zoning no-op.
- Durable saves contain only current zoning state; no brush history or road-access index is persisted.
- City-world codec gets an explicit codec version before public release.
- Existing road/map state and command contracts remain backward-compatible inside the stacked branch.
- Traffic, buildings, demand, population, jobs, economy, and UI rendering remain out of scope.

## Review Focus

1. Malformed saves with zoning dimensions different from map dimensions must be rejected.
2. Malformed saves with non-NONE zoning on WATER or on a road cell must be rejected.
3. Repeated/out-of-bounds/non-integer cells must fail before any zoning mutation.
4. Reapplying the same zone must not increase zoning version or durable save size according to command history.
5. Road-access indexing must be transient, topology-version aware, and must never appear in serialized city state.

---

### Task 1: Add compact zoning runtime state

**Files:**
- Create: `src/simulation/zoning/zoning-state.ts`
- Create: `tests/unit/zoning/zoning-state.test.ts`

**Produces:**
- `ZoneCode`
- `ZoneCodeValue`
- `ZoningState { version: number; grid: ChunkedByteGrid }`
- `createEmptyZoning(dimensions)`
- `createZoningState(version, grid)`
- `getZoneAt(state, x, y)`
- `isZoneCode(value)`

- [ ] RED tests:
  - empty grid is NONE across corners/boundaries;
  - dimensions are preserved;
  - version must be non-negative safe integer;
  - every accepted zone code is recognized and 4/negative/non-integer values are rejected by `isZoneCode`.
- [ ] Implement with no persistent Map/cache.
- [ ] Run focused test, `npm run test`, `npm run typecheck`.

---

### Task 2: Add zoning persistence codec

**Files:**
- Create: `src/persistence/codec/zoning-codec.ts`
- Create: `tests/unit/persistence/zoning-codec.test.ts`

**Produces:**
- `ZONING_CODEC_VERSION = 1`
- `EncodedZoningState { codecVersion, version, grid }`
- `encodeZoningState()`
- `decodeZoningState()`

- [ ] RED:
  - round-trip a grid containing all four codes;
  - unsupported codec version rejected;
  - wrong byte-grid dimensions/chunks rejected through grid codec;
  - any decoded byte >3 rejected instead of becoming an unknown zone.
- [ ] Decode grid, then scan declared map cells for valid zone values.
- [ ] Run focused + unit suite.

---

### Task 3: Upgrade CityWorld to map + roads + zoning with explicit codec version

**Files:**
- Modify: `src/simulation/world/city-world-state.ts`
- Modify: `src/persistence/codec/city-world-codec.ts`
- Modify: `tests/unit/persistence/city-world-codec.test.ts`
- Modify affected road soak fixtures.

**Produces:**
- `CityWorldState { map, roads, zoning }`
- `CITY_WORLD_CODEC_VERSION = 1`
- encoded city shape `{ codecVersion, map, roads, zoning }`

- [ ] RED:
  - starter city has empty zoning matching map dimensions;
  - zoning dimension mismatch rejected;
  - non-NONE zone on WATER rejected;
  - non-NONE zone on road cell rejected;
  - encoded city round-trip preserves zoning bytes/version;
  - unsupported city codec version rejected;
  - JSON save contains no runtime `Uint8Array`, Map, command history, or access index.
- [ ] Keep `createCityWorldState(map, roads, zoning?)` additive: omitted zoning creates empty zoning for internal call-site compatibility.
- [ ] Cross-domain validation scans non-NONE zoning cells and verifies LAND/no-road.
- [ ] Run unit + simulation suite and update fixtures only as required.

---

### Task 4: Add deterministic zoning mutation planning + SET_ZONE_CELLS command

**Files:**
- Create: `src/simulation/zoning/set-zone-command.ts`
- Create: `tests/unit/zoning/set-zone-command.test.ts`

**Produces:**
- `MAX_ZONE_CELLS_PER_COMMAND = 256`
- `ZoneGridPoint`
- `SetZoneCellsPayload { zone, cells }`
- `SetZoneCellsDelta { zoningVersion, changedCellCount }`
- `ZoningValidationError`
- `setZoneCellsHandler: CommandHandler<CityWorldState>`

Validation:
- 1–256 cells;
- coordinates safe integers and in bounds;
- no repeated cells;
- zone must be one of 0..3;
- target != NONE requires LAND;
- target != NONE rejects road-occupied cells;
- road access is **not** required.

Application:
- validate every cell before mutation;
- apply only cells whose current code differs;
- use immutable `withCell()`;
- zoning version +1 once if any change;
- complete no-op keeps same `ZoningState` object/version;
- world map/roads retain identity.

- [ ] RED all validation and no-partial-mutation cases.
- [ ] RED residential/commercial/industrial set, clear-to-NONE, remote/no-road zoning allowed.
- [ ] RED duplicate command/revision conflict/no-op revision semantics through `SimulationEngine`.
- [ ] RED maximum 256-cell response below 128 KiB.
- [ ] Implement minimal handler.
- [ ] Run focused + unit suite.

---

### Task 5: Add transient road-access index for future automatic development

**Files:**
- Create: `src/simulation/roads/road-access-index.ts`
- Create: `src/simulation/zoning/zoning-development-access.ts`
- Create: `tests/unit/zoning/zoning-development-access.test.ts`

**Produces:**
- `RoadAccessIndex`
- `createRoadAccessIndex(roads)`
- `hasRoadAt(x,y)`
- `hasAdjacentRoad(x,y)`
- `isZonedCellRoadAccessible(zoning,index,x,y)`

Rules:
- index captures `roads.topologyVersion`;
- index uses a transient Set of coordinate keys internally;
- adjacent means only N/S/E/W, not diagonal;
- NONE is never development-accessible;
- a zoned cell next to any road is accessible;
- a zoned cell with no adjacent road remains designated but not development-accessible.

- [ ] RED orthogonal/diagonal/no-road/NONE cases.
- [ ] Verify `JSON.stringify(cityWorldSaveCodec.encode(world))` contains no access-index data.
- [ ] Run unit suite.

---

### Task 6: Add zoning storage/history/long-run regressions and final review

**Files:**
- Create: `tests/simulation/zoning-soak.test.ts`
- Update PR body after verification.

- [ ] 128×128 starter city with zoning remains comfortably <128 KiB.
- [ ] 512×512 map+empty zoning remains <1 MiB before later buildings/economy.
- [ ] Dispatch 10,000 valid zoning no-op commands with unique IDs:
  - recent cache = 256;
  - zoning version/grid unchanged;
  - command IDs absent from save;
  - save-size growth <128 bytes.
- [ ] Fill representative 128×128 LAND cells with mixed R/C/I zones and verify deterministic save bytes for same seed/commands.
- [ ] Verify restore then further zoning preserves version/grid exactly.
- [ ] Run:
  - `npm run verify`
  - `npm run e2e`
  - `npx wrangler deploy --dry-run`
- [ ] Whole-PR self-review (no subagent available) for:
  - object-per-cell accidental storage,
  - cross-domain invalid zones,
  - road-access index persistence,
  - partial mutation on error,
  - save/request/response growth.
- [ ] Any Critical/Important finding gets a focused RED→GREEN fix before Ready.
- [ ] Record unit/simulation counts and measured save metrics in PR body.
- [ ] Mark PR Ready only on latest fully green head.

## Acceptance

PR #5 is ready when:
- R/C/I/NONE zoning is compact byte-grid state;
- zoning can be designated without road access;
- later development can query orthogonal road access through a transient index;
- invalid zone placement never partially mutates state;
- save/load preserves zoning exactly;
- city/zoning codecs are explicitly versioned;
- 10,000 no-op zoning commands do not bloat durable state;
- unit, simulation, build, E2E, and Cloudflare dry-run gates are green.
