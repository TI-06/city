const encoder = new TextEncoder();

export function measureJsonBytes(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).byteLength;
}
