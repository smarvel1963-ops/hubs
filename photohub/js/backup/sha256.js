// sha256.js - C:\MarvelApps\photohub\www\js\backup\sha256.js
// SHA-256 of a byte array, as lowercase hex. Uses the Web Crypto API, which exists both in the
// app's WebView (http://localhost is a secure context) and in Node 18+ (the tests).
// Phase 1 note: the engine hashes bytes it holds in memory. Big videos will be hashed natively in
// chunks (Java MessageDigest) once the native upload worker exists - see README "Real vs placeholder".

export function toBytes(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (typeof data === 'string') return new TextEncoder().encode(data);
  throw new TypeError('Expected bytes (Uint8Array / ArrayBuffer / string)');
}

export async function sha256Hex(data) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) throw new Error('Web Crypto (crypto.subtle) is not available here');
  const digest = await subtle.digest('SHA-256', toBytes(data));
  const view = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < view.length; i++) hex += view[i].toString(16).padStart(2, '0');
  return hex;
}
