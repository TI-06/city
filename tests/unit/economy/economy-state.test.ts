import { describe, expect, it } from 'vitest';
import {
  INITIAL_TREASURY,
  applyTreasuryDelta,
  createDefaultEconomyState,
  createEconomyState,
  spendTreasury,
} from '../../../src/simulation/economy/economy-state';

describe('economy state', () => {
  it('creates the default compact treasury state', () => {
    expect(createDefaultEconomyState()).toEqual({
      version: 0,
      treasury: INITIAL_TREASURY,
    });
    expect(INITIAL_TREASURY).toBe(1_000_000);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid economy version %s',
    (version) => {
      expect(() => createEconomyState({ version, treasury: 0 })).toThrow(/economy version/i);
    },
  );

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects unsafe treasury value %s',
    (treasury) => {
      expect(() => createEconomyState({ version: 0, treasury })).toThrow(/treasury.*safe integer/i);
    },
  );

  it('allows negative treasury for operating deficits', () => {
    expect(createEconomyState({ version: 2, treasury: -500 })).toEqual({
      version: 2,
      treasury: -500,
    });
  });

  it('applies positive and negative treasury deltas with version increments', () => {
    const base = createEconomyState({ version: 3, treasury: 1000 });

    expect(applyTreasuryDelta(base, 250)).toEqual({
      version: 4,
      treasury: 1250,
    });
    expect(applyTreasuryDelta(base, -1250)).toEqual({
      version: 4,
      treasury: -250,
    });
  });

  it('preserves object identity for a zero treasury delta', () => {
    const state = createEconomyState({ version: 3, treasury: 1000 });
    expect(applyTreasuryDelta(state, 0)).toBe(state);
  });

  it('rejects treasury overflow', () => {
    const state = createEconomyState({
      version: 0,
      treasury: Number.MAX_SAFE_INTEGER,
    });

    expect(() => applyTreasuryDelta(state, 1)).toThrow(/safe integer/i);
  });

  it('spends available treasury atomically', () => {
    const state = createEconomyState({ version: 4, treasury: 500 });

    expect(spendTreasury(state, 200)).toEqual({
      version: 5,
      treasury: 300,
    });
  });

  it('preserves object identity for zero construction spend', () => {
    const state = createEconomyState({ version: 4, treasury: 500 });
    expect(spendTreasury(state, 0)).toBe(state);
  });

  it('rejects insufficient funds without producing a new state', () => {
    const state = createEconomyState({ version: 4, treasury: 199 });
    expect(() => spendTreasury(state, 200)).toThrow(/insufficient.*fund/i);
    expect(state).toEqual({ version: 4, treasury: 199 });
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid spend cost %s',
    (cost) => {
      const state = createEconomyState({ version: 0, treasury: 1000 });
      expect(() => spendTreasury(state, cost)).toThrow(/cost.*non-negative safe integer/i);
    },
  );
});
