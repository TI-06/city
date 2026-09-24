import { describe, expect, it } from 'vitest';
import { cityWorldSaveCodec } from '../../src/persistence/codec/city-world-codec';
import { measureJsonBytes } from '../../src/shared/serialization/measure-json-bytes';
import type { GameCommand } from '../../src/shared/transport/game-command';
import {
  createKernelSaveWithCodec,
  restoreKernelStateWithCodec,
} from '../../src/simulation/core/kernel-save';
import { SimulationEngine } from '../../src/simulation/core/simulation-engine';
import { ChunkedByteGrid } from '../../src/simulation/map/chunked-byte-grid';
import { createGridDimensions } from '../../src/simulation/map/grid-dimensions';
import {
  TerrainCode,
  WORLD_MAP_GENERATOR_VERSION,
  type WorldMapState,
} from '../../src/simulation/map/world-map-state';
import { createEmptyRoadNetwork } from '../../src/simulation/roads/road-network-state';
import {
  createCityWorldState,
  createStarterCityWorld,
  type CityWorldState,
} from '../../src/simulation/world/city-world-state';
import {
  setZoneCellsHandler,
  type SetZoneCellsPayload,
  type ZoneGridPoint,
} from '../../src/simulation/zoning/set-zone-command';
import { ZoneCode, type ZoneCodeValue } from '../../src/simulation/zoning/zoning-state';

const SAVED_AT_ISO = '2026-09-24T00:00:00.000Z';

function createAllLandCityWorld(
  width = 128,
  height = 128,
  mapSeed = 'all-land-zoning-soak',
): CityWorldState {
  const dimensions = createGridDimensions(width, height);
  const map: WorldMapState = {
    generatorVersion: WORLD_MAP_GENERATOR_VERSION,
    mapSeed,
    dimensions,
    terrain: ChunkedByteGrid.filled(dimensions, TerrainCode.LAND),
  };

  return createCityWorldState(map, createEmptyRoadNetwork());
}

function createZoningEngine(world = createAllLandCityWorld()) {
  return SimulationEngine.create<CityWorldState>({
    world,
    seed: `zoning-soak-engine:${world.map.mapSeed}`,
    handlers: [setZoneCellsHandler],
  });
}

function dispatchZone(
  engine: SimulationEngine<CityWorldState>,
  commandId: string,
  zone: ZoneCodeValue,
  cells: readonly ZoneGridPoint[],
): void {
  const command: GameCommand<'SET_ZONE_CELLS', SetZoneCellsPayload> = {
    commandId,
    baseRevision: engine.state.revision,
    type: 'SET_ZONE_CELLS',
    payload: { zone, cells },
  };

  engine.dispatch(command);
}

function saveZoningEngine(engine: SimulationEngine<CityWorldState>) {
  return createKernelSaveWithCodec(engine, SAVED_AT_ISO, cityWorldSaveCodec);
}

function mixedZoneForIndex(index: number): ZoneCodeValue {
  switch (index % 3) {
    case 0:
      return ZoneCode.RESIDENTIAL;
    case 1:
      return ZoneCode.COMMERCIAL;
    default:
      return ZoneCode.INDUSTRIAL;
  }
}

function applyRepresentativeMixedZoning(engine: SimulationEngine<CityWorldState>): void {
  let commandIndex = 0;

  for (let y = 0; y < 64; y += 1) {
    const cells = Array.from({ length: 64 }, (_, x) => ({ x, y }));
    dispatchZone(engine, `mixed-${commandIndex}`, mixedZoneForIndex(y), cells);
    commandIndex += 1;
  }
}

describe('zoning long-run persistence', () => {
  it('keeps a 128x128 starter city with zoning below 128 KiB', () => {
    const engine = createZoningEngine(createStarterCityWorld('zoning-starter-size'));
    const bytes = measureJsonBytes(saveZoningEngine(engine));

    console.info(`zoning-storage-metric starter128Bytes=${bytes}`);
    expect(bytes).toBeLessThan(128 * 1024);
  });

  it('keeps a 512x512 city with empty zoning below 1 MiB', () => {
    const engine = createZoningEngine(
      createStarterCityWorld('zoning-max-size', createGridDimensions(512, 512)),
    );
    const bytes = measureJsonBytes(saveZoningEngine(engine));

    console.info(`zoning-storage-metric max512Bytes=${bytes}`);
    expect(bytes).toBeLessThan(1024 * 1024);
  });

  it('does not grow durable zoning state with 10,000 historical no-op commands', () => {
    const engine = createZoningEngine();
    const cells = [{ x: 0, y: 0 }] as const;

    dispatchZone(engine, 'zone-initial', ZoneCode.RESIDENTIAL, cells);
    const zoning = engine.state.world.zoning;
    const beforeBytes = measureJsonBytes(saveZoningEngine(engine));

    for (let index = 0; index < 10_000; index += 1) {
      dispatchZone(engine, `zone-noop-${index}`, ZoneCode.RESIDENTIAL, cells);
    }

    const after = saveZoningEngine(engine);
    const afterBytes = measureJsonBytes(after);
    const deltaBytes = afterBytes - beforeBytes;

    console.info(
      `zoning-storage-metric noopBeforeBytes=${beforeBytes} noopAfterBytes=${afterBytes} noopDeltaBytes=${deltaBytes}`,
    );

    expect(engine.recentCommandCount).toBe(256);
    expect(engine.state.world.zoning).toBe(zoning);
    expect(engine.state.world.zoning.version).toBe(1);
    expect(Math.abs(deltaBytes)).toBeLessThan(128);
    expect(JSON.stringify(after)).not.toContain('zone-noop-9999');
  });

  it('produces identical encoded saves for the same mixed zoning command sequence', () => {
    const a = createZoningEngine(createAllLandCityWorld(128, 128, 'mixed-zoning'));
    const b = createZoningEngine(createAllLandCityWorld(128, 128, 'mixed-zoning'));

    applyRepresentativeMixedZoning(a);
    applyRepresentativeMixedZoning(b);

    expect(saveZoningEngine(a)).toEqual(saveZoningEngine(b));
    expect(a.state.world.zoning.version).toBe(64);
  });

  it('restores zoning exactly and continues versioning from the restored state', () => {
    const engine = createZoningEngine();

    dispatchZone(engine, 'restore-zone-1', ZoneCode.RESIDENTIAL, [{ x: 0, y: 0 }]);
    dispatchZone(engine, 'restore-zone-2', ZoneCode.COMMERCIAL, [{ x: 1, y: 0 }]);

    const beforeSave = saveZoningEngine(engine);
    const restoredState = restoreKernelStateWithCodec(beforeSave, cityWorldSaveCodec);
    const restored = SimulationEngine.restore<CityWorldState>({
      state: restoredState,
      handlers: [setZoneCellsHandler],
    });

    expect(saveZoningEngine(restored).state.world.zoning).toEqual(beforeSave.state.world.zoning);
    expect(restored.state.world.zoning.version).toBe(2);
    expect(restored.state.world.zoning.grid.get(0, 0)).toBe(ZoneCode.RESIDENTIAL);
    expect(restored.state.world.zoning.grid.get(1, 0)).toBe(ZoneCode.COMMERCIAL);

    dispatchZone(restored, 'restore-zone-3', ZoneCode.INDUSTRIAL, [{ x: 2, y: 0 }]);

    expect(restored.state.world.zoning.version).toBe(3);
    expect(restored.state.world.zoning.grid.get(2, 0)).toBe(ZoneCode.INDUSTRIAL);
  });
});
