// idb-store.js - C:\MarvelApps\photohub\www\js\backup\idb-store.js
// The backup journal in IndexedDB (11/22). localStorage holds about 5 MB, and a phone with 20,000 photos needs a journal bigger than
// that. Same contract as state-store.js: the whole journal is written as one JSON string on every save, so a crash leaves exactly what
// was last saved. Falls back to localStorage when IndexedDB is not there.

import { LocalStorageStateStore } from './state-store.js';

// One journal PER SIGNED-IN PERSON (key 'state:<uid>'): a photo backed up to one account is not "done" for another account.
// (The old localStorage journal from before the cloud existed never uploaded anything, so nothing is carried over from it.)
const DB = 'photohub-backup', STORE = 'journal';

function open() {
  return new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
}

export class IndexedDBStateStore {
  constructor(uid = 'nobody') { this._key = 'state:' + uid; this._db = null; this._fallback = null; }
  async _get() {
    if (this._db || this._fallback) return this._db;
    try { this._db = await open(); } catch (e) { this._fallback = new LocalStorageStateStore('photohub.backup.' + this._key); }
    return this._db;
  }
  async load() {
    const db = await this._get();
    if (!db) return this._fallback.load();
    const raw = await new Promise((ok, no) => { const q = db.transaction(STORE).objectStore(STORE).get(this._key); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); });
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  async save(state) {
    const db = await this._get();
    if (!db) return this._fallback.save(state);
    const raw = JSON.stringify(state);
    await new Promise((ok, no) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).put(raw, this._key);
      t.oncomplete = () => ok();
      t.onerror = () => no(t.error);
      t.onabort = () => no(t.error);
    });
  }
}
