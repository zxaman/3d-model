/**
 * Collision-resistant ids. `crypto.randomUUID` everywhere it exists, with a
 * compact fallback for non-secure contexts (e.g. the app served over plain HTTP
 * on a LAN address, where `crypto.randomUUID` is unavailable).
 */
export function createId(): string {
  const cryptoObj = globalThis.crypto;

  if (typeof cryptoObj?.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof cryptoObj?.getRandomValues === 'function') {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
