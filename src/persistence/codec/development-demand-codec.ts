import {
  createDevelopmentDemandState,
  type DevelopmentDemandState,
} from '../../simulation/development/development-demand-state';

export const DEVELOPMENT_DEMAND_CODEC_VERSION = 1;

export type EncodedDevelopmentDemandState = Readonly<{
  codecVersion: typeof DEVELOPMENT_DEMAND_CODEC_VERSION;
  values: readonly [
    version: number,
    residential: number,
    commercial: number,
    industrial: number,
  ];
}>;

export function encodeDevelopmentDemandState(
  state: DevelopmentDemandState,
): EncodedDevelopmentDemandState {
  const validated = createDevelopmentDemandState(state);

  return {
    codecVersion: DEVELOPMENT_DEMAND_CODEC_VERSION,
    values: [
      validated.version,
      validated.residential,
      validated.commercial,
      validated.industrial,
    ],
  };
}

export function decodeDevelopmentDemandState(
  saved: EncodedDevelopmentDemandState,
): DevelopmentDemandState {
  if (saved.codecVersion !== DEVELOPMENT_DEMAND_CODEC_VERSION) {
    throw new RangeError('Unsupported development demand codec version; expected 1');
  }

  const tuple: unknown = saved.values;
  if (!Array.isArray(tuple) || tuple.length !== 4) {
    throw new RangeError('Development demand tuple must contain exactly 4 values');
  }

  const values = tuple as readonly unknown[];
  const version = values[0];
  const residential = values[1];
  const commercial = values[2];
  const industrial = values[3];

  if (
    typeof version !== 'number' ||
    typeof residential !== 'number' ||
    typeof commercial !== 'number' ||
    typeof industrial !== 'number'
  ) {
    throw new RangeError('Development demand tuple values must be numbers');
  }

  return createDevelopmentDemandState({
    version,
    residential,
    commercial,
    industrial,
  });
}
