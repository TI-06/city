import { describe, expect, it } from 'vitest';
import {
  SAVE_BUDGET_10_YEAR_BYTES,
  SAVE_BUDGET_50_YEAR_BYTES,
  SAVE_BUDGET_STARTER_BYTES,
  assertSaveWithinBudget,
} from '../../../src/persistence/save/save-budget';
import type { SaveEnvelope } from '../../../src/persistence/save/save-envelope';
import {
  AUTOSAVE_GENERATIONS,
  MANUAL_SAVE_SLOTS,
} from '../../../src/persistence/slots/save-slot-policy';
import { measureJsonBytes } from '../../../src/shared/serialization/measure-json-bytes';

type FixtureState = {
  cityName: string;
  roads: string[];
};

function makeSave(state: FixtureState): SaveEnvelope<FixtureState> {
  return {
    saveVersion: 1,
    revision: 7,
    savedAtIso: '2026-09-24T00:00:00.000Z',
    state,
  };
}

describe('save architecture budgets', () => {
  it('keeps the fixed project budgets explicit', () => {
    expect(SAVE_BUDGET_STARTER_BYTES).toBe(2 * 1024 * 1024);
    expect(SAVE_BUDGET_10_YEAR_BYTES).toBe(5 * 1024 * 1024);
    expect(SAVE_BUDGET_50_YEAR_BYTES).toBe(15 * 1024 * 1024);
  });

  it('uses bounded save generations', () => {
    expect(AUTOSAVE_GENERATIONS).toBe(3);
    expect(MANUAL_SAVE_SLOTS).toBe(3);
  });

  it('does not grow the save when external command history grows', () => {
    const save = makeSave({ cityName: 'テスト市', roads: ['r1'] });
    const before = measureJsonBytes(save);

    const commandHistory = Array.from({ length: 100_000 }, (_, index) => ({
      commandId: `cmd-${index}`,
      response: { revision: index },
    }));

    expect(commandHistory).toHaveLength(100_000);
    expect(measureJsonBytes(save)).toBe(before);
  });

  it('rejects a save that exceeds an explicit budget', () => {
    const save = makeSave({ cityName: 'x'.repeat(4096), roads: [] });

    expect(() => assertSaveWithinBudget(save, 1024)).toThrow(/save budget/i);
  });
});
