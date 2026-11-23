// media-library.js - C:\MarvelApps\photohub\www\js\native\media-library.js
// JS side of the local MediaLibrary plugin (android/.../MediaLibraryPlugin.java): read-only access to the phone's
// photos + videos. Outside the Android app (a browser - the WEB VERSION, 11/22) the person picks their own photos and
// web-library.js answers the same calls from those picked files (never fake photos, nothing uploaded).

import * as web from './web-library.js';
import { cloudThumbUrl } from '../lib/cloud-images.js';
import * as mine from '../lib/mine.js';

const cap = () => globalThis.Capacitor;

export function isNative() {
  const c = cap();
  return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform());
}

let plugin = null;
function lib() {
  if (!plugin) plugin = cap().registerPlugin('MediaLibrary');
  return plugin;
}

/** -> { state: 'granted' | 'limited' | 'prompt' | 'denied' | 'unavailable', favoritesSupported, location (phone app 0.6.0+) } */
export async function getAccess() {
  if (!isNative()) return web.getAccess();
  const a = await lib().getAccess();
  // 0.6.0: a phone that already gave photo access is asked ONCE for photo locations - without it Android blanks out where each
  // photo was taken when Photo Hub reads it, and the backup copies lost the location (Scott's D: copies, 11/22)
  if (canRead(a) && a.location === 'prompt' && typeof lib().requestLocation === 'function' && !locationAsked()) {
    try { localStorage.setItem(LOC_ASKED, '1'); } catch (e) { /* private mode */ }
    try { return await lib().requestLocation(); } catch (e) { return a; }
  }
  return a;
}
const LOC_ASKED = 'photohub.locationAsked';
function locationAsked() { try { return localStorage.getItem(LOC_ASKED) === '1'; } catch (e) { return true; } }

export async function requestAccess() {
  if (!isNative()) return web.requestAccess();   // opens the phone's picker - call straight from a tap
  return lib().requestAccess();
}

export function canRead(access) {
  return !!access && (access.state === 'granted' || access.state === 'limited');
}

/** opts: { offset, limit, type: 'all'|'image'|'video', bucketId, favoritesOnly } */
export async function listMedia(opts = {}) {
  if (!isNative()) return web.listMedia(opts);
  const offset = opts.offset || 0, limit = opts.limit || 120;
  // phone app 0.2.0: your own albums + Favorites (Android's favorites AND Photo Hub hearts) come from kept snapshots
  if (opts.albumId || opts.favoritesOnly) {
    let all = opts.albumId ? mine.albumItems(opts.albumId) : await nativeFavorites();
    if (opts.type && opts.type !== 'all') all = all.filter((i) => i.type === opts.type);
    const page = all.slice(offset, offset + limit);
    return { items: page, offset, total: all.length, hasMore: offset + page.length < all.length };
  }
  // the phone hands out at most 500 at a time - ask again until the screen has what it asked for
  const want = { ...opts, favoritesOnly: false };
  let items = [], at = offset, total = 0, hasMore = true;
  while (items.length < limit && hasMore) {
    const r = await lib().listMedia({ ...want, offset: at, limit: Math.min(500, limit - items.length) });
    const got = r.items || [];
    items = items.concat(got); total = r.total; hasMore = !!r.hasMore && got.length > 0; at += got.length;
  }
  for (const it of items) { it.androidFav = it.favorite === true; it.favorite = it.androidFav || mine.isHearted(it); }
  return { items, offset, total, hasMore };
}

/** Phone app: Android's own favorites + photos hearted in Photo Hub, newest first, no doubles. */
async function nativeFavorites() {
  const byId = new Map();
  try {
    let at = 0, more = true;
    while (more && at < 5000) {
      const r = await lib().listMedia({ type: 'all', favoritesOnly: true, offset: at, limit: 500 });
      for (const it of r.items || []) { it.androidFav = true; it.favorite = true; byId.set(it.id, it); }
      more = !!r.hasMore && (r.items || []).length > 0; at += (r.items || []).length;
    }
  } catch (e) { /* older Android: no favorites flag */ }
  for (const it of mine.heartedItems()) if (!byId.has(it.id)) byId.set(it.id, { ...it, favorite: true });
  return [...byId.values()].sort((a, b) => b.date - a.date);
}

/** Turns a photo's heart on / off (both versions). */
export function heart(item) { return isNative() ? mine.toggleHeart(item) : web.toggleHeart(item); }
/** Your own albums with counts + a cover (both versions). */
export function myAlbums() {
  if (!isNative()) return web.listMyAlbums();
  return mine.albumList().map((a) => { const its = mine.albumItems(a.id); return { id: a.id, name: a.name, created: a.created, total: a.members.length, count: its.length, cover: its[0] || null }; });
}
/** true when the full-size photo is on hand (phone app: always; web: picked this visit). */
export function hasFullFile(item) { return item && item.cloud ? false : isNative() ? true : web.hasFile(item); }
/** The full photo / video as a File, for the vault. Phone app: read from the phone (never uploaded). */
export async function fileForVault(item) {
  if (!isNative()) return web.fileFor(item.id);
  const blob = await (await fetch(fullImageUrl(item))).blob();
  return new File([blob], item.name || 'photo', { type: item.mime || blob.type, lastModified: item.dateModified || Date.now() });
}

export async function getLibrarySummary() {
  if (!isNative()) return web.getLibrarySummary();
  const s = await lib().getLibrarySummary();
  s.favorites = (await nativeFavorites()).length;   // Android's favorites + Photo Hub hearts
  return s;
}

export async function listAlbums() {
  if (!isNative()) return web.listAlbums();
  return lib().listAlbums();
}

export async function openAppSettings() {
  if (isNative()) await lib().openAppSettings();
}

/** Full-size image through Capacitor's content:// bridge (served from the phone, never uploaded). */
export function fullImageUrl(item) {
  if (item && item.cloud) return '';   // the viewer fetches cloud photos itself (lib/cloud-images.js)
  if (item && item.web) return web.fullUrl(item);
  return item && item.uri ? cap().convertFileSrc(item.uri) : '';
}

// ---------- thumbnails: batched + cached ----------

const thumbCache = new Map(); // "id:dateModified" -> webview URL (or '' if the phone could not make one)
let pending = [];
let timer = null;
const BATCH = 40;
const SIZE = 256;

function cacheKey(item) {
  return `${item.id}:${item.dateModified || 0}`;
}

/** Resolves to a URL the <img> can show, or '' when the phone has no thumbnail for it. */
export function thumbnailUrl(item) {
  if (item && item.cloud) return cloudThumbUrl(item);   // 11/22: an album photo kept only in the cloud
  if (item && item.web) return web.thumbUrl(item);
  const key = cacheKey(item);
  if (thumbCache.has(key)) return Promise.resolve(thumbCache.get(key));
  return new Promise((resolve) => {
    pending.push({ item, key, resolve });
    if (!timer) timer = setTimeout(flush, 30);
  });
}

async function flush() {
  timer = null;
  const batch = pending.splice(0, BATCH);
  if (pending.length) timer = setTimeout(flush, 0);
  if (!batch.length) return;
  const items = batch.map(({ item }) => ({ id: item.id, type: item.type, dateModified: item.dateModified || 0, orientation: item.orientation || 0 }));
  let map = {};
  try {
    map = (await lib().getThumbnails({ items, size: SIZE })).thumbnails || {};
  } catch (e) {
    map = {};
  }
  for (const { item, key, resolve } of batch) {
    const path = map[item.id];
    const url = path ? cap().convertFileSrc(path) : '';
    if (path) thumbCache.set(key, url);
    resolve(url);
  }
}

/** Web version only: true when Photo Hub runs in a browser (the person picks photos). */
export function isWebVersion() { return !isNative(); }
