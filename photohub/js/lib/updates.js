// updates.js - C:\MarvelApps\photohub\www\js\lib\updates.js
// UPDATES - the same as every Hub app (Scott 11/25: "certain things we agreed that every app we have or build gets the same"; Day Hub's
// app.js checkUpdate / paintUpd / applyUpdate / updDone / verLine / What's New is the model):
//   - WEB VERSION: asks for the newest version number when it opens, when you come back to it (at most once a minute) and every 30 minutes.
//     A NEWER number (never an older one - an offline copy can be older) shows the big green bar just above the bottom bar:
//     "Update ready · Takes a few seconds. Your photos stay. · Update now". The whole bar is the button: it fetches this app's own files
//     fresh (a plain reload can reuse the browser's 10-minute copies, and then the bar just comes back), reloads, then says it worked.
//   - More -> "Check for updates" (web version) with the version number, like a Hub's Settings.
//   - WHAT'S NEW: after an update (the web version, or the phone app after Google Play updates it) the notes for the new versions show
//     once. A brand-new user sees none. Notes are Play-safe (no prices, no Pro).
//   - The phone app never shows the green bar: Google Play updates it.

import { openSheet } from '../ui.js';

/** What changed, newest first. Keep each line short and plain. */
export const NOTES = {
  '0.7.11': ['A green "Update ready" bar (like our other apps) tells you when a new Photo Hub is out, and More has "Check for updates".'],
  '0.7.9': ['Slide between photos with your finger, both ways - even when your thumb curves.', 'Pinch or double-tap a photo to zoom in.'],
  '0.7.8': ['Pets: your dogs and cats, found right on your phone.'],
  '0.7.7': ['Swipe left and right between photos.'],
  '0.7.6': ['Notifications, Free Up Phone Space, Duplicate Cleanup and Events.'],
};

const UPD_KEY = 'photohub.updated', SEEN_KEY = 'photohub.seenVersion';
const isNative = () => !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
const newer = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }) > 0;
let VERSION = '0', ready = null, busy = false, asked = 0;

export function toast(text) {
  document.querySelectorAll('.upd-toast').forEach((n) => n.remove());
  const t = document.createElement('div');
  t.className = 'upd-toast'; t.setAttribute('role', 'status'); t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

function paint() {
  let bar = document.getElementById('updBar');
  if (!ready) { if (bar) bar.remove(); return; }
  if (!bar) {
    bar = document.createElement('button');
    bar.type = 'button'; bar.id = 'updBar'; bar.className = 'upd-bar';
    bar.addEventListener('click', update);
    document.body.appendChild(bar);
  }
  bar.classList.toggle('busy', busy);
  bar.setAttribute('aria-label', busy ? 'Updating' : 'Update ready: update Photo Hub now');
  bar.innerHTML = busy
    ? '<span class="upd-ic" aria-hidden="true">&#9203;</span><span class="upd-t"><b>Updating...</b><small>One moment. Your photos stay.</small></span>'
    : '<span class="upd-ic" aria-hidden="true">&#10024;</span><span class="upd-t"><b>Update ready</b><small>Takes a few seconds. Your photos stay.</small></span><span class="upd-go">Update now</span>';
}

async function update() {
  if (busy) return;
  busy = true; paint();
  const mine = [...new Set(performance.getEntriesByType('resource').map((e) => e.name)
    .concat([...document.querySelectorAll('script[src], link[rel=stylesheet]')].map((el) => el.src || el.href))
    .filter((u) => { try { const x = new URL(u); return x.origin === location.origin && /\.(js|css|html|json)$/.test(x.pathname); } catch (e) { return false; } }))];
  const fresh = Promise.all(mine.map((u) => fetch(u, { cache: 'reload' }).then((r) => r.ok).catch(() => false))).then((l) => l.every(Boolean));
  const got = await Promise.race([fresh, new Promise((r) => setTimeout(() => r(false), 8000))]);
  if (!got) { busy = false; paint(); toast('Weak signal - tap Update now again when it is better'); return; }   // half new, half old files could break it
  try { sessionStorage.setItem(UPD_KEY, ready); } catch (e) { /* private mode */ }
  location.reload();
}

/** Asks the website for the newest version. -> true when it got an answer (offline / blocked -> false). Web version only. */
export async function checkNow() {
  if (isNative()) return false;
  asked = Date.now();
  try {
    const r = await fetch('./js/app.js', { cache: 'no-store' });
    if (!r.ok) return false;
    const m = (await r.text()).match(/APP_VERSION = '([\d.]+)'/);
    if (m && newer(m[1], VERSION)) { ready = m[1]; paint(); }
    return !!m;
  } catch (e) { return false; }
}
export const updateReady = () => ready;
export const canCheck = () => !isNative();

/** More -> "Check for updates". */
export async function checkFromMenu() {
  toast('Checking...');
  const ok = await checkNow();
  toast(ready ? 'Update ready: tap Update now' : ok ? `You have the newest Photo Hub (${VERSION})` : 'No connection: try again in a bit');
}

function whatsNew() {
  let seen = null;
  try { seen = localStorage.getItem(SEEN_KEY); localStorage.setItem(SEEN_KEY, VERSION); } catch (e) { return; }
  if (!seen || !newer(VERSION, seen)) return;   // a brand-new user, or nothing new
  const vers = Object.keys(NOTES).filter((v) => newer(v, seen) && !newer(v, VERSION)).sort((a, b) => (newer(a, b) ? -1 : 1));
  const list = vers.flatMap((v) => NOTES[v]);
  if (!list.length) return;
  setTimeout(() => openSheet({ icon: 'sparkles', title: `What's new in Photo Hub ${VERSION}`, list, actions: [{ label: 'Got it', primary: true }] }), 1200);
}

export function start(version) {
  VERSION = version;
  whatsNew();
  if (isNative()) return;
  try {
    const was = sessionStorage.getItem(UPD_KEY);
    if (was !== null) { sessionStorage.removeItem(UPD_KEY); if (!newer(was, VERSION)) setTimeout(() => toast(`Updated: you have the newest Photo Hub (${VERSION})`), 800); }
  } catch (e) { /* private mode: no note */ }
  document.addEventListener('visibilitychange', () => {
    if (!ready && document.visibilityState === 'visible' && navigator.onLine && Date.now() - asked > (globalThis.PH_UPD_MIN_MS ?? 60000)) checkNow();
  });
  setInterval(() => { if (!ready && document.visibilityState === 'visible') checkNow(); }, 30 * 60 * 1000);
  setTimeout(() => { if (!ready) checkNow(); }, 3000);
}
