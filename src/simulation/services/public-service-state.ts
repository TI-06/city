export type PublicServiceKind = 'park' | 'school' | 'fire' | 'police' | 'hospital';

export type PublicService = Readonly<{
  id: number;
  x: number;
  y: number;
  kind: PublicServiceKind;
}>;

export type PublicServiceState = Readonly<{
  version: number;
  nextServiceId: number;
  services: readonly PublicService[];
}>;

export type PublicServiceStateInput = Readonly<{
  version: number;
  nextServiceId: number;
  services: readonly PublicService[];
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

export function isPublicServiceKind(value: string): value is PublicServiceKind {
  return (
    value === 'park' ||
    value === 'school' ||
    value === 'fire' ||
    value === 'police' ||
    value === 'hospital'
  );
}

function coordinateKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function createEmptyPublicServiceState(): PublicServiceState {
  return {
    version: 0,
    nextServiceId: 1,
    services: [],
  };
}

export function createPublicServiceState(input: PublicServiceStateInput): PublicServiceState {
  assertNonNegativeSafeInteger(input.version, 'Public service version');
  assertPositiveSafeInteger(input.nextServiceId, 'Next service ID');

  const ids = new Set<number>();
  const coordinates = new Set<string>();
  let maximumId = 0;

  const services = input.services.map((service) => {
    assertPositiveSafeInteger(service.id, 'Public service ID');

    if (!Number.isSafeInteger(service.x) || !Number.isSafeInteger(service.y)) {
      throw new RangeError('Public service coordinate must use safe integers');
    }

    if (ids.has(service.id)) {
      throw new RangeError(`Duplicate public service ID: ${service.id}`);
    }
    ids.add(service.id);

    const key = coordinateKey(service.x, service.y);
    if (coordinates.has(key)) {
      throw new RangeError(`Duplicate public service coordinate: ${key}`);
    }
    coordinates.add(key);

    if (!isPublicServiceKind(service.kind)) {
      throw new RangeError('Public service kind is invalid');
    }

    maximumId = Math.max(maximumId, service.id);
    return {
      id: service.id,
      x: service.x,
      y: service.y,
      kind: service.kind,
    } satisfies PublicService;
  });

  if (input.nextServiceId <= maximumId) {
    throw new RangeError(
      `Next service ID ${input.nextServiceId} must be greater than existing maximum service ID ${maximumId}`,
    );
  }

  return {
    version: input.version,
    nextServiceId: input.nextServiceId,
    services,
  };
}

export function findPublicServiceAt(
  state: PublicServiceState,
  x: number,
  y: number,
): PublicService | undefined {
  return state.services.find((service) => service.x === x && service.y === y);
}
