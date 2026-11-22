// state-store.js - C:\MarvelApps\photohub\www\js\backup\state-store.js
// Where the backup engine keeps its journal (which photo is queued / uploading / backed up).
// Both stores serialize to a JSON string on every save, like writing a file, so a "crash" (dropping the
// engine object) leaves exactly what was last saved - that is what the resume tests rely on.
//
//   MemoryStateStore        - tests (and a fallback when the WebView has no storage).
//   LocalStorageStateStore  - the app in Phase 1. Later this moves to native storage (SQLite) so the
//                             Android background worker can read it too.

export class MemoryStateStore {
  constructor(initialJson = null) {
    this._disk = initialJson;
    this.saveCount = 0;
  }
  async load() {
    return this._disk ? JSON.parse(this._disk) : null;
  }
  async save(state) {
    this._disk = JSON.stringify(state);
    this.saveCount++;
  }
  /** Test helper: what is "on disk" right now. */
  peek() {
    return this._disk ? JSON.parse(this._disk) : null;
  }
}

export class LocalStorageStateStore {
  constructor(key = 'photohub.backup.v1', storage = null) {
    this._key = key;
    this._storage = storage || safeLocalStorage();
  }
  async load() {
    if (!this._storage) return null;
    const raw = this._storage.getItem(this._key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      // A damaged journal is kept aside (never thrown away) and the engine starts a fresh one.
      try { this._storage.setItem(`${this._key}.damaged.${Date.now()}`, raw); } catch (_) { /* full */ }
      return null;
    }
  }
  async save(state) {
    if (!this._storage) throw new Error('No storage available to save the backup journal');
    this._storage.setItem(this._key, JSON.stringify(state));
  }
}

function safeLocalStorage() {
  try {
    return globalThis.localStorage || null;
  } catch (e) {
    return null;
  }
}
