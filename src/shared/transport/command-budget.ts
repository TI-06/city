export const ORDINARY_COMMAND_TARGET_BYTES = 1;
export const ORDINARY_COMMAND_HARD_LIMIT_BYTES = 2;
export const ORDINARY_RESPONSE_TARGET_BYTES = 3;

export function assertOrdinaryCommandSize(command: unknown): void {
  void command;
}
