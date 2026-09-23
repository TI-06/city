# City Core Design Specification

**Date:** 2026-09-24  
**Repository:** `TI-06/city`  
**Status:** Design approved in conversation; written specification for implementation planning.

## 1. Product Goal

Build a high-quality browser-based Japanese city-building simulation where the player shapes roads, zoning, public services, transport, and policy while buildings, households, companies, land value, and traffic respond autonomously.

The first playable target is a vertical slice where the player can:
1. build roads,
2. zone residential/commercial/industrial land,
3. watch buildings emerge,
4. gain population and jobs,
5. collect tax revenue,
6. encounter congestion,
7. improve land value with services,
8. observe building growth,
9. save, reload, and continue without save or request size growing with historical play length.

## 2. Technical Direction

- TypeScript with strict type checking.
- Phaser for map/game rendering.
- React for HUD, menus, inspectors, charts, and dialogs.
- Vite for the web build.
- Vitest for unit and simulation tests.
- Playwright for browser/E2E and visual-regression tests.
- Cloudflare Workers Static Assets for deployment.
- GitHub feature branches and pull requests into `main`.
- IndexedDB for initial local persistence.
- Cloudflare Worker API + D1 may be introduced later for cloud saves.

## 3. Architecture

The project is separated into four major boundaries:

1. **Simulation Core**
   - deterministic game state and systems,
   - no Phaser or React dependency,
   - runnable headlessly for long-horizon simulation tests.

2. **Game Presentation**
   - Phaser map, sprites, camera, selection, construction previews, traffic visualization,
   - reads simulation state and submits commands,
   - never owns authoritative simulation state.

3. **React UI**
   - HUD, construction menus, city information, graphs, settings, inspectors,
   - submits commands and reads view models,
   - no business rules that belong in the simulation.

4. **Persistence / Platform**
   - IndexedDB save/load,
   - migrations,
   - optional Worker/D1 synchronization later,
   - owns persistence and transport contracts, not gameplay rules.

## 4. Determinism

The simulation must be reproducible from a seed and a known command sequence.

Required state:
- world seed,
- simulation clock,
- revision,
- deterministic RNG state where necessary.

Random simulation behavior must not call `Math.random()` directly.

A fixed seed must allow failures found in soak tests to be reproduced.

## 5. Simulation Model

The browser must not perform fully detailed per-frame simulation for every citizen and vehicle at large population sizes.

Use a hybrid model:

- city statistics for macro population/economy,
- household/company entities for meaningful decisions,
- selected/followed citizens for individual life stories,
- aggregate traffic calculation per network segment,
- visible people and vehicles as a sampled visualization of simulation results.

This keeps the city readable and alive without requiring one expensive AI/pathfinding loop for every resident.

## 6. Save Architecture — Hard Requirements

Save growth must be proportional to the **current city state**, not to the total number of actions ever performed.

### 6.1 Prohibited patterns

Never persist:
- an unbounded command/event log as part of the normal save,
- historical full-state snapshots for every action,
- duplicate copies of the same city state inside operation records,
- API responses containing the entire save after every command,
- redundant embedded copies of referenced entities where an ID is sufficient.

### 6.2 Save contents

A save contains authoritative current state only:

```text
GameSave
├─ saveVersion
├─ revision
├─ metadata
├─ seed / rng state
├─ clock
├─ map
├─ road network
├─ zoning
├─ buildings
├─ households
├─ companies
├─ economy
├─ land-value / service grids
├─ progression
└─ bounded diagnostic metadata
```

Undo/redo history, diagnostics, operation deduplication, and telemetry are separate from the durable city snapshot and must be strictly bounded.

### 6.3 Normalized references

Entities reference other entities by stable IDs.

Example:
- household stores `homeBuildingId`, not a copy of the building,
- company stores `buildingId`,
- roads store node IDs rather than nested repeated node objects.

### 6.4 Dense map data

Dense numeric grids such as terrain, zoning masks, land value, pollution, or service coverage should use compact typed arrays or similarly compact representations rather than verbose object-per-cell JSON.

### 6.5 Save generations

Maintain:
- current autosave,
- bounded previous autosave generations,
- explicit manual slots.

Generation count is fixed. Old generations are replaced; they do not grow forever.

### 6.6 Migration

Every save has `saveVersion`.

Migration is forward-only through explicit versioned migrators:

```text
v1 -> v2 -> v3
```

Never silently reinterpret an old structure as a new one.

### 6.7 Persistence cadence

Do not serialize/write the full city every simulation tick.

Persist on:
- bounded autosave interval,
- important lifecycle events where appropriate,
- explicit manual save,
- page lifecycle safety checkpoint where reliable.

Use dirty tracking / partitioned persistence when city size makes full snapshots expensive.

### 6.8 Save-size performance budgets

These are project budgets, not Cloudflare platform limits.

Benchmark fixtures will track serialized current-state size so growth regressions are visible.

Initial budgets:
- starter city: <= 2 MB serialized state,
- representative 10-year city: <= 5 MB,
- representative 50-year city: <= 15 MB.

If a benchmark exceeds a budget, the phase cannot be called complete until the cause is understood and intentionally accepted or corrected.

The important invariant is that replaying additional years without increasing the live city state must not cause linear save growth from historical operations.

## 7. Request / Response Architecture — Hard Requirements

Initial v0.1 is local-first, but all simulation commands must be designed so future cloud synchronization does not require transmitting full city state on every action.

### 7.1 Command envelope

Future network-capable commands use a shape conceptually equivalent to:

```ts
type GameCommand<T> = {
  commandId: string;
  baseRevision: number;
  type: string;
  payload: T;
};
```

Commands send only the intent and data necessary for that action.

Examples:
- road segment placement data,
- zoning rectangle/brush delta,
- service building placement,
- policy change.

### 7.2 Response envelope

A successful mutation returns:
- command acknowledgement,
- new revision,
- bounded changed-state/delta,
- concise events needed by the UI.

It does **not** return `GameSave` by default.

### 7.3 Full synchronization

A full snapshot is reserved for:
- initial cloud load,
- explicit recovery from revision mismatch,
- explicit device synchronization,
- migration/recovery workflows.

Large snapshots must support compression and, when necessary, chunking or partitioned transfer.

### 7.4 Request budgets

Project budgets:
- ordinary command target: <= 64 KB,
- ordinary command hard application guard: <= 256 KB,
- ordinary mutation response target: <= 128 KB,
- full snapshot responses are exceptional and separately measured.

Bulk operations such as zoning a large area should use compact geometry/range descriptions, not one verbose object per cell.

### 7.5 Idempotency

Network-capable mutations carry `commandId`.

Deduplication records must be bounded by:
- maximum entry count and/or
- TTL.

Deduplication storage must never retain historical full-state responses.

### 7.6 Revision conflicts

Commands include `baseRevision`.

On mismatch:
- do not blindly overwrite,
- return a compact conflict/resync indication,
- request only the synchronization necessary to recover.

## 8. Performance Rules

- Simulation Core must be runnable without DOM/Phaser.
- Expensive global recalculations must be avoided on every tick.
- Road/network changes should invalidate only affected caches where feasible.
- Visible sprite counts use pooling/culling.
- UI does not rerender the whole city state on each tick.
- Large persistence work should not create visible frame stalls.
- Performance benchmarks are added before systems become large enough to hide regressions.

## 9. Initial Gameplay Systems

### Road system
- road graph built from nodes and edges,
- initial two-lane roads,
- construction preview and cost,
- foundation for service routing and traffic.

### Zoning
Initial zones:
- residential,
- commercial,
- industrial.

A zone requires road access before development.

### Automatic buildings
Development depends on demand, road access, available land, and later land value/services.

### Population and jobs
Use household/company abstractions first. Individual citizen stories are an enhancement on top of the aggregate model.

### Economy
Track:
- population,
- jobs,
- unemployment,
- demand,
- tax revenue,
- operating costs,
- treasury.

### Land value
Land value responds to accessibility, services, environment, congestion, and amenities.

### Public services
Initial service set:
- park,
- school,
- fire,
- police,
- hospital.

Service accessibility should eventually use road travel accessibility rather than simple circles where practical.

### Traffic
Authoritative traffic is aggregate per road segment:
- capacity,
- volume,
- speed,
- congestion.

Visible vehicles are a visual representation and do not each need to be authoritative simulation entities.

## 10. Japanese City Identity

After the core vertical slice, add systems that allow recognizable Japanese urban growth patterns:
- station-centered development,
- shopping streets,
- suburban detached housing,
- national-route/arterial roadside commerce,
- industrial parks,
- aging neighborhoods,
- station-front redevelopment.

The game should allow old neighborhoods to decline or regenerate rather than making all development a monotonic upgrade to maximum level.

## 11. Visual Direction Workflow

Art direction must be selected before large-scale asset production.

Explore three coherent directions:
1. Japanese miniature/model-town style,
2. bright stylized 2.5D,
3. semi-realistic urban model.

Once selected, document and keep consistent:
- camera/view angle,
- scale,
- lighting direction,
- shadow treatment,
- saturation,
- materials,
- building footprint conventions,
- asset naming.

Do not mass-produce assets until the core playable loop proves enjoyable.

## 12. Quality Gates

Every feature uses TDD for simulation/business behavior.

Required repository checks will include:
- format check,
- lint,
- typecheck,
- unit tests,
- simulation tests,
- build,
- E2E tests.

Long-run deterministic simulation fixtures will include representative horizons such as:
- 1 year,
- 10 years,
- 50 years,
- eventually 100 years.

They verify:
- no NaN/Infinity,
- no negative impossible counts,
- no uncontrolled entity explosion,
- bounded demand/value ranges,
- deterministic repeatability,
- save/load equivalence,
- save-size budgets,
- bounded operation metadata.

## 13. Visual Regression

Fixed seeds and fixed camera states will provide reproducible visual fixtures.

Playwright screenshots will detect layout/rendering drift for key screens and city states.

Product-design QA should compare important UI implementations against selected visual targets before handoff.

## 14. Git / Delivery

Repository: `TI-06/city`

Workflow:
- `main` is deployable,
- feature branch per PR,
- review before merge,
- Cloudflare preview for PR validation,
- production deploy from `main`.

Do not accumulate multiple unrelated gameplay subsystems in one PR.

## 15. Vertical Slice Acceptance

The first major playable release is accepted when a new player can:

1. open the game,
2. create/load a deterministic map,
3. build roads,
4. zone land,
5. watch development occur,
6. grow population and jobs,
7. see revenue/cost effects,
8. encounter traffic pressure,
9. improve an area and see land/building response,
10. save and reload correctly,
11. continue long-term play without save size or command metadata growing according to total historical actions.

The vertical slice must feel like a game before deeper policy, rail, demographic, or cloud features are layered on.
