export type BuildingUse = 'residential' | 'commercial' | 'industrial';

export type Building = Readonly<{
  id: number;
  x: number;
  y: number;
  use: BuildingUse;
  level: 1;
}>;

export type BuildingState = Readonly<{
  version: number;
  nextBuildingId: number;
  buildings: readonly Building[];
}>;

export type BuildingStateInput = Readonly<{
  version: number;
  nextBuildingId: number;
  buildings: readonly Building[];
}>;

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
}

function isBuildingUse(value: string): value is BuildingUse {
  return value === 'residential' || value === 'commercial' || value === 'industrial';
}

function coordinateKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function createEmptyBuildingState(): BuildingState {
  return {
    version: 0,
    nextBuildingId: 1,
    buildings: [],
  };
}

export function createBuildingState(input: BuildingStateInput): BuildingState {
  assertNonNegativeSafeInteger(input.version, 'Building version');
  assertPositiveSafeInteger(input.nextBuildingId, 'Next building ID');

  const ids = new Set<number>();
  const coordinates = new Set<string>();
  let maximumId = 0;

  const buildings = input.buildings.map((building) => {
    assertPositiveSafeInteger(building.id, 'Building ID');

    if (!Number.isSafeInteger(building.x) || !Number.isSafeInteger(building.y)) {
      throw new RangeError('Building coordinate must use safe integers');
    }

    if (ids.has(building.id)) {
      throw new RangeError(`Duplicate building ID: ${building.id}`);
    }
    ids.add(building.id);

    const key = coordinateKey(building.x, building.y);
    if (coordinates.has(key)) {
      throw new RangeError(`Duplicate building coordinate: ${key}`);
    }
    coordinates.add(key);

    if (!isBuildingUse(building.use)) {
      throw new RangeError('Building use must be residential, commercial, or industrial');
    }

    if (building.level !== 1) {
      throw new RangeError('Building level must be 1 in building state version 1');
    }

    maximumId = Math.max(maximumId, building.id);
    return {
      id: building.id,
      x: building.x,
      y: building.y,
      use: building.use,
      level: 1,
    } satisfies Building;
  });

  if (input.nextBuildingId <= maximumId) {
    throw new RangeError(
      `Next building ID ${input.nextBuildingId} must be greater than existing maximum building ID ${maximumId}`,
    );
  }

  return {
    version: input.version,
    nextBuildingId: input.nextBuildingId,
    buildings,
  };
}

export function findBuildingAt(
  state: BuildingState,
  x: number,
  y: number,
): Building | undefined {
  return state.buildings.find((building) => building.x === x && building.y === y);
}
