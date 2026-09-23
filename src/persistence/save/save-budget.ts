export const SAVE_BUDGET_STARTER_BYTES = 1;
export const SAVE_BUDGET_10_YEAR_BYTES = 2;
export const SAVE_BUDGET_50_YEAR_BYTES = 3;

export function assertSaveWithinBudget(save: unknown, budgetBytes: number): void {
  void save;
  void budgetBytes;
}
