import { measureJsonBytes } from '../../shared/serialization/measure-json-bytes';

export const SAVE_BUDGET_STARTER_BYTES = 2 * 1024 * 1024;
export const SAVE_BUDGET_10_YEAR_BYTES = 5 * 1024 * 1024;
export const SAVE_BUDGET_50_YEAR_BYTES = 15 * 1024 * 1024;

export function assertSaveWithinBudget(save: unknown, budgetBytes: number): void {
  const bytes = measureJsonBytes(save);

  if (bytes > budgetBytes) {
    throw new RangeError(
      `Save is ${bytes} bytes and exceeds save budget of ${budgetBytes} bytes`,
    );
  }
}
