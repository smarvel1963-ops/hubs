// backup-engine.js - C:\MarvelApps\photohub\www\js\backup\backup-engine.js
// Photo Hub backup engine - Phase 1, LOGIC ONLY (no real cloud yet; B2Target is a stub).
//
// What it does, per photo:
//   queue -> mark "uploading" in the journal -> read bytes -> SHA-256 -> already in the cloud with the same
//   size + SHA-256? (duplicate / uploaded before a crash) -> else put() -> head() and VERIFY size + SHA-256
//   -> only then "backed_up". Anything that fails is retried with a back-off; after maxAttempts it is left
//   as "failed" + needsAttention (never silently dropped, never marked done).
//
// Rules it keeps:
//   - VERIFY BEFORE DONE: put() succeeding is not enough; head() must show the same size and SHA-256.
//   - RESUME AFTER A CRASH: the journal is saved before every upload; init() turns a photo left in
//     "uploading" back into "queued", and the next run finishes it (re-using a complete cloud copy if
//     one is already there, re-uploading a partial one).
//   - UPLOAD ONCE: cloud keys are content addressed (photos/sha256/..), so the same picture under two ids,
//     or seen twice, is uploaded one time.
//   - WI-FI ONLY is respected before every photo (backup stops if Wi-Fi drops mid-queue).
//   - FAVORITES are backed up AND flagged keepOnDevice.
//   - NEVER DELETES ANYTHING. There is no delete in this file, in the StorageTarget interface, or in the
//     photo source. "Free Up Phone Space" is not built in this phase.

import { sha256Hex, toBytes } from './sha256.js';
import { assertStorageTarget, isNotSetUpError } from './storage-target.js';

export const STATUS = Object.freeze({
  QUEUED: 'queued',
  UPLOADING: 'uploading',
  BACKED_UP: 'backed_up',
  FAILED: 'failed',
});

export const SKIP = Object.freeze({
  BACKUP_OFF: 'backup_off',
  OFFLINE: 'offline',
  WAITING_FOR_WIFI: 'waiting_for_wifi',
  CLOUD_NOT_SET_UP: 'cloud_not_set_up',
  CLOUD_UNREACHABLE: 'cloud_unreachable',
  BUSY: 'busy',
});

export const STATE_VERSION = 1;
export const DEFAULT_MAX_ATTEMPTS = 5;
export const DEFAULT_RETRY_DELAYS_MS = Object.freeze([5000, 30000, 120000, 600000]);

export const DEFAULT_ENGINE_SETTINGS = Object.freeze({
  backupEnabled: false,
  wifiOnly: true,
  keepFavoritesOnDevice: true,
});

export function remoteKeyFor(sha256) {
  return `photos/sha256/${sha256.slice(0, 2)}/${sha256}`;
}

export class VerifyError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = 'VerifyError';
    this.code = 'verify_failed';
    this.detail = detail || null;
  }
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function matches(remote, size, sha256) {
  return !!remote && remote.size === size && remote.sha256 === sha256;
}

function normalizeNetwork(n) {
  if (!n) return { connected: false, type: 'none' };
  const type = n.type || n.connectionType || 'unknown';
  const connected = n.connected !== undefined ? !!n.connected : type !== 'none';
  return { connected, type };
}

function emptyReport() {
  return { skipped: null, reason: null, stoppedEarly: null, attempted: 0, backedUp: 0, uploaded: 0, deduped: 0, failed: 0 };
}

function copy(obj) {
  return obj == null ? obj : JSON.parse(JSON.stringify(obj));
}

function photoSnapshot(p) {
  return {
    id: String(p.id),
    mime: p.mime || null,
    size: Number.isFinite(p.size) ? p.size : null,
    date: Number.isFinite(p.date) ? p.date : null,
    dateModified: Number.isFinite(p.dateModified) ? p.dateModified : null,
    name: p.name || null,
  };
}

function newRecord(p, now) {
  return {
    id: String(p.id),
    photo: photoSnapshot(p),
    favorite: !!p.favorite,
    status: STATUS.QUEUED,
    queuedAt: now,
    attempts: 0,
    uploads: 0,
    nextTryAt: 0,
    lastTryAt: null,
    lastError: null,
    needsAttention: false,
    sha256: null,
    size: null,
    remoteKey: null,
    verifiedAt: null,
    dedupedFrom: null,
    resumedAfterCrash: 0,
    previousVersions: [],
  };
}

function normalizeState(saved) {
  if (!saved || typeof saved !== 'object' || saved.version !== STATE_VERSION || typeof saved.records !== 'object') {
    return { version: STATE_VERSION, records: {}, order: [] };
  }
  const order = Array.isArray(saved.order) ? saved.order.filter((id) => saved.records[id]) : Object.keys(saved.records);
  return { version: STATE_VERSION, records: saved.records, order };
}

export class BackupEngine {
  /**
   * @param {object} o
   * @param {{read(photo): Promise<Uint8Array|ArrayBuffer|string>}} o.source  where photo bytes come from
   * @param {object} o.target       a StorageTarget (see storage-target.js)
   * @param {{load(): Promise<object|null>, save(state): Promise<void>}} o.store  the journal
   * @param {() => object} [o.getSettings]  -> { backupEnabled, wifiOnly, keepFavoritesOnDevice }
   * @param {() => object} [o.getNetwork]   -> { connected, type: 'wifi'|'cellular'|'none'|'unknown' }
   */
  constructor({
    source,
    target,
    store,
    getSettings = () => DEFAULT_ENGINE_SETTINGS,
    getNetwork = () => ({ connected: false, type: 'none' }),
    now = () => Date.now(),
    sleep = defaultSleep,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
    onEvent = null,
  } = {}) {
    if (!source || typeof source.read !== 'function') throw new TypeError('BackupEngine needs a photo source with read(photo)');
    assertStorageTarget(target);
    if (!store || typeof store.load !== 'function' || typeof store.save !== 'function') {
      throw new TypeError('BackupEngine needs a state store with load() and save()');
    }
    this._source = source;
    this._target = target;
    this._store = store;
    this._getSettings = getSettings;
    this._getNetwork = getNetwork;
    this._now = now;
    this._sleep = sleep;
    this._maxAttempts = Math.max(1, maxAttempts | 0);
    this._retryDelays = retryDelaysMs.length ? retryDelaysMs.slice() : [0];
    this._onEvent = typeof onEvent === 'function' ? onEvent : null;
    this._state = null;
    this._running = false;
  }

  // ---------- lifecycle ----------

  /** Load the journal. A photo left "uploading" (app killed mid-upload) goes back in the queue. */
  async init() {
    const saved = await this._store.load();
    this._state = normalizeState(saved);
    let resumed = 0;
    for (const rec of Object.values(this._state.records)) {
      if (rec.status === STATUS.UPLOADING) {
        rec.status = STATUS.QUEUED;
        rec.nextTryAt = 0;
        rec.resumedAfterCrash = (rec.resumedAfterCrash || 0) + 1;
        resumed++;
      }
    }
    if (resumed) await this._persist();
    this._emit('init', { resumed });
    return { resumed, total: this._state.order.length };
  }

  _requireInit() {
    if (!this._state) throw new Error('Call init() before using the backup engine');
  }

  async _persist() {
    await this._store.save(this._state);
  }

  _emit(type, data) {
    if (this._onEvent) {
      try { this._onEvent(type, data); } catch (_) { /* a UI listener must never break a backup */ }
    }
  }

  _settings() {
    return { ...DEFAULT_ENGINE_SETTINGS, ...(this._getSettings() || {}) };
  }

  // ---------- queue ----------

  /**
   * Queue photos the engine has not seen (by id). Photos it already knows get their favorite flag refreshed.
   * A photo edited after it was backed up (newer dateModified) is queued again; the older cloud copy is KEPT.
   */
  async addPhotos(photos) {
    this._requireInit();
    let added = 0;
    let updated = 0;
    let requeued = 0;
    const now = this._now();
    for (const p of photos || []) {
      if (!p || p.id === undefined || p.id === null || String(p.id) === '') continue;
      const id = String(p.id);
      const rec = this._state.records[id];
      if (!rec) {
        this._state.records[id] = newRecord(p, now);
        this._state.order.push(id);
        added++;
        continue;
      }
      const fav = !!p.favorite;
      if (rec.favorite !== fav) {
        rec.favorite = fav;
        updated++;
      }
      const newMod = Number.isFinite(p.dateModified) ? p.dateModified : null;
      const oldMod = rec.photo.dateModified;
      if (rec.status === STATUS.BACKED_UP && newMod !== null && oldMod !== null && newMod > oldMod) {
        rec.previousVersions.push({ sha256: rec.sha256, size: rec.size, remoteKey: rec.remoteKey, verifiedAt: rec.verifiedAt });
        rec.photo = photoSnapshot(p);
        rec.status = STATUS.QUEUED;
        rec.attempts = 0;
        rec.nextTryAt = 0;
        rec.needsAttention = false;
        rec.verifiedAt = null;
        rec.dedupedFrom = null;
        requeued++;
      }
    }
    if (added || updated || requeued) await this._persist();
    this._emit('queued', { added, updated, requeued });
    return { added, updated, requeued };
  }

  async setFavorite(id, favorite) {
    this._requireInit();
    const rec = this._state.records[String(id)];
    if (!rec) return false;
    rec.favorite = !!favorite;
    await this._persist();
    return true;
  }

  // ---------- running ----------

  /** null when a backup may run right now, otherwise a SKIP reason. */
  whyNotRunning() {
    const s = this._settings();
    if (!s.backupEnabled) return SKIP.BACKUP_OFF;
    const n = normalizeNetwork(this._getNetwork());
    if (!n.connected) return SKIP.OFFLINE;
    if (s.wifiOnly !== false && n.type !== 'wifi') return SKIP.WAITING_FOR_WIFI;
    return null;
  }

  async checkTarget() {
    try {
      if (typeof this._target.ready === 'function') await this._target.ready();
      return { ready: true, reason: null, notSetUp: false };
    } catch (err) {
      return { ready: false, reason: (err && err.message) || String(err), notSetUp: isNotSetUpError(err) };
    }
  }

  _eligible() {
    const now = this._now();
    const out = [];
    for (const id of this._state.order) {
      const rec = this._state.records[id];
      if (!rec) continue;
      if (rec.status === STATUS.QUEUED) out.push(rec);
      else if (rec.status === STATUS.FAILED && !rec.needsAttention && rec.nextTryAt !== null && rec.nextTryAt <= now) out.push(rec);
    }
    return out;
  }

  /** One pass over everything that is due. Returns a report; never throws for a single photo's failure. */
  async runOnce() {
    this._requireInit();
    const rep = emptyReport();
    if (this._running) { rep.skipped = SKIP.BUSY; return rep; }
    const why = this.whyNotRunning();
    if (why) { rep.skipped = why; return rep; }
    const t = await this.checkTarget();
    if (!t.ready) {
      rep.skipped = t.notSetUp ? SKIP.CLOUD_NOT_SET_UP : SKIP.CLOUD_UNREACHABLE;
      rep.reason = t.reason;
      return rep;
    }
    this._running = true;
    try {
      for (const rec of this._eligible()) {
        const stop = this.whyNotRunning();
        if (stop) { rep.stoppedEarly = stop; break; }
        rep.attempted++;
        const outcome = await this._backupOne(rec);
        if (outcome === 'uploaded') { rep.uploaded++; rep.backedUp++; }
        else if (outcome === 'deduped') { rep.deduped++; rep.backedUp++; }
        else if (outcome === 'not_set_up') { rep.attempted--; rep.stoppedEarly = SKIP.CLOUD_NOT_SET_UP; break; }
        else rep.failed++;
      }
    } finally {
      this._running = false;
    }
    this._emit('run', copy(rep));
    return rep;
  }

  /** Keep running (waiting out retry back-offs) until nothing is due, a skip happens, or maxRounds. */
  async runUntilIdle({ maxRounds = 25 } = {}) {
    const total = emptyReport();
    for (let round = 0; round < maxRounds; round++) {
      const rep = await this.runOnce();
      for (const k of ['attempted', 'backedUp', 'uploaded', 'deduped', 'failed']) total[k] += rep[k];
      if (rep.skipped || rep.stoppedEarly) {
        total.skipped = rep.skipped;
        total.stoppedEarly = rep.stoppedEarly;
        total.reason = rep.reason;
        break;
      }
      const next = this._nextDueAt();
      if (next === null) break;
      const wait = next - this._now();
      if (wait > 0) await this._sleep(wait);
    }
    return total;
  }

  _nextDueAt() {
    let next = null;
    for (const rec of Object.values(this._state.records)) {
      let due = null;
      if (rec.status === STATUS.QUEUED) due = this._now();
      else if (rec.status === STATUS.FAILED && !rec.needsAttention && rec.nextTryAt !== null) due = rec.nextTryAt;
      if (due !== null && (next === null || due < next)) next = due;
    }
    return next;
  }

  _retryDelay(attempts) {
    const i = Math.min(Math.max(attempts - 1, 0), this._retryDelays.length - 1);
    return this._retryDelays[i];
  }

  _findTwin(rec) {
    for (const other of Object.values(this._state.records)) {
      if (other !== rec && other.status === STATUS.BACKED_UP && other.sha256 === rec.sha256) return other;
    }
    return null;
  }

  async _backupOne(rec) {
    rec.attempts += 1;
    rec.status = STATUS.UPLOADING;
    rec.lastTryAt = this._now();
    rec.lastError = null;
    await this._persist(); // journal first: if the app dies from here on, init() resumes this photo

    try {
      let bytes;
      try {
        bytes = toBytes(await this._source.read(rec.photo));
      } catch (e) {
        const err = new Error(`Could not read the photo on the phone: ${(e && e.message) || e}`);
        err.code = 'source_unreadable';
        throw err;
      }
      const size = bytes.byteLength;
      const sha256 = await sha256Hex(bytes);
      rec.size = size;
      rec.sha256 = sha256;
      const key = remoteKeyFor(sha256);

      let remote = await this._target.head(key);
      let uploaded = false;
      if (!matches(remote, size, sha256)) {
        // date + name ride along so the cloud copy keeps when it was taken and what it was called (11/22)
        await this._target.put(key, bytes, { sha256, size, contentType: rec.photo.mime || 'application/octet-stream', date: rec.photo.date, name: rec.photo.name });
        uploaded = true;
        rec.uploads += 1;
        remote = await this._target.head(key); // VERIFY - never trust put() on its own
      }
      if (!matches(remote, size, sha256)) {
        throw new VerifyError('The cloud copy did not match the photo (size or SHA-256)', {
          expected: { size, sha256 },
          got: remote ? { size: remote.size, sha256: remote.sha256 } : null,
        });
      }

      if (rec.priorSha256) {   // 0.6.0 re-read: keep a note of the copy without the location when the original differs
        if (rec.priorSha256 !== sha256) rec.previousVersions.push({ sha256: rec.priorSha256, size: rec.priorSize, remoteKey: remoteKeyFor(rec.priorSha256), verifiedAt: null, why: 'location_hidden' });
        delete rec.priorSha256;
        delete rec.priorSize;
      }
      rec.status = STATUS.BACKED_UP;
      rec.remoteKey = key;
      rec.verifiedAt = this._now();
      rec.lastError = null;
      rec.nextTryAt = 0;
      rec.needsAttention = false;
      if (!uploaded) {
        const twin = this._findTwin(rec);
        rec.dedupedFrom = twin ? twin.id : 'already_in_cloud';
      }
      await this._persist();
      this._emit('backed_up', { id: rec.id, uploaded });
      return uploaded ? 'uploaded' : 'deduped';
    } catch (err) {
      if (isNotSetUpError(err)) {
        // The cloud went away / was never configured: this is not the photo's fault, so no attempt is used up.
        rec.attempts -= 1;
        rec.status = STATUS.QUEUED;
        rec.lastError = err.message;
        await this._persist();
        return 'not_set_up';
      }
      rec.status = STATUS.FAILED;
      rec.lastError = `${(err && err.code) || 'error'}: ${(err && err.message) || err}`;
      if (rec.attempts >= this._maxAttempts) {
        rec.needsAttention = true;
        rec.nextTryAt = null;
      } else {
        rec.nextTryAt = this._now() + this._retryDelay(rec.attempts);
      }
      await this._persist();
      this._emit('failed', { id: rec.id, error: rec.lastError, needsAttention: rec.needsAttention });
      return 'failed';
    }
  }

  // ---------- reading state ----------

  keepOnDevice(id) {
    this._requireInit();
    const rec = this._state.records[String(id)];
    return !!rec && rec.favorite && this._settings().keepFavoritesOnDevice !== false;
  }

  /**
   * 0.6.0: photos backed up before Photo Hub could read the ORIGINAL files (Android blanked out where they were taken) are read
   * again, one time. A photo whose bytes are the same (it had no location to hide) is found already in the cloud - a read and a
   * check, no upload. One that changed goes up as the true original; the earlier copy is remembered in previousVersions (kept).
   */
  async requeueForOriginals() {
    this._requireInit();
    let n = 0;
    for (const id of this._state.order) {
      const rec = this._state.records[id];
      if (rec.status !== STATUS.BACKED_UP) continue;
      rec.priorSha256 = rec.sha256;
      rec.priorSize = rec.size;
      rec.status = STATUS.QUEUED;
      rec.attempts = 0;
      rec.nextTryAt = 0;
      rec.needsAttention = false;
      rec.verifiedAt = null;
      rec.dedupedFrom = null;
      n++;
    }
    if (n) await this._persist();
    this._emit('queued', { added: 0, updated: 0, requeued: n });
    return n;
  }

  isBackedUp(id) {
    this._requireInit();
    const rec = this._state.records[String(id)];
    return !!rec && rec.status === STATUS.BACKED_UP && !!rec.verifiedAt;
  }

  record(id) {
    this._requireInit();
    const rec = this._state.records[String(id)];
    return rec ? { ...copy(rec), keepOnDevice: this.keepOnDevice(id) } : null;
  }

  records() {
    this._requireInit();
    return this._state.order.map((id) => this.record(id));
  }

  summary() {
    this._requireInit();
    const out = { total: 0, queued: 0, uploading: 0, backedUp: 0, failed: 0, needsAttention: 0, keepOnDevice: 0, backedUpBytes: 0, rechecking: 0 };
    for (const id of this._state.order) {
      const rec = this._state.records[id];
      out.total++;
      if (rec.status === STATUS.QUEUED) out.queued++;
      else if (rec.status === STATUS.UPLOADING) out.uploading++;
      else if (rec.status === STATUS.BACKED_UP) { out.backedUp++; out.backedUpBytes += rec.size || 0; }
      else if (rec.status === STATUS.FAILED) out.failed++;
      if (rec.needsAttention) out.needsAttention++;
      if (rec.priorSha256) out.rechecking++;
      if (this.keepOnDevice(id)) out.keepOnDevice++;
    }
    return out;
  }
}
