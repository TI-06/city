export const INITIAL_TREASURY = 1_000_000;

export type EconomyState = Readonly<{
  version: number;
  treasury: number;
}>;

export type EconomyStateInput = Readonly<{
  version: number;
  treasury: number;
}>;

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
}

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer`);
  }
}

export function createEconomyState(input: EconomyStateInput): EconomyState {
  assertNonNegativeSafeInteger(input.version, 'Economy version');
  assertSafeInteger(input.treasury, 'Treasury');

  return {
    version: input.version,
    treasury: input.treasury,
  };
}

export function createDefaultEconomyState(): EconomyState {
  return createEconomyState({
    version: 0,
    treasury: INITIAL_TREASURY,
  });
}

export function applyTreasuryDelta(state: EconomyState, delta: number): EconomyState {
  assertSafeInteger(delta, 'Treasury delta');

  if (delta === 0) {
    return state;
  }

  const treasury = state.treasury + delta;
  assertSafeInteger(treasury, 'Treasury result');

  const version = state.version + 1;
  assertNonNegativeSafeInteger(version, 'Economy version');

  return {
    version,
    treasury,
  };
}

export function spendTreasury(state: EconomyState, cost: number): EconomyState {
  assertNonNegativeSafeInteger(cost, 'Treasury cost');

  if (cost === 0) {
    return state;
  }

  if (cost > state.treasury) {
    throw new RangeError(
      `Insufficient funds: treasury ${state.treasury} cannot cover cost ${cost}`,
    );
  }

  return applyTreasuryDelta(state, -cost);
}
