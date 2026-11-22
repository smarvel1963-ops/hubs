// media-library.js - C:\MarvelApps\photohub\www\js\native\media-library.js
// JS side of the local MediaLibrary plugin (android/.../MediaLibraryPlugin.java): read-only access to the phone's
// photos + videos. Outside the Android app (a browser - the WEB VERSION, 11/22) the person picks their own photos and
// web-library.js answers the same calls from those picked files (never fake photos, nothing uploaded).

import * as web from './web-library.js';

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

/** -> { state: 'granted' | 'limited' | 'prompt' | 'denied' | 'unavailable', favoritesSupported } */
export async function getAccess() {
  if (!isNative()) return web.getAccess();
  return lib().getAccess();
}

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
  return lib().listMedia(opts);
}

export async function getLibrarySummary() {
  if (!isNative()) return web.getLibrarySummary();
  return lib().getLibrarySummary();
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
