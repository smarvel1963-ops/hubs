// cloud-target.js - C:\MarvelApps\photohub\www\js\backup\cloud-target.js
// The REAL StorageTarget (11/22): Photo Hub's backup service on Cloudflare (cloud/src/index.js), which stores in Backblaze B2 US East.
// Replaces the b2-target.js stub. The phone never holds a storage key - it sends the person's sign-in token and the service puts the
// photo in that person's own folder.
//   head(key)  -> what the SERVICE holds: it named the file after the SHA-256 it checked on the way in, and reports the stored size.
//   put(...)   -> sends the bytes with their SHA-1 (the storage checks it) and the service checks the SHA-256. The engine still calls
//                 head() afterwards before a photo counts as backed up.
//   list()     -> the person's backed-up photos.
// Still no delete() - see storage-target.js.

import { NotSetUpError } from './storage-target.js';
import { toBytes } from './sha256.js';

export const CLOUD_URL = 'https://photohub-cloud.photohub-cloud.workers.dev';
const base = () => globalThis.PH_CLOUD_URL || CLOUD_URL;   // tests point this at the service running on the PC

/** 11/22 PC links: a signed-in call to the service (used by the Cloud page's "Keep a copy on my PC"). Throws with the service's words. */
export async function cloudCall(account, path, init = {}) {
  const tok = await account.token().catch(() => '');
  if (!tok) throw new Error('Sign in first');
  const r = await globalThis.fetch(base() + path, { ...init, headers: { ...(init.headers || {}), Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `The cloud answered ${r.status}`);
  return j;
}

export function shaFromKey(key) {
  const s = String(key).split('/').pop();
  if (!/^[0-9a-f]{64}$/.test(s)) throw new Error('Not a photo key: ' + key);
  return s;
}

async function sha1Hex(bytes) {
  const d = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-1', bytes));
  let h = '';
  for (let i = 0; i < d.length; i++) h += d[i].toString(16).padStart(2, '0');
  return h;
}

function codeError(code, message) { const e = new Error(message); e.code = code; return e; }

export class CloudTarget {
  /** @param {{ token(forceRefresh?: boolean): Promise<string> }} account */
  constructor(account, fetchImpl = null) {
    this.name = 'Photo Hub Cloud';
    this._account = account;
    this._fetch = fetchImpl || ((...a) => globalThis.fetch(...a));
    this.me = null;
  }

  async _call(path, init = {}, retried = false) {
    const tok = await this._account.token(retried).catch(() => '');
    if (!tok) throw new NotSetUpError('Sign in to back up your photos');
    let r;
    try {
      r = await this._fetch(base() + path, { ...init, headers: { ...(init.headers || {}), Authorization: 'Bearer ' + tok } });
    } catch (e) {
      throw codeError('offline', 'Could not reach the cloud - check the connection');
    }
    if (r.status === 401 && !retried) return this._call(path, init, true);   // an old token: ask for a fresh one once
    if (r.status === 401) throw new NotSetUpError('Please sign in again');
    if (r.status === 403) {
      const j = await r.json().catch(() => ({}));
      throw new NotSetUpError(j.error || 'Cloud backup is not open to this account yet');
    }
    return r;
  }

  /** Throws NotSetUpError until someone signed in is allowed to back up. Keeps the account's cloud numbers in this.me. */
  async ready() {
    const r = await this._call('/v1/me');
    if (!r.ok) throw codeError('cloud_error', `The cloud answered ${r.status}`);
    this.me = await r.json();
    return this.me;
  }

  async head(key) {
    const sha = shaFromKey(key);
    const r = await this._call('/v1/photos/' + sha, { method: 'HEAD' });
    if (r.status === 404) return null;
    if (!r.ok) throw codeError('cloud_error', `The cloud answered ${r.status}`);
    const size = Number(r.headers.get('X-PH-Size'));
    return { key, size: Number.isFinite(size) ? size : null, sha256: sha };
  }

  async put(key, data, meta = {}) {
    const sha = shaFromKey(key);
    if (meta.sha256 && meta.sha256 !== sha) throw new Error('Key and SHA-256 disagree');
    const bytes = toBytes(data);
    const headers = { 'Content-Type': meta.contentType || 'application/octet-stream', 'X-PH-SHA1': await sha1Hex(bytes) };
    if (Number.isFinite(meta.date)) headers['X-PH-Date'] = String(Math.round(meta.date));
    if (meta.name) headers['X-PH-Name'] = encodeURIComponent(String(meta.name)).slice(0, 360);
    const r = await this._call('/v1/photos/' + sha, { method: 'PUT', body: bytes, headers });
    if (r.ok) return r.json();
    const j = await r.json().catch(() => ({}));
    if (r.status === 413) throw codeError('too_big', j.error || 'This file is too big for cloud backup right now');
    if (r.status === 422) throw codeError('damaged', j.error || 'The photo arrived damaged - it will be tried again');
    throw codeError('cloud_error', j.error || `The cloud answered ${r.status}`);
  }

  async list() {
    const out = [];
    let cursor = '';
    for (let i = 0; i < 200; i++) {
      const r = await this._call('/v1/photos' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
      if (!r.ok) throw codeError('cloud_error', `The cloud answered ${r.status}`);
      const j = await r.json();
      for (const it of j.items || []) out.push({ key: it.sha256, size: it.size, sha256: it.sha256, date: it.date, name: it.name });
      if (!j.next) break;
      cursor = j.next;
    }
    return out;
  }
}
