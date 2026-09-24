const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function encodeBytesBase64(bytes: Uint8Array): string {
  let binary = '';

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]!);
  }

  return btoa(binary);
}

export function decodeBytesBase64(encoded: string): Uint8Array {
  if (!BASE64_PATTERN.test(encoded)) {
    throw new RangeError('Invalid Base64 byte payload');
  }

  let binary: string;
  try {
    binary = atob(encoded);
  } catch {
    throw new RangeError('Invalid Base64 byte payload');
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
