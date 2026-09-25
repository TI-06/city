import { describe, expect, it } from 'vitest';
import { cityWorldSaveCodec } from '../../src/persistence/codec/city-world-codec';
import { measureJsonBytes } from '../../src/shared/serialization/measure-json-bytes';
import {
  createKernelSaveWithCodec,
  restoreKernelStateWithCodec,
} from '../../src/simulation/core/kernel-save';
import { SIMULATION_HOURS_PER_YEAR } from '../../src/simulation/core/simulation-clock';
import { SimulationEngine } from '../../src/simulation/core/simulation-engine';
import { createBuildingState, type BuildingUse } from '../../src/simulation/buildings/building-state';
import { createCompanyState } from '../../src/simulation/economy/company-state';
import { ChunkedByteGrid } from '../../src/simulation/map/chunked-byte-grid';
import { createGridDimensions } from '../../src/simulation/map/grid-dimensions';
import {
  TerrainCode,
  WORLD_MAP_GENERATOR_VERSION,
  type WorldMapState,
} from '../../src/simulation/map/world-map-state';
import { createHouseholdState } from '../../src/simulation/population/household-state';
import { createRoadNetworkState, type RoadEdge } from '../../src/simulation/roads/road-network-state';
import { deriveTrafficEdgeMetrics } from '../../src/simulation/traffic/traffic-metrics';
import { createTrafficPressureSystem } from '../../src/simulation/traffic/traffic-pressure-system';
import {
  createCityWorldState,
  type CityWorldState,
} from '../../src/simulation/world/city-world-state';

const SAVED_AT_ISO = '2026-09-25T00:00:00.000Z';
const MAP_WIDTH = 128;
const MAP_HEIGHT = 64;
const LARGE_BUILDING_COUNT = 5_000;

function isRoadColumn(x: number): boolean {
  return x >= 1 && (x - 1) % 3 === 0;
}

function coordinateKey(x: number, y: number): string {
  return `${x},${y}`;
}

function createConnectedRoadGrid() {
  const coordinates: Array<Readonly<{ x: number; y: number }>> = [];

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      if (y === 0 || isRoadColumn(x)) {
        coordinates.push({ x, y });
      }
    }
  }

  const nodeIdByCoordinate = new Map<string, number>();
  const nodes = coordinates.map((coordinate, index) => {
    const id = index + 1;
    nodeIdByCoordinate.set(coordinateKey(coordinate.x, coordinate.y), id);
    return {
      id,
      x: coordinate.x,
      y: coordinate.y,
    };
  });

  const edges: RoadEdge[] = [];
  for (const node of nodes) {
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ] as const) {
      const neighborId = nodeIdByCoordinate.get(coordinateKey(node.x + dx, node.y + dy));
      if (neighborId === undefined) {
        continue;
      }

      edges.push({
        id: edges.length + 1,
        nodeA: Math.min(node.id, neighborId),
        nodeB: Math.max(node.id, neighborId),
        roadType: 'two-lane',
        laneCount: 2,
        lengthCells: 1,
      });
    }
  }

  return createRoadNetworkState({
    topologyVersion: 1,
    nextNodeId: nodes.length + 1,
    nextEdgeId: edges.length + 1,
    nodes,
    edges,
  });
}

function buildingUseAt(index: number, total: number): BuildingUse {
  const residentialCount = Math.floor(total / 2);
  const commercialCount = Math.floor((total - residentialCount) / 2);

  if (index < residentialCount) {
    return 'residential';
  }
  if (index < residentialCount + commercialCount) {
    return 'commercial';
  }
  return 'industrial';
}

function createConnectedDevelopedWorld(totalBuildings = LARGE_BUILDING_COUNT): CityWorldState {
  const dimensions = createGridDimensions(MAP_WIDTH, MAP_HEIGHT);
  const map: WorldMapState = {
    generatorVersion: WORLD_MAP_GENERATOR_VERSION,
    mapSeed: `traffic-soak-${totalBuildings}`,
    dimensions,
    terrain: ChunkedByteGrid.filled(dimensions, TerrainCode.LAND),
  };
  const roads = createConnectedRoadGrid();

  const buildingCells: Array<Readonly<{ x: number; y: number }>> = [];
  for (let y = 1; y < MAP_HEIGHT && buildingCells.length < totalBuildings; y += 1) {
    for (let x = 0; x < MAP_WIDTH && buildingCells.length < totalBuildings; x += 1) {
      if (!isRoadColumn(x)) {
        buildingCells.push({ x, y });
      }
    }
  }

  if (buildingCells.length !== totalBuildings) {
    throw new Error(`Traffic soak fixture could only place ${buildingCells.length} buildings`);
  }

  const buildings = createBuildingState({
    version: totalBuildings,
    nextBuildingId: totalBuildings + 1,
    buildings: buildingCells.map((cell, index) => ({
      id: index + 1,
      x: cell.x,
      y: cell.y,
      use: buildingUseAt(index, totalBuildings),
      level: 1 as const,
    })),
  });

  const residentialBuildings = buildings.buildings.filter(
    (building) => building.use === 'residential',
  );
  const businessBuildings = buildings.buildings.filter(
    (building) => building.use !== 'residential',
  );

  const households = createHouseholdState({
    version: residentialBuildings.length,
    nextHouseholdId: residentialBuildings.length + 1,
    households: residentialBuildings.map((building, index) => ({
      id: index + 1,
      homeBuildingId: building.id,
      memberCount: 3,
      workerCount: 2,
    })),
  });

  const companies = createCompanyState({
    version: businessBuildings.length,
    nextCompanyId: businessBuildings.length + 1,
    companies: businessBuildings.map((building, index) => ({
      id: index + 1,
      buildingId: building.id,
      kind: building.use === 'commercial' ? ('commercial' as const) : ('industrial' as const),
      jobCapacity: building.use === 'commercial' ? 8 : 12,
    })),
  });

  return createCityWorldState(
    map,
    roads,
    undefined,
    buildings,
    undefined,
    households,
    companies,
  );
}

function createTrafficEngine(
  world: CityWorldState,
  seed = 'traffic-soak-engine',
) {
  const system = createTrafficPressureSystem();
  const engine = SimulationEngine.create<CityWorldState>({
    world,
    seed,
    systems: [system],
  });

  return { engine, system };
}

function save(engine: SimulationEngine<CityWorldState>) {
  return createKernelSaveWithCodec(engine, SAVED_AT_ISO, cityWorldSaveCodec);
}

describe('traffic long-run persistence', () => {
  it('keeps 5,000 connected developed buildings below 512 KiB and produces congestion', () => {
    const { engine, system } = createTrafficEngine(createConnectedDevelopedWorld());

    engine.step(24);

    const encoded = save(engine);
    const bytes = measureJsonBytes(encoded);
    const roadEdgeIds = new Set(engine.state.world.roads.edges.map((edge) => edge.id));
    const edgeById = new Map(engine.state.world.roads.edges.map((edge) => [edge.id, edge]));

    for (const entry of engine.state.world.traffic.edgeVolumes) {
      expect(roadEdgeIds.has(entry.edgeId)).toBe(true);
    }

    const congestionPercents = engine.state.world.traffic.edgeVolumes.map((entry) => {
      const edge = edgeById.get(entry.edgeId);
      if (edge === undefined) {
        throw new Error(`Missing traffic edge ${entry.edgeId}`);
      }
      return deriveTrafficEdgeMetrics(edge, entry.volume).congestionPercent;
    });

    console.info(
      `traffic-storage-metric buildings=${engine.state.world.buildings.buildings.length} roads=${engine.state.world.roads.nodes.length} edges=${engine.state.world.roads.edges.length} trafficEdges=${engine.state.world.traffic.edgeVolumes.length} recalculations=${system.getRecalculationCount()} saveBytes=${bytes}`,
    );

    expect(bytes).toBeLessThan(512 * 1024);
    expect(system.getRecalculationCount()).toBe(1);
    expect(system.getLastRouteSearchCount()).toBeLessThanOrEqual(64);
    expect(Math.max(...congestionPercents)).toBeGreaterThan(100);

    const serialized = JSON.stringify(encoded);
    expect(serialized).not.toContain('vehicle');
    expect(serialized).not.toContain('tripHistory');
    expect(serialized).not.toContain('routeCache');
    expect(serialized).not.toContain('nodeByCoordinate');
    expect(serialized).not.toContain('findShortestPathEdgeIds');
  });

  it('does not accumulate traffic history across 20 unchanged simulated years', () => {
    const { engine, system } = createTrafficEngine(createConnectedDevelopedWorld());

    engine.step(SIMULATION_HOURS_PER_YEAR * 10);
    const tenYearBytes = measureJsonBytes(save(engine));
    const recalculationsAtTenYears = system.getRecalculationCount();
    const trafficAtTenYears = engine.state.world.traffic;

    engine.step(SIMULATION_HOURS_PER_YEAR * 10);
    const twentyYearBytes = measureJsonBytes(save(engine));
    const deltaBytes = twentyYearBytes - tenYearBytes;

    console.info(
      `traffic-storage-metric tenYearBytes=${tenYearBytes} twentyYearBytes=${twentyYearBytes} deltaBytes=${deltaBytes} recalculations=${system.getRecalculationCount()}`,
    );

    expect(recalculationsAtTenYears).toBe(1);
    expect(system.getRecalculationCount()).toBe(1);
    expect(engine.state.world.traffic).toBe(trafficAtTenYears);
    expect(Math.abs(deltaBytes)).toBeLessThan(128);
  });

  it('matches long-horizon traffic after save and restore with fresh runtime caches', () => {
    const world = createConnectedDevelopedWorld(300);

    const uninterrupted = createTrafficEngine(world, 'traffic-restore').engine;
    uninterrupted.step(SIMULATION_HOURS_PER_YEAR * 10);

    const staged = createTrafficEngine(world, 'traffic-restore').engine;
    staged.step(SIMULATION_HOURS_PER_YEAR * 5);
    const saved = save(staged);
    const restoredState = restoreKernelStateWithCodec(saved, cityWorldSaveCodec);
    const restoredSystem = createTrafficPressureSystem();
    const restored = SimulationEngine.restore<CityWorldState>({
      state: restoredState,
      systems: [restoredSystem],
    });
    restored.step(SIMULATION_HOURS_PER_YEAR * 5);

    expect(restored.state.world.traffic).toEqual(uninterrupted.state.world.traffic);
    expect(restored.state.randomState).toEqual(uninterrupted.state.randomState);
    expect(restored.state.clock).toEqual(uninterrupted.state.clock);
    expect(restored.state.revision).toBe(uninterrupted.state.revision);
  });
});
