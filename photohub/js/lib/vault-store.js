// vault-store.js - C:\MarvelApps\photohub\www\js\lib\vault-store.js
// PRIVATE VAULT storage (Scott 11/22: "we also need private session that needs code to view for photo hub").
// Photos and videos put in the vault are SCRAMBLED with the person's code (AES-GCM 256, key made from the code with PBKDF2-SHA256,
// 250,000 rounds, a random salt) and kept only on this phone (IndexedDB). Nothing is uploaded; Marvel Corp never sees the code or the
// photos. Without the code nobody can open them - and a forgotten code can't be reset, only the whole vault erased.
// The key lives in memory only while the vault is open; lock() forgets it.

const DB = 'photohub-vault', VER = 1, ROUNDS = 250000, CHECK = 'photohub-vault-ok';
const LS_TRIES = 'photohub.vault.tries';
let key = null;

function db() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      if (!d.objectStoreNames.contains('items')) d.createObjectStore('items', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    let out;
    Promise.resolve(fn(t.objectStore(store))).then((v) => { out = v; });
    t.oncomplete = () => { d.close(); resolve(out); };
    t.onerror = () => { d.close(); reject(t.error); };
    t.onabort = () => { d.close(); reject(t.error); };
  });
}
const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

async function derive(code, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(code)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ROUNDS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function seal(k, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { iv, data: await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, data) };
}
const open = (k, box) => crypto.subtle.decrypt({ name: 'AES-GCM', iv: box.iv }, k, box.data);

export async function hasCode() { return !!(await tx('meta', 'readonly', (s) => req(s.get('lock')))); }
export function isOpen() { return !!key; }
export function lock() { key = null; }

/** First time: the code becomes the vault's key. 4 to 8 digits. */
export async function setCode(code) {
  if (!/^\d{4,8}$/.test(String(code))) throw new Error('Use 4 to 8 numbers.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const k = await derive(code, salt);
  const check = await seal(k, new TextEncoder().encode(CHECK));
  await tx('meta', 'readwrite', (s) => s.put({ salt, rounds: ROUNDS, check }, 'lock'));
  key = k;
}

/** Wait time after wrong codes: 5 wrong -> 30 s, then doubling, up to 15 minutes. */
export function waitSeconds() {
  try { const t = JSON.parse(localStorage.getItem(LS_TRIES) || '{}'); return Math.max(0, Math.ceil(((t.until || 0) - Date.now()) / 1000)); } catch (e) { return 0; }
}
function wrong() {
  let t = {}; try { t = JSON.parse(localStorage.getItem(LS_TRIES) || '{}'); } catch (e) { t = {}; }
  t.n = (t.n || 0) + 1;
  if (t.n >= 5) t.until = Date.now() + Math.min(900, 30 * 2 ** (t.n - 5)) * 1000;
  try { localStorage.setItem(LS_TRIES, JSON.stringify(t)); } catch (e) { /* private mode */ }
}

/** true = open. A wrong code counts toward the wait. */
export async function unlock(code) {
  if (waitSeconds() > 0) return false;
  const m = await tx('meta', 'readonly', (s) => req(s.get('lock')));
  if (!m) return false;
  const k = await derive(code, m.salt);
  try {
    const ok = new TextDecoder().decode(await open(k, m.check)) === CHECK;
    if (!ok) throw new Error('no');
  } catch (e) { wrong(); return false; }
  try { localStorage.removeItem(LS_TRIES); } catch (e) { /* ignore */ }
  key = k;
  return true;
}

/** Puts a photo / video in the vault (scrambled). thumb = a small JPEG Blob or null. */
export async function add(file, thumb, info = {}) {
  if (!key) throw new Error('The vault is locked.');
  const id = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const body = await seal(key, await file.arrayBuffer());
  const tb = thumb ? await seal(key, await thumb.arrayBuffer()) : null;
  const name = await seal(key, new TextEncoder().encode(JSON.stringify({ name: file.name, mime: file.type, date: info.date || file.lastModified || Date.now() })));
  const type = /^video\//.test(file.type) ? 'video' : 'image';
  await tx('blobs', 'readwrite', (s) => s.put(body, id));
  await tx('items', 'readwrite', (s) => s.put({ id, type, size: file.size, added: Date.now(), name, thumb: tb, durationMs: info.durationMs || null }));
  return id;
}

/** Everything in the vault, newest first, with thumbnails opened as object URLs (the caller revokes them). */
export async function list() {
  if (!key) throw new Error('The vault is locked.');
  const rows = await tx('items', 'readonly', (s) => req(s.getAll()));
  const out = [];
  for (const r of rows) {
    let meta = {}; try { meta = JSON.parse(new TextDecoder().decode(await open(key, r.name))); } catch (e) { meta = {}; }
    let thumbUrl = '';
    if (r.thumb) { try { thumbUrl = URL.createObjectURL(new Blob([await open(key, r.thumb)], { type: 'image/jpeg' })); } catch (e) { thumbUrl = ''; } }
    out.push({ id: r.id, type: r.type, size: r.size, added: r.added, durationMs: r.durationMs, name: meta.name || '', mime: meta.mime || '', date: meta.date || r.added, thumbUrl });
  }
  return out.sort((a, b) => b.date - a.date);
}

/** The full photo / video, opened, as an object URL (the caller revokes it). */
export async function fullUrl(item) {
  if (!key) throw new Error('The vault is locked.');
  const box = await tx('blobs', 'readonly', (s) => req(s.get(item.id)));
  if (!box) return '';
  return URL.createObjectURL(new Blob([await open(key, box)], { type: item.mime || (item.type === 'video' ? 'video/mp4' : 'image/jpeg') }));
}

export async function remove(id) {
  await tx('blobs', 'readwrite', (s) => s.delete(id));
  await tx('items', 'readwrite', (s) => s.delete(id));
}

/** Forgot the code: everything in the vault is deleted for good and a new code can be set. */
export async function eraseAll() {
  key = null;
  try { localStorage.removeItem(LS_TRIES); } catch (e) { /* ignore */ }
  await new Promise((resolve) => { const r = indexedDB.deleteDatabase(DB); r.onsuccess = r.onerror = r.onblocked = () => resolve(); });
}
