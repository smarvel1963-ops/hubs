// storage-target.js - C:\MarvelApps\photohub\www\js\backup\storage-target.js
// The StorageTarget interface: where backed-up photos go (Backblaze B2 later, a local fake in tests).
//
//   put(key, bytes, meta)  -> Promise<void>     store bytes under key. meta = { sha256, size, contentType }.
//                                               The engine NEVER trusts put() alone: it always calls head()
//                                               afterwards and compares size + SHA-256 before a photo counts
//                                               as backed up.
//   head(key)              -> Promise<{ key, size, sha256 } | null>
//                                               what the cloud really holds under key (null = nothing).
//                                               A real target must report what the SERVER has, not echo meta.
//   list(prefix)           -> Promise<Array<{ key, size, sha256 }>>
//   ready()   (optional)   -> Promise<void>     throws NotSetUpError while the cloud is not configured.
//
// THERE IS NO delete() ON PURPOSE. Phase 1 must never delete anything, anywhere. Removing photos (from the
// phone or the cloud) is a later, separate, user-confirmed feature that comes after the never-lose-a-photo tests.

export const STORAGE_TARGET_METHODS = Object.freeze(['put', 'head', 'list']);

export class NotSetUpError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotSetUpError';
    this.code = 'not_set_up';
  }
}

export function isNotSetUpError(err) {
  return !!err && (err.code === 'not_set_up' || err.name === 'NotSetUpError');
}

export function assertStorageTarget(target) {
  if (!target || typeof target !== 'object') throw new TypeError('A StorageTarget object is required');
  for (const m of STORAGE_TARGET_METHODS) {
    if (typeof target[m] !== 'function') throw new TypeError(`StorageTarget is missing ${m}()`);
  }
  return target;
}
