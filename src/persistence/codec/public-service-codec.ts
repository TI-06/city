import {
  createPublicServiceState,
  type PublicService,
  type PublicServiceKind,
  type PublicServiceState,
} from '../../simulation/services/public-service-state';

export const PUBLIC_SERVICE_CODEC_VERSION = 1;

type PublicServiceKindCode = 1 | 2 | 3 | 4 | 5;

export type EncodedPublicServiceState = Readonly<{
  codecVersion: typeof PUBLIC_SERVICE_CODEC_VERSION;
  meta: readonly [version: number, nextServiceId: number];
  services: readonly (readonly [
    id: number,
    x: number,
    y: number,
    kindCode: PublicServiceKindCode,
  ])[];
}>;

function encodeKind(kind: PublicServiceKind): PublicServiceKindCode {
  switch (kind) {
    case 'park':
      return 1;
    case 'school':
      return 2;
    case 'fire':
      return 3;
    case 'police':
      return 4;
    case 'hospital':
      return 5;
  }
}

function decodeKind(value: unknown): PublicServiceKind {
  switch (value) {
    case 1:
      return 'park';
    case 2:
      return 'school';
    case 3:
      return 'fire';
    case 4:
      return 'police';
    case 5:
      return 'hospital';
    default:
      throw new RangeError('Public service kind code must be between 1 and 5');
  }
}

function decodeServiceTuple(tuple: unknown, index: number): PublicService {
  if (!Array.isArray(tuple) || tuple.length !== 4) {
    throw new RangeError(
      `Public service tuple at index ${index} must contain exactly 4 values`,
    );
  }

  const values = tuple as readonly unknown[];
  const id = values[0];
  const x = values[1];
  const y = values[2];
  const kindCode = values[3];

  if (typeof id !== 'number' || typeof x !== 'number' || typeof y !== 'number') {
    throw new RangeError(
      `Public service tuple at index ${index} requires numeric id, x, and y`,
    );
  }

  return {
    id,
    x,
    y,
    kind: decodeKind(kindCode),
  };
}

export function encodePublicServiceState(
  state: PublicServiceState,
): EncodedPublicServiceState {
  const validated = createPublicServiceState(state);

  return {
    codecVersion: PUBLIC_SERVICE_CODEC_VERSION,
    meta: [validated.version, validated.nextServiceId],
    services: validated.services.map(
      (service) => [service.id, service.x, service.y, encodeKind(service.kind)] as const,
    ),
  };
}

export function decodePublicServiceState(
  saved: EncodedPublicServiceState,
): PublicServiceState {
  if (saved.codecVersion !== PUBLIC_SERVICE_CODEC_VERSION) {
    throw new RangeError('Unsupported public service codec version; expected 1');
  }

  const meta: unknown = saved.meta;
  if (!Array.isArray(meta) || meta.length !== 2) {
    throw new RangeError('Public service metadata tuple must contain exactly 2 values');
  }

  const values = meta as readonly unknown[];
  const version = values[0];
  const nextServiceId = values[1];

  if (typeof version !== 'number' || typeof nextServiceId !== 'number') {
    throw new RangeError('Public service metadata tuple values must be numbers');
  }

  return createPublicServiceState({
    version,
    nextServiceId,
    services: saved.services.map((tuple, index) => decodeServiceTuple(tuple, index)),
  });
}
