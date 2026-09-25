import { describe, expect, it } from 'vitest';
import type { GameCommand } from '../../../src/shared/transport/game-command';
import { SimulationEngine } from '../../../src/simulation/core/simulation-engine';
import { ChunkedByteGrid } from '../../../src/simulation/map/chunked-byte-grid';
import { createGridDimensions } from '../../../src/simulation/map/grid-dimensions';
import {
  TerrainCode,
  WORLD_MAP_GENERATOR_VERSION,
  type WorldMapState,
} from '../../../src/simulation/map/world-map-state';
import {
  buildRoadPathHandler,
  type BuildRoadPathPayload,
} from '../../../src/simulation/roads/build-road-command';
import { createRoadNetworkState } from '../../../src/simulation/roads/road-network-state';
import { createPublicServiceState } from '../../../src/simulation/services/public-service-state';
import {
  createCityWorldState,
  type CityWorldState,
} from '../../../src/simulation/world/city-world-state';
import {
  setZoneCellsHandler,
  type SetZoneCellsPayload,
} from '../../../src/simulation/zoning/set-zone-command';
import { ZoneCode } from '../../../src/simulation/zoning/zoning-state';

function createWorld(): CityWorldState {
  const dimensions = createGridDimensions(16, 16);
  const map: WorldMapState = {
    generatorVersion: WORLD_MAP_GENERATOR_VERSION,
    mapSeed: 'public-service-conflicts',
    dimensions,
    terrain: ChunkedByteGrid.filled(dimensions, TerrainCode.LAND),
  };
  const roads = createRoadNetworkState({
    topologyVersion: 1,
    nextNodeId: 3,
    nextEdgeId: 2,
    nodes: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 1, y: 0 },
    ],
    edges: [
      { id: 1, nodeA: 1, nodeB: 2, roadType: 'two-lane', laneCount: 2, lengthCells: 1 },
    ],
  });
  const services = createPublicServiceState({
    version: 1,
    nextServiceId: 2,
    services: [{ id: 1, x: 0, y: 1, kind: 'fire' }],
  });

  return createCityWorldState(
    map,
    roads,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    services,
  );
}

describe('public service cross-domain conflicts', () => {
  it('rejects road construction through a service cell before treasury mutation', () => {
    const world = createWorld();
    const engine = SimulationEngine.create<CityWorldState>({
      world,
      seed: 'public-service-road-conflict',
      handlers: [buildRoadPathHandler],
    });
    const before = engine.state;
    const command: GameCommand<'BUILD_ROAD_PATH', BuildRoadPathPayload> = {
      commandId: 'road-service-conflict',
      baseRevision: 0,
      type: 'BUILD_ROAD_PATH',
      payload: {
        cells: [
          { x: 0, y: 0 },
          { x: 0, y: 1 },
        ],
      },
    };

    expect(() => engine.dispatch(command)).toThrow(/service/i);
    expect(engine.state).toEqual(before);
    expect(engine.recentCommandCount).toBe(0);
  });

  it('rejects non-NONE zoning on a service cell but allows NONE as a no-op', () => {
    const world = createWorld();
    const engine = SimulationEngine.create<CityWorldState>({
      world,
      seed: 'public-service-zone-conflict',
      handlers: [setZoneCellsHandler],
    });

    const zoneCommand: GameCommand<'SET_ZONE_CELLS', SetZoneCellsPayload> = {
      commandId: 'zone-service-conflict',
      baseRevision: 0,
      type: 'SET_ZONE_CELLS',
      payload: {
        zone: ZoneCode.RESIDENTIAL,
        cells: [{ x: 0, y: 1 }],
      },
    };
    expect(() => engine.dispatch(zoneCommand)).toThrow(/service/i);
    expect(engine.state.revision).toBe(0);

    const clearCommand: GameCommand<'SET_ZONE_CELLS', SetZoneCellsPayload> = {
      commandId: 'zone-service-clear',
      baseRevision: 0,
      type: 'SET_ZONE_CELLS',
      payload: {
        zone: ZoneCode.NONE,
        cells: [{ x: 0, y: 1 }],
      },
    };
    engine.dispatch(clearCommand);

    expect(engine.state.world.publicServices).toBe(world.publicServices);
    expect(engine.state.world.zoning).toBe(world.zoning);
    expect(engine.state.revision).toBe(1);
  });
});
