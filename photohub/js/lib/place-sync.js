// place-sync.js - C:\MarvelApps\photohub\www\js\lib\place-sync.js
// TRIPS FROM THE CLOUD (11/25, Scott: "lets say you in vacation area it shows vacation list or folder of ones saved on cloud   we want it
// availbe for easy access but not all stored in phone"; "maybe grouped by date and locations").
//   push()          - sends the cloud the place of every backed-up photo this phone knows (lib/places.js read it from the photo itself),
//                     ROUNDED to about a kilometer, once per photo (the backup service: GET / POST /v1/places).
//   cloudLocated()  - the cloud photos that have a place and are NOT on this phone/browser, as items Trips can use (shown from the cloud).
// Nothing happens unless you are signed in to Cloud Backup. The backup runner gives the lookups (which photo is which cloud copy) and calls
// soon() after each backup pass and when Places has read new photos.

import * as account from './account.js';
import { cloudCall } from '../backup/cloud-target.js';
import * as places from './places.js';

let lookups = { shaForKey: () => null, itemsForSha: () => [] };
export function setLookups(l) { lookups = { ...lookups, ...l }; }

const BATCH = 2000, KEEP_MS = 10 * 60 * 1000;
let cache = null;   // { at, uid, list }
const signedIn = async () => { try { await account.init(); } catch (e) { /* no sign-in on this build */ } return account.available() && !!account.current(); };

/** Sends the places the cloud does not have yet. -> how many were sent. */
export async function push() {
  if (!(await signedIn())) return 0;
  const todo = await places.cloudPending((k) => lookups.shaForKey(k));
  let n = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const part = todo.slice(i, i + BATCH);
    const body = {};
    for (const x of part) body[x.sha] = x.ll;
    await cloudCall(account, '/v1/places', { method: 'POST', body: JSON.stringify({ places: body }) });
    await places.markCloud(part);
    n += part.length;
  }
  if (n) cache = null;
  return n;
}
let busy = null, timer = null;
/** push() a moment from now (never throws). */
export function soon(ms = 3000) {
  clearTimeout(timer);
  timer = setTimeout(() => { if (!busy) busy = push().catch(() => 0).finally(() => { busy = null; }); }, ms);
}
/** push() now and wait (Trips calls this before it lists). */
export async function pushNow() { try { await (busy || push()); } catch (e) { /* offline: Trips still shows what it has */ } }

async function allCloudPhotos() {
  const out = [];
  let cursor = '';
  for (let i = 0; i < 500; i++) {
    const j = await cloudCall(account, '/v1/photos' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
    out.push(...(j.items || []));
    if (!j.next) break;
    cursor = j.next;
  }
  return out;
}

/** Cloud photos with a place that are not here: [{ item, ll, p, l }] - kept 10 minutes. [] when signed out or offline. */
export async function cloudLocated() {
  if (!(await signedIn())) return [];
  const uid = account.current().uid;
  if (cache && cache.uid === uid && Date.now() - cache.at < KEEP_MS) return cache.list;
  const [pl, photos] = await Promise.all([cloudCall(account, '/v1/places'), allCloudPhotos()]);
  const where = (pl && pl.places) || {};
  const list = [];
  for (const ph of photos) {
    const ll = where[ph.sha256];
    if (!ll) continue;
    if ((lookups.itemsForSha(ph.sha256) || []).length) continue;   // on this phone: Places already has it
    const t = await places.townFor(ll);
    if (!t) continue;
    list.push({
      item: { id: 'c:' + ph.sha256, cloud: true, sha256: ph.sha256, type: /^video\//.test(ph.type || '') ? 'video' : 'image', mime: ph.type || '',
        name: ph.name || '', date: Number(ph.date) || Number(ph.uploaded) || 0, dateModified: 0, size: ph.size || 0, favorite: false, bucketId: 'cloud', bucketName: 'In the cloud' },
      ll, p: t.p, l: t.l,
    });
  }
  cache = { at: Date.now(), uid, list };
  return list;
}
export function forget() { cache = null; }
