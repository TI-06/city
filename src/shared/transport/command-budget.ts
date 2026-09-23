import { measureJsonBytes } from '../serialization/measure-json-bytes';

export const ORDINARY_COMMAND_TARGET_BYTES = 64 * 1024;
export const ORDINARY_COMMAND_HARD_LIMIT_BYTES = 256 * 1024;
export const ORDINARY_RESPONSE_TARGET_BYTES = 128 * 1024;

export function assertOrdinaryCommandSize(command: unknown): void {
  const bytes = measureJsonBytes(command);

  if (bytes > ORDINARY_COMMAND_HARD_LIMIT_BYTES) {
    throw new RangeError(
      `Command is ${bytes} bytes and exceeds ordinary command hard limit of ${ORDINARY_COMMAND_HARD_LIMIT_BYTES} bytes`,
    );
  }
}

export function assertOrdinaryResponseSize(response: unknown): void {
  const bytes = measureJsonBytes(response);

  if (bytes > ORDINARY_RESPONSE_TARGET_BYTES) {
    throw new RangeError(
      `Response is ${bytes} bytes and exceeds ordinary response target of ${ORDINARY_RESPONSE_TARGET_BYTES} bytes`,
    );
  }
}
