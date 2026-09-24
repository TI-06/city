import type { CommandHandler } from '../core/command-handler';
import { TerrainCode } from '../map/world-map-state';
import type { CityWorldState } from '../world/city-world-state';
import { ZoneCode, isZoneCode, type ZoneCodeValue, type ZoningState } from './zoning-state';

export const MAX_ZONE_CELLS_PER_COMMAND = 256;

export type ZoneGridPoint = Readonly<{
  x: number;
  y: number;
}>;

export type SetZoneCellsPayload = Readonly<{
  zone: ZoneCodeValue;
  cells: readonly ZoneGridPoint[];
}>;

export type SetZoneCellsDelta = Readonly<{
  zoningVersion: number;
  changedCellCount: number;
}>;

export type ZoningValidationCode =
  | 'INVALID_ZONE'
  | 'NO_CELLS'
  | 'TOO_MANY_CELLS'
  | 'INVALID_COORDINATE'
  | 'OUT_OF_BOUNDS'
  | 'REPEATED_CELL'
  | 'WATER'
  | 'ROAD_CONFLICT';

export class ZoningValidationError extends RangeError {
  public constructor(
    public readonly code: ZoningValidationCode,
    message: string,
  ) {
    super(message);
    this.name = 'ZoningValidationError';
  }
}

function coordinateKey(x: number, y: number): string {
  return `${x},${y}`;
}

function parseZoneGridPoint(value: unknown, index: number): ZoneGridPoint {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('x' in value) ||
    !('y' in value) ||
    typeof value.x !== 'number' ||
    typeof value.y !== 'number'
  ) {
    throw new ZoningValidationError(
      'INVALID_COORDINATE',
      `Zone cell ${index} requires numeric x and y`,
    );
  }

  return {
    x: value.x,
    y: value.y,
  };
}

function parseSetZoneCellsPayload(payload: unknown): SetZoneCellsPayload {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('zone' in payload) ||
    typeof payload.zone !== 'number' ||
    !isZoneCode(payload.zone)
  ) {
    throw new ZoningValidationError('INVALID_ZONE', 'SET_ZONE_CELLS requires a valid zone code');
  }

  if (!('cells' in payload) || !Array.isArray(payload.cells)) {
    throw new ZoningValidationError('NO_CELLS', 'SET_ZONE_CELLS requires a cells array');
  }

  return {
    zone: payload.zone,
    cells: payload.cells.map((cell, index) => parseZoneGridPoint(cell, index)),
  };
}

function validateAndFindChanges(
  world: CityWorldState,
  payload: SetZoneCellsPayload,
): readonly ZoneGridPoint[] {
  if (payload.cells.length === 0) {
    throw new ZoningValidationError('NO_CELLS', 'At least one zoning cell is required');
  }

  if (payload.cells.length > MAX_ZONE_CELLS_PER_COMMAND) {
    throw new ZoningValidationError(
      'TOO_MANY_CELLS',
      `Zoning command cannot exceed ${MAX_ZONE_CELLS_PER_COMMAND} cells`,
    );
  }

  const roadCoordinates =
    payload.zone === ZoneCode.NONE
      ? undefined
      : new Set(world.roads.nodes.map((node) => coordinateKey(node.x, node.y)));
  const seen = new Set<string>();
  const changed: ZoneGridPoint[] = [];

  for (let index = 0; index < payload.cells.length; index += 1) {
    const cell = payload.cells[index]!;

    if (!Number.isSafeInteger(cell.x) || !Number.isSafeInteger(cell.y)) {
      throw new ZoningValidationError(
        'INVALID_COORDINATE',
        `Zone cell ${index} must use safe integer coordinates`,
      );
    }

    if (
      cell.x < 0 ||
      cell.y < 0 ||
      cell.x >= world.map.dimensions.width ||
      cell.y >= world.map.dimensions.height
    ) {
      throw new ZoningValidationError('OUT_OF_BOUNDS', `Zone cell ${index} is outside map bounds`);
    }

    const key = coordinateKey(cell.x, cell.y);
    if (seen.has(key)) {
      throw new ZoningValidationError('REPEATED_CELL', `Zoning selection repeats cell ${key}`);
    }
    seen.add(key);

    if (payload.zone !== ZoneCode.NONE) {
      if (world.map.terrain.get(cell.x, cell.y) !== TerrainCode.LAND) {
        throw new ZoningValidationError('WATER', `Zone cell ${key} must be LAND`);
      }

      if (roadCoordinates?.has(key) === true) {
        throw new ZoningValidationError('ROAD_CONFLICT', `Zone cell ${key} cannot overlap a road`);
      }
    }

    if (world.zoning.grid.get(cell.x, cell.y) !== payload.zone) {
      changed.push(cell);
    }
  }

  return changed;
}

function applyZoneChanges(
  zoning: ZoningState,
  zone: ZoneCodeValue,
  cells: readonly ZoneGridPoint[],
): ZoningState {
  if (cells.length === 0) {
    return zoning;
  }

  const nextVersion = zoning.version + 1;
  if (!Number.isSafeInteger(nextVersion)) {
    throw new RangeError('Zoning version exceeded safe integer range');
  }

  let grid = zoning.grid;
  for (const cell of cells) {
    grid = grid.withCell(cell.x, cell.y, zone);
  }

  return {
    version: nextVersion,
    grid,
  };
}

export const setZoneCellsHandler: CommandHandler<CityWorldState> = {
  type: 'SET_ZONE_CELLS',
  apply: (world, payload) => {
    const parsed = parseSetZoneCellsPayload(payload);
    const changedCells = validateAndFindChanges(world, parsed);
    const zoning = applyZoneChanges(world.zoning, parsed.zone, changedCells);

    return {
      world:
        zoning === world.zoning
          ? world
          : {
              ...world,
              zoning,
            },
      delta: {
        zoningVersion: zoning.version,
        changedCellCount: changedCells.length,
      } satisfies SetZoneCellsDelta,
    };
  },
};
