import {
  createBuildingState,
  type Building,
  type BuildingState,
  type BuildingUse,
} from '../../simulation/buildings/building-state';

export const BUILDING_CODEC_VERSION = 1;

type BuildingUseCode = 1 | 2 | 3;

export type EncodedBuildingState = Readonly<{
  codecVersion: typeof BUILDING_CODEC_VERSION;
  version: number;
  nextBuildingId: number;
  buildings: readonly (readonly [
    id: number,
    x: number,
    y: number,
    useCode: BuildingUseCode,
    level: 1,
  ])[];
}>;

function encodeBuildingUse(use: BuildingUse): BuildingUseCode {
  switch (use) {
    case 'residential':
      return 1;
    case 'commercial':
      return 2;
    case 'industrial':
      return 3;
  }
}

function decodeBuildingUse(value: unknown): BuildingUse {
  switch (value) {
    case 1:
      return 'residential';
    case 2:
      return 'commercial';
    case 3:
      return 'industrial';
    default:
      throw new RangeError('Building use code must be 1, 2, or 3');
  }
}

function decodeBuildingTuple(tuple: unknown, index: number): Building {
  if (!Array.isArray(tuple) || tuple.length !== 5) {
    throw new RangeError(`Building tuple at index ${index} must contain exactly 5 values`);
  }

  const [id, x, y, useCode, level] = tuple;
  if (typeof id !== 'number' || typeof x !== 'number' || typeof y !== 'number') {
    throw new RangeError(`Building tuple at index ${index} requires numeric id, x, and y`);
  }

  if (level !== 1) {
    throw new RangeError('Building level must be 1 in building codec version 1');
  }

  return {
    id,
    x,
    y,
    use: decodeBuildingUse(useCode),
    level: 1,
  };
}

export function encodeBuildingState(state: BuildingState): EncodedBuildingState {
  const validated = createBuildingState(state);

  return {
    codecVersion: BUILDING_CODEC_VERSION,
    version: validated.version,
    nextBuildingId: validated.nextBuildingId,
    buildings: validated.buildings.map(
      (building) =>
        [
          building.id,
          building.x,
          building.y,
          encodeBuildingUse(building.use),
          building.level,
        ] as const,
    ),
  };
}

export function decodeBuildingState(saved: EncodedBuildingState): BuildingState {
  if (saved.codecVersion !== BUILDING_CODEC_VERSION) {
    throw new RangeError('Unsupported building codec version; expected 1');
  }

  return createBuildingState({
    version: saved.version,
    nextBuildingId: saved.nextBuildingId,
    buildings: saved.buildings.map((tuple, index) => decodeBuildingTuple(tuple, index)),
  });
}
