import { createEconomyState, type EconomyState } from '../../simulation/economy/economy-state';

export const ECONOMY_CODEC_VERSION = 1;

export type EncodedEconomyState = Readonly<{
  codecVersion: typeof ECONOMY_CODEC_VERSION;
  values: readonly [version: number, treasury: number];
}>;

export function encodeEconomyState(state: EconomyState): EncodedEconomyState {
  const validated = createEconomyState(state);

  return {
    codecVersion: ECONOMY_CODEC_VERSION,
    values: [validated.version, validated.treasury],
  };
}

export function decodeEconomyState(saved: EncodedEconomyState): EconomyState {
  if (saved.codecVersion !== ECONOMY_CODEC_VERSION) {
    throw new RangeError('Unsupported economy codec version; expected 1');
  }

  const tuple: unknown = saved.values;
  if (!Array.isArray(tuple) || tuple.length !== 2) {
    throw new RangeError('Economy tuple must contain exactly 2 values');
  }

  const values = tuple as readonly unknown[];
  const version = values[0];
  const treasury = values[1];

  if (typeof version !== 'number' || typeof treasury !== 'number') {
    throw new RangeError('Economy tuple values must be numbers');
  }

  return createEconomyState({
    version,
    treasury,
  });
}
