import { describe, expect, it } from 'vitest';
import {
  SAVE_BUDGET_10_YEAR_BYTES,
  SAVE_BUDGET_50_YEAR_BYTES,
  SAVE_BUDGET_STARTER_BYTES,
} from '../../src/persistence/save/save-budget';
import { AUTOSAVE_GENERATIONS } from '../../src/persistence/slots/save-slot-policy';
import { ORDINARY_COMMAND_HARD_LIMIT_BYTES } from '../../src/shared/transport/command-budget';

describe('foundation architecture invariants', () => {
  it('keeps all size limits finite and positive', () => {
    for (const value of [
      ORDINARY_COMMAND_HARD_LIMIT_BYTES,
      SAVE_BUDGET_STARTER_BYTES,
      SAVE_BUDGET_10_YEAR_BYTES,
      SAVE_BUDGET_50_YEAR_BYTES,
      AUTOSAVE_GENERATIONS,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
  });

  it('orders save budgets by expected city maturity', () => {
    expect(SAVE_BUDGET_STARTER_BYTES).toBeLessThan(SAVE_BUDGET_10_YEAR_BYTES);
    expect(SAVE_BUDGET_10_YEAR_BYTES).toBeLessThan(SAVE_BUDGET_50_YEAR_BYTES);
  });
});
