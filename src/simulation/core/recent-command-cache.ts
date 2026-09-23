export const DEFAULT_RECENT_COMMAND_LIMIT = 256;

function assertPositiveInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError('Recent command cache limit must be a positive integer');
  }
}

export class RecentCommandCache<TValue> {
  private readonly entries = new Map<string, TValue>();

  public constructor(private readonly limit = DEFAULT_RECENT_COMMAND_LIMIT) {
    assertPositiveInteger(limit);
  }

  public get size(): number {
    return this.entries.size;
  }

  public get(commandId: string): TValue | undefined {
    return this.entries.get(commandId);
  }

  public set(commandId: string, value: TValue): void {
    if (this.entries.has(commandId)) {
      this.entries.delete(commandId);
    }

    this.entries.set(commandId, value);

    while (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}
