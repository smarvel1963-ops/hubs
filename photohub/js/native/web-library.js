// web-library.js - C:\MarvelApps\photohub\www\js\native\web-library.js
// WEB VERSION of the photo library (Scott 11/22: "been trying to do like all the rest all day" - Photo Hub in the browser like the Hubs,
// no install, no Play test). A web page can't read the whole phone library, so the person PICKS photos and videos (the phone's own
// picker - "Select all" works) and Photo Hub shows them its way: by day, albums by month, counts, sizes. The files stay on the phone:
// nothing is uploaded, nothing is changed, nothing is kept after the page closes (pick again next time). Same answers as the native
// MediaLibrary plugin (listMedia / getLibrarySummary / listAlbums), so every screen works unchanged.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
let items = [];                 // newest first
const files = new Map();        // id -> File
const thumbs = new Map();       // id -> object URL ('' = could not make one)
const fulls = new Map();        // id -> object URL
let nextId = 1;

export const isWeb = true;
export function count() { return items.length; }

export async function getAccess() {
  return { state: items.length ? 'granted' : 'prompt', favoritesSupported: false, web: true };
}

/** Opens the phone's picker (call it straight from a tap). Resolves to the new access once files are picked (or the old on cancel). */
export function requestAccess() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,video/*';
    input.style.display = 'none';
    let done = false;
    const finish = async () => {
      if (done) return;
      done = true;
      const picked = [...(input.files || [])];
      input.remove();
      if (picked.length) await addFiles(picked);
      resolve(await getAccess());
    };
    input.addEventListener('change', finish);
    input.addEventListener('cancel', finish);
    document.body.appendChild(input);
    input.click();
  });
}

/** Adds picked files (skips the same file picked twice). Reads each JPEG's own "date taken" when it has one. */
export async function addFiles(list) {
  const seen = new Set(items.map((i) => `${i.name}|${i.size}|${i.lastModified}`));
  for (const f of list) {
    const type = /^video\//.test(f.type) ? 'video' : /^image\//.test(f.type) ? 'image' : null;
    if (!type) continue;
    const sig = `${f.name}|${f.size}|${f.lastModified}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    let date = f.lastModified || Date.now();
    if (type === 'image' && /jpe?g/i.test(f.type)) {
      const taken = await exifDate(f).catch(() => null);
      if (taken) date = taken;
    }
    const d = new Date(date);
    const id = 'w' + nextId++;
    files.set(id, f);
    items.push({ id, web: true, type, mime: f.type, name: f.name, size: f.size, lastModified: f.lastModified, date, dateModified: f.lastModified,
      bucketId: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, bucketName: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
      favorite: false, durationMs: null, width: 0, height: 0 });
  }
  items.sort((a, b) => b.date - a.date);
}

function filtered({ type = 'all', bucketId = null, favoritesOnly = false } = {}) {
  return items.filter((i) => (type === 'all' || i.type === type) && (!bucketId || i.bucketId === bucketId) && (!favoritesOnly || i.favorite));
}

export async function listMedia(opts = {}) {
  const all = filtered(opts);
  const offset = opts.offset || 0, limit = opts.limit || 60;
  const page = all.slice(offset, offset + limit);
  return { items: page, offset, total: all.length, hasMore: offset + page.length < all.length };
}

export async function getLibrarySummary() {
  const p = items.filter((i) => i.type === 'image'), v = items.filter((i) => i.type === 'video');
  const bytes = (l) => l.reduce((s, i) => s + (i.size || 0), 0);
  return { photos: { count: p.length, bytes: bytes(p) }, videos: { count: v.length, bytes: bytes(v) }, favorites: null, access: 'web' };
}

/** Albums = the months your picked photos were taken in, newest first. */
export async function listAlbums() {
  const by = new Map();
  for (const i of items) {
    let a = by.get(i.bucketId);
    if (!a) { a = { bucketId: i.bucketId, name: i.bucketName, count: 0, photos: 0, videos: 0, cover: i }; by.set(i.bucketId, a); }
    a.count++; if (i.type === 'video') a.videos++; else a.photos++;
  }
  return { albums: [...by.values()].sort((x, y) => (x.bucketId < y.bucketId ? 1 : -1)) };
}

export function fullUrl(item) {
  if (!fulls.has(item.id) && files.has(item.id)) fulls.set(item.id, URL.createObjectURL(files.get(item.id)));
  return fulls.get(item.id) || '';
}

const SIZE = 320;
/** A small copy for the grid, made on the phone (never uploaded). Videos get their first frame and their length. */
export async function thumbUrl(item) {
  if (thumbs.has(item.id)) return thumbs.get(item.id);
  const f = files.get(item.id);
  let url = '';
  try { url = item.type === 'video' ? await videoThumb(item, f) : await imageThumb(item, f); } catch (e) { url = ''; }
  thumbs.set(item.id, url);
  return url;
}

async function imageThumb(item, f) {
  const bmp = await createImageBitmap(f);
  item.width = bmp.width; item.height = bmp.height;
  const k = Math.min(1, SIZE / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close && bmp.close();
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
  return blob ? URL.createObjectURL(blob) : '';
}

function videoThumb(item, f) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    const src = URL.createObjectURL(f);
    let settled = false;
    const end = (url) => { if (settled) return; settled = true; URL.revokeObjectURL(src); v.removeAttribute('src'); resolve(url); };
    v.muted = true; v.playsInline = true; v.preload = 'metadata'; v.src = src;
    v.addEventListener('loadedmetadata', () => {
      item.durationMs = isFinite(v.duration) ? Math.round(v.duration * 1000) : null;
      item.width = v.videoWidth; item.height = v.videoHeight;
      try { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); } catch (e) { end(''); }
    });
    v.addEventListener('seeked', () => {
      try {
        const k = Math.min(1, SIZE / Math.max(v.videoWidth || 1, v.videoHeight || 1));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round((v.videoWidth || SIZE) * k)); c.height = Math.max(1, Math.round((v.videoHeight || SIZE) * k));
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        c.toBlob((b) => end(b ? URL.createObjectURL(b) : ''), 'image/jpeg', 0.8);
      } catch (e) { end(''); }
    });
    v.addEventListener('error', () => end(''));
    setTimeout(() => end(''), 8000);
  });
}

// ---------- for the Private Vault (vault.js) ----------
export function fileFor(id) { return files.get(id) || null; }

/** Takes a picked item out of the web list (it went into the vault). */
export function removeItem(id) {
  items = items.filter((i) => i.id !== id);
  files.delete(id);
  for (const m of [thumbs, fulls]) { const u = m.get(id); if (u) URL.revokeObjectURL(u); m.delete(id); }
}

/** A small JPEG Blob of any photo / video File (for the vault's grid), + a video's length. */
export async function makeThumbBlob(file) {
  const item = { type: /^video\//.test(file.type) ? 'video' : 'image' };
  let url = '';
  try { url = item.type === 'video' ? await videoThumb(item, file) : await imageThumb(item, file); } catch (e) { url = ''; }
  if (!url) return { blob: null, durationMs: item.durationMs || null };
  const blob = await (await fetch(url)).blob();
  URL.revokeObjectURL(url);
  return { blob, durationMs: item.durationMs || null };
}

/** The JPEG's own "date taken" (EXIF DateTimeOriginal), or null. Reads only the start of the file. */
export async function exifDate(file) {
  const buf = await file.slice(0, 256 * 1024).arrayBuffer();
  return exifDateFromBuffer(buf);
}

export function exifDateFromBuffer(buf) {
  const dv = new DataView(buf);
  if (dv.byteLength < 4 || dv.getUint16(0) !== 0xFFD8) return null;
  let p = 2;
  while (p + 4 <= dv.byteLength) {
    const marker = dv.getUint16(p), len = dv.getUint16(p + 2);
    if (marker === 0xFFE1 && p + 10 <= dv.byteLength && dv.getUint32(p + 4) === 0x45786966) return readTiff(dv, p + 10);
    if ((marker & 0xFF00) !== 0xFF00 || len < 2) return null;
    p += 2 + len;
  }
  return null;
}

function readTiff(dv, t) {
  if (t + 8 > dv.byteLength) return null;
  const le = dv.getUint16(t) === 0x4949;
  const u16 = (o) => dv.getUint16(o, le), u32 = (o) => dv.getUint32(o, le);
  const ifd = (o) => { const out = {}; if (o + 2 > dv.byteLength) return out; const n = u16(o);
    for (let i = 0; i < n; i++) { const e = o + 2 + i * 12; if (e + 12 > dv.byteLength) break; out[u16(e)] = { type: u16(e + 2), count: u32(e + 4), at: e + 8 }; } return out; };
  const ascii = (ent) => { if (!ent) return null; const off = ent.count > 4 ? t + u32(ent.at) : ent.at; let s = '';
    for (let i = 0; i < ent.count - 1 && off + i < dv.byteLength; i++) s += String.fromCharCode(dv.getUint8(off + i)); return s; };
  const ifd0 = ifd(t + u32(t + 4));
  let s = null;
  if (ifd0[0x8769]) s = ascii(ifd(t + u32(ifd0[0x8769].at))[0x9003]);
  if (!s) s = ascii(ifd0[0x0132]);
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s || '');
  if (!m || m[1] === '0000') return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
}
