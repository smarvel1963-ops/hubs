// sort.js - C:\MarvelApps\photohub\www\js\lib\sort.js
// PHOTO INBOX + TO SORT (11/25). Scott: "after a week any non labeld pic goes to proper album on cloud", "if a pic is left untouched it
// sould got to sorting folder along with all other albums availble", "maybe grouped by date and locations", then "all photos when taken or
// arrive through texts should go to are called photo inbox not just in any random folder unless assigned" and "should also have warning
// if in box is going to empty to cloud on such and such date".
//   UNASSIGNED = not in any album or home folder, not hearted, not tagged (wherever the phone put it - camera, texts, downloads).
//   PHOTO INBOX = unassigned photos from the last INBOX_DAYS (a week). Each one LEAVES the Inbox on leavesOn() = its date + a week.
//   UNSORTED PHOTOS (was "To Sort"; Scott: "the folder on cloud everything non sorted goes to should be unsorted photos label")
//               = unassigned photos older than that (kept in your cloud backup when Cloud Backup is on; Free Up Phone Space can then
//                 clear them from the phone - Android always asks first, nothing leaves the phone on its own).
// Grouped by day and town; one tap (hold a photo, or "Send all") puts them in Family, Personal Info, Cool Stuff or any album.
// Worked out here on the phone (or in the browser for the web version); nothing is sent anywhere.

import { isNative, listMedia } from '../native/media-library.js';
import * as web from '../native/web-library.js';
import { isHearted, albumsWith } from './mine.js';
import { tagsOf } from './tags.js';
import * as places from './places.js';
import { formatDayLabel } from './timeline.js';

export const SORT_AFTER_DAYS = 7;
export const INBOX_DAYS = SORT_AFTER_DAYS;
export const MAX_SHOWN = 3000;   // the newest 3,000 at a time (the rest come up as these get sorted)
const DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** When the photo came to this phone - the camera, a text, a download (the phone's "date added"; the web version: the file's date).
 *  A photo texted to you today with an old "taken" date still arrives today, so it starts in the Inbox. */
export const arrived = (i) => Number(i && i.dateAdded) || (i && i.date) || 0;

/** Not put anywhere by you (album / folder / heart / tag). */
export function unassigned(i) {
  if (!i || i.cloud || !(i.date > 0)) return false;
  return !i.favorite && !isHearted(i) && !albumsWith(i).length && !tagsOf(i).length;
}
/** In the Photo Inbox: unassigned and less than a week old. */
export function inInbox(i, now = Date.now()) { return unassigned(i) && now - arrived(i) < INBOX_DAYS * DAY; }
/** In To Sort: unassigned and a week old or more. */
export function untouched(i, now = Date.now()) { return unassigned(i) && now - arrived(i) >= SORT_AFTER_DAYS * DAY; }
/** When a photo leaves the Inbox for To Sort. */
export const leavesOn = (i) => arrived(i) + INBOX_DAYS * DAY;
/** "Wed, Dec 2" */
export function shortDay(ms) { const d = new Date(ms); return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`; }

const dayKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

async function scan(want, max) {
  const now = Date.now(), out = [];
  if (!isNative()) {
    const all = (await web.listMedia({ type: 'all', offset: 0, limit: 100000 })).items || [];
    for (const it of all.slice().sort((a, b) => arrived(b) - arrived(a))) { if (want(it, now)) { out.push(it); if (out.length > max) break; } }
    return out;
  }
  for (let off = 0, page = 0; page < 400 && out.length <= max; page++) {
    const r = await listMedia({ type: 'all', offset: off, limit: 500 });
    const got = r.items || [];
    for (const it of got) if (want(it, now)) out.push(it);
    off += got.length;
    if (!r.hasMore || !got.length) break;   // the whole library: the phone lists by date TAKEN, and an old photo can arrive today
  }
  return out.sort((a, b) => arrived(b) - arrived(a));
}

/** To Sort, newest first: { items, more } (more = there are more than MAX_SHOWN). */
export async function untouchedItems(max = MAX_SHOWN) {
  const out = await scan(untouched, max);
  return { items: out.slice(0, max), more: out.length > max };
}
/** The Photo Inbox, newest arrival first: { items, more }. */
export async function inboxItems(max = MAX_SHOWN) {
  const out = await scan(inInbox, max);
  return { items: out.slice(0, max), more: out.length > max };
}

/** The next time photos leave the Inbox: { at, n, total } - the earliest leaving day and how many leave that day (null when empty). */
export function nextLeave(items) {
  if (!items.length) return null;
  const first = Math.min(...items.map(leavesOn));
  const k = dayKey(first);
  return { at: first, n: items.filter((i) => dayKey(leavesOn(i)) === k).length, total: items.length };
}
/** "3 photos leave your Inbox for Unsorted Photos in the cloud on Wed, Dec 2" (toCloud: Cloud Backup is on). */
export function leaveText(next, toCloud) {
  if (!next) return '';
  const when = dayKey(next.at) === dayKey(Date.now()) ? 'today' : dayKey(next.at) === dayKey(Date.now() + DAY) ? 'tomorrow' : `on ${shortDay(next.at)}`;
  return `${next.n} ${next.n === 1 ? 'photo leaves' : 'photos leave'} your Inbox for Unsorted Photos${toCloud ? ' in the cloud' : ''} ${when}`;
}

/** Groups by day and town: [{ key, day, place, label, start, items }], newest first. Photos with no location group by day alone. */
export async function groups(items) {
  const town = new Map();
  try { for (const x of await places.locatedItems()) town.set(String(x.item.id), x.l); } catch (e) { /* no places yet: by day only */ }
  const by = new Map();
  for (const it of items) {
    const place = town.get(String(it.id)) || '';
    const when = arrived(it);   // grouped by the day it came to the phone
    const key = `${dayKey(when)}|${place}`;
    let g = by.get(key);
    if (!g) { g = { key, day: formatDayLabel(when), place, start: when, items: [] }; by.set(key, g); }
    g.items.push(it);
    if (when > g.start) g.start = when;
  }
  return [...by.values()].sort((a, b) => b.start - a.start).map((g) => ({ ...g, label: g.place ? `${g.day} · ${g.place}` : g.day }));
}

const cache = {};
async function cached(key, fn) {
  if (cache[key] && Date.now() - cache[key].at < 60000) return cache[key].v;
  const v = await fn();
  cache[key] = { at: Date.now(), v };
  return v;
}
/** How many wait in To Sort (Home / the Inbox link) - counted at most once a minute. -> { n, more } */
export function count() { return cached('sort', async () => { const r = await untouchedItems(); return { n: r.items.length, more: r.more }; }); }
/** The Photo Inbox for Home: { n, more, next } - counted at most once a minute. */
export function inboxCount() { return cached('inbox', async () => { const r = await inboxItems(); return { n: r.items.length, more: r.more, next: nextLeave(r.items) }; }); }
export function forgetCount() { for (const k of Object.keys(cache)) delete cache[k]; }
