// runner.js - C:\MarvelApps\photohub\www\js\backup\runner.js
// KEEPS CLOUD BACKUP GOING WHILE PHOTO HUB IS OPEN (11/22, Scott: "Yes, build it"). Glue between the screens, the sign-in
// (lib/account.js), the backup engine (backup-engine.js - verify before done, resume after a crash, upload once, never deletes) and the
// real cloud (cloud-target.js).
//   Phone app: Auto Backup ON + signed in -> reads the whole phone library, newest first, and backs up what is not in the cloud yet,
//              Wi-Fi only unless the person turns that off. Runs when the app opens, comes back to the front, every 5 minutes while
//              open, and when the switch or the sign-in changes. (Backup while the app is closed: android BackupWorker, 0.4.0 - see below.)
//   Web version (PC / iPhone / Android browser): backs up the photos picked this visit - automatically when Auto Backup is on, or with
//              the "Back up now" button. A browser can't tell Wi-Fi from mobile data, so Wi-Fi only does not apply there.
// Files over 95 MB (long videos) are left out for now and counted, never silently skipped.
// 11/22 ALBUM SYNC (lib/album-sync.js): this file also tells the album sync which cloud photo each phone photo is (from the journal)
// and runs it after every pass, so a photo put in an album joins the cloud album once it is backed up.

import { BackupEngine, SKIP } from './backup-engine.js';
import { CloudTarget, cloudBase } from './cloud-target.js';
import { IndexedDBStateStore } from './idb-store.js';
import { MemoryStateStore } from './state-store.js';
import * as account from '../lib/account.js';
import { isNative, listMedia, fullImageUrl, getAccess } from '../native/media-library.js';
import * as web from '../native/web-library.js';
import { getNetwork, onNetworkChange } from '../native/network.js';
import { loadSettings } from '../lib/settings.js';
import * as albumSync from '../lib/album-sync.js';
import * as placeSync from '../lib/place-sync.js';   // 11/25 Trips from the cloud
import * as places from '../lib/places.js';
import { sigOf } from '../lib/mine.js';

export const MAX_BYTES = 95 * 1024 * 1024;
const EVERY_MS = 5 * 60 * 1000;

const byId = new Map();
const keyToId = new Map();   // album key (web version: name|size|date) -> photo id, from the scan
let shaToIds = null;         // sha256 -> [photo id], from the journal on first use, kept current as photos back up
let engine = null, target = null;
let network = { connected: true, type: 'unknown' };
let running = null, again = false, nowOnce = false, started = false;
const listeners = new Set();
const st = { phase: 'idle', reason: '', summary: null, tooBig: 0, me: null, lastDone: 0, current: 0 };

/** The latest backup state for the screens: { phase, reason, summary, tooBig, me, lastDone }. */
export function status() { return { ...st, summary: st.summary ? { ...st.summary } : null }; }
export function onStatus(cb) { listeners.add(cb); return () => listeners.delete(cb); }

let notifyT = null;
function notify(soon = false) {
  if (soon) { if (!notifyT) notifyT = setTimeout(() => { notifyT = null; notify(); }, 250); return; }
  for (const cb of listeners) { try { cb(status()); } catch (e) { /* a screen must never break a backup */ } }
}
function phase(p, reason = '') { st.phase = p; st.reason = reason; if (engine) st.summary = engine.summary(); notify(); }

function settings() {
  const s = loadSettings();
  return isNative() ? s : { ...s, wifiOnly: false };   // a browser can't tell Wi-Fi from mobile data
}

const source = {
  async read(photo) {
    if (!isNative()) {
      const f = web.fileFor(photo.id);
      if (!f) throw new Error('Pick this photo again to back it up');
      return new Uint8Array(await f.arrayBuffer());
    }
    const it = byId.get(String(photo.id));
    if (!it) throw new Error('This photo is no longer on the phone');
    const r = await fetch(fullImageUrl(it));
    if (!r.ok) throw new Error('The phone would not hand over the photo (' + r.status + ')');
    return new Uint8Array(await r.arrayBuffer());
  },
};

function makeEngine() {
  target = new CloudTarget(account);
  engine = new BackupEngine({
    source, target,
    // phone app: a journal that lasts (IndexedDB); web version: this visit's picks only (picked files are gone after the visit)
    store: isNative() ? new IndexedDBStateStore(account.current() ? account.current().uid : 'nobody') : new MemoryStateStore(),
    getSettings: () => (nowOnce ? { ...settings(), backupEnabled: true } : settings()),
    getNetwork: () => network,
    onEvent: (type, data) => {
      if (type === 'backed_up' && data) { tellBackground(data.id); noteSha(data.id); }
      if (type === 'backed_up' || type === 'failed') { st.summary = engine.summary(); notify(true); }
    },
  });
  return engine.init();
}

async function scan() {
  const all = [];
  if (isNative()) {
    let off = 0;
    for (let i = 0; i < 400; i++) {
      const r = await listMedia({ type: 'all', offset: off, limit: 500 });
      const got = r.items || [];
      for (const it of got) byId.set(String(it.id), it);
      all.push(...got);
      off += got.length;
      if (!r.hasMore || !got.length) break;
    }
  } else {
    const r = await web.listMedia({ type: 'all', offset: 0, limit: 100000 });
    for (const it of r.items || []) if (web.hasFile(it)) { all.push(it); byId.set(String(it.id), it); keyToId.set(sigOf(it), String(it.id)); }
  }
  const fits = all.filter((it) => !(Number(it.size) > MAX_BYTES));
  st.tooBig = all.length - fits.length;
  await engine.addPhotos(fits);
}

// ---------- 0.6.0 ORIGINALS: once Photo Hub may read the original files, re-read every backed-up photo ONE time (per account) ----------
async function originalsOnce() {
  if (!isNative() || !engine || !account.current()) return;
  const key = 'photohub.originals.' + account.current().uid;
  try { if (localStorage.getItem(key) === '1') return; } catch (e) { return; }
  const a = await getAccess().catch(() => null);
  if (!a || a.location !== 'granted') return;   // older Android never hid it: 'granted' too; no answer yet: ask again next pass
  await engine.requeueForOriginals();
  try { localStorage.setItem(key, '1'); } catch (e) { /* private mode */ }
}

// ---------- 11/22 ALBUM SYNC: which cloud photo (SHA-256) a phone photo is, and the other way round ----------
function shaForKey(key) {
  if (!engine) return null;
  const id = String(key).startsWith('n:') ? String(key).slice(2) : keyToId.get(key);
  if (id === undefined || id === null) return null;
  const r = engine.record(id);
  return r && r.status === 'backed_up' && r.sha256 ? r.sha256 : null;
}
function addSha(sha, id) { const l = shaToIds.get(sha) || []; if (!l.includes(String(id))) l.push(String(id)); shaToIds.set(sha, l); }
function itemsForSha(sha) {
  if (!engine) return [];
  if (!shaToIds) { shaToIds = new Map(); for (const r of engine.records()) if (r.status === 'backed_up' && r.sha256) addSha(r.sha256, r.id); }
  return (shaToIds.get(sha) || []).map((id) => byId.get(id)).filter(Boolean);
}
function noteSha(id) { if (!shaToIds || !engine) return; const r = engine.record(id); if (r && r.sha256) addSha(r.sha256, id); }

// ---------- 0.4.0 BACKGROUND BACKUP (android BackupWorker): keeps going about every hour with the app closed ----------
// The phone app tells the native side whether Auto Backup is on (and Wi-Fi only), and which photos it already backed up so the
// background never reads them again. Older app builds have no BackgroundBackup plugin: everything here quietly does nothing.
function bg() {
  const c = globalThis.Capacitor;
  return isNative() && c && typeof c.isPluginAvailable === 'function' && c.isPluginAvailable('BackgroundBackup') ? c.registerPlugin('BackgroundBackup') : null;
}
export const hasBackground = () => !!bg();
let bgSent = '';
async function bgConfigure() {
  const p = bg(); if (!p) return;
  const s = settings();
  const want = { enabled: !!(s.backupEnabled && account.current() && st.phase !== 'not_allowed'), wifiOnly: s.wifiOnly !== false, cloudUrl: cloudBase() };
  const key = JSON.stringify(want);
  if (key === bgSent) return;
  try { await p.configure(want); bgSent = key; } catch (e) { /* tried again next pass */ }
}
function tellBackground(id) {
  const p = bg(); if (!p || !engine) return;
  const r = engine.record(id);
  if (r && r.sha256) p.markDone({ items: [{ id: Number(id), modified: Number(r.photo.dateModified) || 0, sha256: r.sha256, size: r.size || 0 }] }).catch(() => null);
}
/** The last background run (phone app 0.4.0+), or null. */
export async function backgroundStatus() { const p = bg(); if (!p) return null; try { return await p.status(); } catch (e) { return null; } }

async function pass() {
  await account.init();
  const s = settings();
  if (!account.available()) return phase('no_signin');
  if (!account.current()) return phase('signed_out');   // sign-in is the first step, whatever the switch says
  if (!s.backupEnabled && !nowOnce) return phase('off');
  if (!engine) await makeEngine();
  await originalsOnce();
  if (isNative()) network = await getNetwork();
  else network = { connected: typeof navigator === 'undefined' || navigator.onLine !== false, type: 'unknown' };
  const why = engine.whyNotRunning();
  if (why === SKIP.OFFLINE || why === SKIP.WAITING_FOR_WIFI) return phase('waiting', why);
  const t = await engine.checkTarget();
  if (!t.ready) return phase(t.notSetUp ? 'not_allowed' : 'unreachable', t.reason);
  st.me = target.me;
  phase('scanning');
  await scan();
  phase('uploading');
  for (let i = 0; i < 5; i++) {   // one pass handles everything due; photos that failed wait for their retry time (next pass)
    const rep = await engine.runOnce();
    if (rep.skipped || rep.stoppedEarly) {
      const r = rep.skipped || rep.stoppedEarly;
      return phase(r === SKIP.CLOUD_NOT_SET_UP ? 'not_allowed' : r === SKIP.CLOUD_UNREACHABLE ? 'unreachable' : 'waiting', rep.reason || r);
    }
    if (!rep.attempted) break;
  }
  await target.ready().then((me) => { st.me = me; }).catch(() => null);
  st.lastDone = Date.now();
  phase('done');
}

/** Run a backup pass now (or right after the one already running). now: true backs up even with Auto Backup off (the button). */
export function kick({ now = false } = {}) {
  if (now) nowOnce = true;
  if (running) { again = true; return running; }
  running = (async () => {
    do {
      again = false;
      try { await pass(); } catch (e) { phase('unreachable', (e && e.message) || String(e)); }
      await bgConfigure();
      await albumSync.sync();   // never throws
      placeSync.soon(1000);     // 11/25: places of newly backed-up photos go to the cloud (Trips from the cloud)
    } while (again);
  })().finally(() => { running = null; nowOnce = false; });
  return running;
}

/** Sign-out, or the Auto Backup switch turned off: forget this session's engine so the next sign-in starts clean. */
export function reset() { engine = null; target = null; shaToIds = null; keyToId.clear(); st.summary = null; st.me = null; phase('idle'); }

/** Called once by app.js. */
export async function start() {
  if (started) return;
  started = true;
  albumSync.setLookups({ shaForKey, itemsForSha });
  albumSync.start();
  placeSync.setLookups({ shaForKey, itemsForSha });
  places.onChange((ps) => { if (ps.done && !ps.running) placeSync.soon(); });   // Places read new photos: send their places
  await account.init();
  let seen = account.current() ? account.current().uid : null;
  account.onChange((u) => { const id = u ? u.uid : null; if (id === seen) return; seen = id; reset(); kick(); });
  onNetworkChange((n) => { network = n; if (n.connected) kick(); }).catch(() => null);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kick(); });
  setInterval(() => { if (document.visibilityState === 'visible') kick(); }, EVERY_MS);
  kick();
}
