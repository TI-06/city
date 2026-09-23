export function measureJsonBytes(value: unknown): number {
  return JSON.stringify(value).length;
}
