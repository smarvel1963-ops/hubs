// album-sync.js - C:\MarvelApps\photohub\www\js\lib\album-sync.js
// KEEPS YOUR ALBUMS THE SAME ON EVERY PHONE AND IN THE CLOUD (11/22, Scott: "so when you add to app album then it should move them to
// same album on cloud"). Put a photo in an album here and, a couple of seconds later (signed in), the cloud's copy of that album has it
// too - so it shows on the web version, on a new phone, and in the PC copy's album folders. Rename, take out and delete travel the same
// way; when two phones disagree the later change wins, item by item (lib/album-merge.js - the same rules the cloud uses).
//
// A photo goes into the cloud album once it is backed up (that is when its cloud name, the SHA-256, is known). Until then it waits on
// this phone and goes up with the next sync after its backup. Nothing here uploads or deletes a photo - albums are only lists.
//   Sends: a moment after any album change, after every backup pass, and when you sign in. Needs sign-in; does nothing signed out.

import * as account from './account.js';
import { cloudCall } from '../backup/cloud-target.js';
import { cleanDoc, pick } from './album-merge.js';
import * as mine from './mine.js';

// The backup runner tells us which cloud photo a phone photo is (and back) - from its backup journal.
let lookups = { shaForKey: () => null, itemsForSha: () => [] };
export function setLookups(l) { lookups = { ...lookups, ...l }; }

const st = { last: 0, error: '', running: false };
/** { last (ms), error, running } for the Cloud page. */
export function status() { return { ...st }; }

const metaOf = (i) => ({ d: Number(i.date) || 0, v: i.type === 'video' ? 1 : 0, n: String(i.name || '').slice(0, 120) });
const markOf = (a, key) => (a.at[key] ? (a.members.includes(key) ? a.at[key] : -a.at[key]) : undefined);
function setMark(a, key, t) {
  const i = a.members.indexOf(key);
  if (t > 0 && i < 0) a.members.push(key);
  if (t < 0 && i >= 0) a.members.splice(i, 1);
  a.at[key] = Math.abs(t);
}
function learnShas(a) {
  for (const key of Object.keys(a.at)) {
    const s = lookups.shaForKey(key);
    if (!s || s === a.sha[key]) continue;
    // 0.6.0: the photo went up again as its TRUE original (Android had blanked out where it was taken) - a new cloud name.
    // The album follows the new copy and lets go of the old one (the old copy itself is not deleted).
    if (a.sha[key]) {
      const now = Date.now();
      a.swap[a.sha[key]] = now;
      if (a.members.includes(key)) a.at[key] = now;
    }
    a.sha[key] = s;
  }
}

/** This phone's albums in the cloud's form (only photos whose cloud name is known). Exported for the tests. */
export function toDoc() {
  const { albums, gone } = mine.albumState();
  const doc = { v: 1, albums: {}, meta: {} };
  for (const a of albums) {
    learnShas(a);
    const m = {};
    for (const [key, t] of Object.entries(a.at)) {
      const sha = a.sha[key];
      if (!sha || !t) continue;
      m[sha] = pick(m[sha], a.members.includes(key) ? t : -t);
      if (!doc.meta[sha]) {
        const snap = mine.snapFor(key);
        const meta = a.meta[key] || (snap ? metaOf(snap) : null);
        if (meta) doc.meta[sha] = meta;
      }
    }
    for (const [old, t] of Object.entries(a.swap || {})) m[old] = pick(m[old], -t);
    for (const [sha, t] of Object.entries(a.cloud)) {
      m[sha] = pick(m[sha], t);
      if (!doc.meta[sha] && a.cmeta[sha]) doc.meta[sha] = a.cmeta[sha];
    }
    doc.albums[a.id] = { n: a.name, nt: a.nameAt, c: a.created, g: 0, m };
  }
  for (const [id, t] of Object.entries(gone)) {
    const x = doc.albums[id];
    doc.albums[id] = x ? { ...x, g: t } : { n: 'Deleted', nt: 0, c: 0, g: t, m: {} };
  }
  return cleanDoc(doc);
}

/** Takes the cloud's albums into this phone (later change wins). Reads the albums fresh, so a change made while the cloud was
 *  answering is kept (and goes up with the next sync). Exported for the tests. */
export function apply(cloud) {
  const { albums, gone } = mine.albumState();
  const byId = new Map(albums.map((a) => [a.id, a]));
  for (const [id, ca] of Object.entries(cloud.albums)) {
    if (ca.g > 0) {   // deleted on another phone (the photos stay where they are)
      byId.delete(id);
      gone[id] = Math.max(gone[id] || 0, ca.g);
      continue;
    }
    if (gone[id]) continue;   // deleted here and not in the cloud yet - the next sync sends it
    let a = byId.get(id);
    if (!a) {
      a = { id, name: ca.n, nameAt: ca.nt, created: ca.c || Date.now(), members: [], at: {}, sha: {}, meta: {}, cloud: {}, cmeta: {}, swap: {} };
      byId.set(id, a);
    }
    if (ca.nt > a.nameAt || (ca.nt === a.nameAt && ca.n > a.name)) { a.name = ca.n; a.nameAt = ca.nt; }
    learnShas(a);
    const keyBySha = new Map(Object.entries(a.sha).map(([k, s]) => [s, k]));
    for (const [sha, t] of Object.entries(ca.m)) {
      if (a.swap && a.swap[sha]) { a.cloud[sha] = pick(a.cloud[sha], -a.swap[sha]); continue; }   // the old copy of a re-sent photo
      let key = keyBySha.get(sha);
      if (!key) {
        const found = lookups.itemsForSha(sha)[0];   // the same photo is on this phone / picked this visit
        if (found) {
          key = mine.sigOf(found);
          a.sha[key] = sha;
          keyBySha.set(sha, key);
          mine.keepSnapFor(found);
          if (!a.meta[key]) a.meta[key] = metaOf(found);
        }
      }
      if (key) {
        let win = pick(markOf(a, key), t);
        if (a.cloud[sha] !== undefined) { win = pick(win, a.cloud[sha]); delete a.cloud[sha]; delete a.cmeta[sha]; }   // now found here
        if (win !== markOf(a, key)) setMark(a, key, win);
      } else {
        const w = pick(a.cloud[sha], t);
        a.cloud[sha] = w;
        if (w > 0 && cloud.meta[sha]) a.cmeta[sha] = cloud.meta[sha];
        if (w < 0) delete a.cmeta[sha];
      }
    }
  }
  mine.replaceAlbums([...byId.values()], gone);
}

let busy = null, again = false, timer = null;
/** Sync a moment from now (changes made close together go up as one). */
export function soon(ms = 2000) { clearTimeout(timer); timer = setTimeout(() => { sync(); }, ms); }

/** Send this phone's albums and take back the cloud's. Resolves when done (never throws - the error is in status()). */
export function sync() {
  if (busy) { again = true; return busy; }
  busy = (async () => {
    do {
      again = false;
      try { await account.init(); } catch (e) { /* no sign-in on this build */ }
      if (!account.available() || !account.current()) break;
      st.running = true;
      try {
        const j = await cloudCall(account, '/v1/albums', { method: 'POST', body: JSON.stringify({ albums: toDoc() }) });
        apply(cleanDoc(j.albums));
        st.last = Date.now();
        st.error = '';
      } catch (e) {
        st.error = (e && e.message) || String(e);
      } finally {
        st.running = false;
      }
    } while (again);
  })().finally(() => { busy = null; });
  return busy;
}

let started = false;
/** Called once by the backup runner. */
export function start() {
  if (started) return;
  started = true;
  mine.onAlbumsEdited(() => soon());
  account.onChange(() => soon(500));
}
