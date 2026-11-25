// places.js - C:\MarvelApps\photohub\www\js\lib\places.js
// PLACES - YOUR PHOTOS SORTED BY TOWN (0.7.0, Scott 11/22: "or can we categorize some by location" -> "Yes, build Places").
// Everything happens ON THE PHONE (or in the browser): where each photo was taken is read from the file itself, and the town name
// comes from a world list of towns that ships inside Photo Hub (www/places/t/<lat>_<lon>.tsv, made by scripts/make_place_tiles.py
// from GeoNames, CC BY 4.0). No location is ever sent anywhere.
//   Phone app: reads every photo's location once (MediaLibrary.getLocations - the ORIGINAL file, so it needs the photo-location
//              OK from 0.6.0), remembers it (IndexedDB), and only reads new or edited photos after that.
//   Web version: reads the location from the photos picked this visit (JPEG EXIF). Browsers on phones often remove it.
// A photo with no location (camera location off, a screenshot, a picture someone sent) is simply not in any place.

import { isNative, listMedia, requestLocation as askLocation } from '../native/media-library.js';
import * as web from '../native/web-library.js';
import { gpsFromFile } from './exif-gps.js';

const TILE = 5;   // degrees per town file
const BATCH = 100;

// ---------------------------------------------------------------- the town list (loaded a piece at a time)
const tiles = new Map();
const tileBase = () => globalThis.PH_PLACES_URL || './places/t/';
const band = (x) => Math.floor(x / TILE) * TILE;
const wrapLon = (b) => ((((b + 180) % 360) + 360) % 360) - 180;
function loadTile(key) {
  if (!tiles.has(key)) {
    tiles.set(key, (async () => {
      try {
        const r = await globalThis.fetch(tileBase() + key + '.tsv');
        if (!r.ok) return [];   // open sea / no towns there
        return (await r.text()).split('\n').filter(Boolean).map((l) => {
          const [n, a, c, la, lo, pop] = l.split('\t');
          return { n, a, c, la: Number(la), lo: Number(lo), w: Math.log10(Math.max(10, Number(pop) || 0)) };
        });
      } catch (e) {
        tiles.delete(key);   // try again next time (offline)
        return [];
      }
    })());
  }
  return tiles.get(key);
}

/** The town a spot belongs to: { n: name, a: state / region code, c: country code } or null.
 *  Within 25 km, bigger towns are favoured a little: score = log10(population) - km / 5 - so a city ten times bigger wins if it is at
 *  most 5 km further away (Paris beats "Paris 04 Hotel-de-Ville"; North Little Rock still beats Little Rock in North Little Rock;
 *  a small town keeps its own name). Nothing within 25 km (at sea): simply the nearest town. */
export async function nearestTown(lat, lon) {
  const lb = band(lat), ob = band(lon);
  const keys = [];
  for (const dl of [-TILE, 0, TILE]) for (const dn of [-TILE, 0, TILE]) {
    const la = lb + dl;
    if (la < -90 || la >= 90) continue;
    keys.push(`${la}_${wrapLon(ob + dn)}`);
  }
  const lists = await Promise.all([...new Set(keys)].map(loadTile));
  const k = Math.cos((lat * Math.PI) / 180);
  let near = null, nearD = Infinity, best = null, bestS = -Infinity;
  for (const list of lists) for (const t of list) {
    let dLon = Math.abs(t.lo - lon);
    if (dLon > 180) dLon = 360 - dLon;
    const km = Math.sqrt((t.la - lat) ** 2 + (dLon * k) ** 2) * 111.2;
    if (km < nearD) { nearD = km; near = t; }
    if (km <= 25) { const sc = (t.w || 1) - km / 5; if (sc > bestS) { bestS = sc; best = t; } }
  }
  return best || near;
}

let regionNames = null;
function countryName(cc) {
  try { regionNames = regionNames || new Intl.DisplayNames(['en'], { type: 'region' }); return regionNames.of(cc) || cc; } catch (e) { return cc; }
}
/** "Little Rock, AR" in the US; "Cozumel, Mexico" elsewhere. */
export function townLabel(t) { return t.c === 'US' && t.a ? `${t.n}, ${t.a}` : `${t.n}, ${countryName(t.c)}`; }
const townKey = (t) => `${t.c}|${t.a}|${t.n}`;

// ---------------------------------------------------------------- what we already know (IndexedDB: one record per photo)
// key = phone photo id (or the web version's name|size|date); value = { m: dateModified, ll: [lat, lon] | null, p: town key, l: label, s: snapshot }
const DB = 'photohub-places', STORE = 'loc';
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
  return dbp;
}
async function loadAll() {
  const d = await db();
  return new Promise((ok, no) => {
    const out = new Map();
    const q = d.transaction(STORE).objectStore(STORE).openCursor();
    q.onsuccess = () => { const c = q.result; if (!c) return ok(out); out.set(String(c.key), c.value); c.continue(); };
    q.onerror = () => no(q.error);
  });
}
async function putMany(entries, removeKeys = []) {
  const d = await db();
  await new Promise((ok, no) => {
    const t = d.transaction(STORE, 'readwrite');
    const s = t.objectStore(STORE);
    for (const [k, v] of entries) s.put(v, k);
    for (const k of removeKeys) s.delete(k);
    t.oncomplete = () => ok();
    t.onerror = () => no(t.error);
    t.onabort = () => no(t.error);
  });
}

// ---------------------------------------------------------------- the scan
let known = null;   // Map key -> record
const st = { running: false, checked: 0, total: 0, withPlace: 0, needsPermission: false, error: '', done: false };
const listeners = new Set();
export function status() { return { ...st }; }
export function onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }
function notify() { for (const cb of listeners) { try { cb(status()); } catch (e) { /* a screen must never break the scan */ } } }

const snapOf = (i) => ({ id: i.id, type: i.type, mime: i.mime, name: i.name, size: i.size, date: i.date, dateModified: i.dateModified,
  orientation: i.orientation, width: i.width, height: i.height, uri: i.uri, bucketId: i.bucketId, bucketName: i.bucketName, durationMs: i.durationMs });
const keyOf = (i) => (i.web ? `${i.name}|${i.size}|${i.lastModified}` : String(i.id));

async function withTown(rec) {
  if (!rec.ll || rec.p) return rec;
  const t = await nearestTown(rec.ll[0], rec.ll[1]);
  if (t) { rec.p = townKey(t); rec.l = townLabel(t); }
  return rec;
}

async function allPhotos() {
  if (!isNative()) return (await web.listMedia({ type: 'all', offset: 0, limit: 100000 })).items || [];
  const all = [];
  for (let off = 0, i = 0; i < 400; i++) {
    const r = await listMedia({ type: 'all', offset: off, limit: 500 });
    const got = r.items || [];
    all.push(...got);
    off += got.length;
    if (!r.hasMore || !got.length) break;
  }
  return all;
}

async function readLocations(batch) {
  if (isNative()) {
    const lib = globalThis.Capacitor.registerPlugin('MediaLibrary');
    if (typeof lib.getLocations !== 'function') return { readable: false, locations: {} };
    return lib.getLocations({ items: batch.map((x) => ({ id: String(x.id), type: x.type })) });
  }
  const locations = {};
  for (const it of batch) {
    const f = web.fileFor(it.id);
    if (!f) continue;   // remembered from an earlier visit, not picked now: read it when it is picked again
    locations[it.id] = /jpe?g$/i.test(f.type || f.name || '') ? await gpsFromFile(f) : null;
  }
  return { readable: true, locations };
}

let running = null;
/** Reads the location of every photo not read yet (new or edited ones only, after the first time). Safe to call often. */
export function scan() {
  if (running) return running;
  running = (async () => {
    st.running = true; st.error = ''; st.needsPermission = false; notify();
    try {
      if (!known) known = await loadAll();
      const photos = await allPhotos();
      st.total = photos.length;
      const here = new Set();
      const todo = [];
      for (const it of photos) {
        const k = keyOf(it);
        here.add(k);
        const r = known.get(k);
        if (!r || r.m !== (it.dateModified || it.lastModified || 0)) todo.push(it);
      }
      st.checked = photos.length - todo.length;
      notify();
      for (let i = 0; i < todo.length; i += BATCH) {
        const batch = todo.slice(i, i + BATCH);
        const res = await readLocations(batch);
        if (!res.readable) { st.needsPermission = true; break; }   // nothing remembered: read again once the OK is given
        const entries = [];
        for (const it of batch) {
          if (!(String(it.id) in (res.locations || {}))) continue;   // could not be read this time
          const ll = res.locations[String(it.id)] || null;
          const rec = await withTown({ m: it.dateModified || it.lastModified || 0, ll: ll ? [Number(ll[0]), Number(ll[1])] : null, s: ll && isNative() ? snapOf(it) : null });
          known.set(keyOf(it), rec);
          entries.push([keyOf(it), rec]);
        }
        await putMany(entries);
        st.checked += batch.length;
        notify();
      }
      // photos no longer on the phone leave Places (phone app only - the web version only knows this visit's picks)
      if (isNative() && !st.needsPermission) {
        const gone = [...known.keys()].filter((k) => !here.has(k));
        if (gone.length) { for (const k of gone) known.delete(k); await putMany([], gone); }
      }
      // a town name that could not be looked up before (offline) is tried again
      const fix = [];
      for (const [k, r] of known) if (r.ll && !r.p) { await withTown(r); if (r.p) fix.push([k, r]); }
      if (fix.length) await putMany(fix);
      st.withPlace = [...known.values()].filter((r) => r.p).length;
      st.done = true;
    } catch (e) {
      st.error = (e && e.message) || String(e);
    } finally {
      st.running = false;
      running = null;
      notify();
    }
  })();
  return running;
}

/** Asks for photo locations (phone app) and reads again. */
export async function allowLocations() {
  const a = await askLocation().catch(() => null);
  st.needsPermission = !(a && a.location === 'granted');
  notify();
  if (!st.needsPermission) scan();
  return a;
}

async function located() {
  if (!known) known = await loadAll();
  if (isNative()) return [...known.values()].filter((r) => r.p && r.s).map((r) => ({ item: { ...r.s }, p: r.p, l: r.l, ll: r.ll }));
  const items = (await web.listMedia({ type: 'all', offset: 0, limit: 100000 })).items || [];
  return items.map((it) => ({ item: it, r: known.get(keyOf(it)) })).filter((x) => x.r && x.r.p).map((x) => ({ item: x.item, p: x.r.p, l: x.r.l, ll: x.r.ll }));
}
/** 11/24 Trips (lib/trips.js): every photo with a town - { item, p: town key, l: label, ll: [lat, lon] }. */
export async function locatedItems() { return located(); }

/** Your places, the ones with the most photos first: [{ key, label, count, cover, latest }] */
export async function list() {
  const by = new Map();
  for (const { item, p, l } of await located()) {
    let g = by.get(p);
    if (!g) { g = { key: p, label: l, count: 0, cover: item, latest: 0 }; by.set(p, g); }
    g.count++;
    if ((item.date || 0) > g.latest) { g.latest = item.date || 0; g.cover = item; }
  }
  return [...by.values()].sort((a, b) => b.count - a.count || b.latest - a.latest);
}

/** One place's photos, newest first. */
export async function items(key) {
  return (await located()).filter((x) => x.p === key).map((x) => x.item).sort((a, b) => (b.date || 0) - (a.date || 0));
}
/** The place's name ("Little Rock, AR"), from what is remembered. */
export async function label(key) {
  const x = (await located()).find((y) => y.p === key);
  return x ? x.l : '';
}
