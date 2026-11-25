// sort.js - C:\MarvelApps\photohub\www\js\lib\sort.js
// TO SORT (11/25, Scott: "after a week any non labeld pic goes to proper album on cloud", then "if a pic is left untouched it sould got to
// sorting folder along with all other albums availble", "maybe grouped by date and locations"). A photo is UNTOUCHED when it is more than
// SORT_AFTER_DAYS old and you have not put it in any album or home folder, hearted it or tagged it. Untouched photos wait in To Sort,
// grouped by day and town, and one tap (hold a photo, or "Send all" for a group) puts them in Family, Personal Info, Cool Stuff or any
// album - which follows you to the cloud, the web and the PC when Cloud Backup is on. Nothing is moved or deleted on the phone.
// Worked out here on the phone (or in the browser for the web version); nothing is sent anywhere.

import { isNative, listMedia } from '../native/media-library.js';
import * as web from '../native/web-library.js';
import { isHearted, albumsWith } from './mine.js';
import { tagsOf } from './tags.js';
import * as places from './places.js';
import { formatDayLabel } from './timeline.js';

export const SORT_AFTER_DAYS = 7;
export const MAX_SHOWN = 3000;   // the newest 3,000 untouched photos at a time (the rest come up as these get sorted)
const DAY = 86400000;

/** true when a photo is waiting to be sorted. */
export function untouched(i, now = Date.now()) {
  if (!i || i.cloud || !(i.date > 0) || now - i.date < SORT_AFTER_DAYS * DAY) return false;
  return !i.favorite && !isHearted(i) && !albumsWith(i).length && !tagsOf(i).length;
}

const dayKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

/** The untouched photos, newest first: { items, more } (more = there are more than MAX_SHOWN). */
export async function untouchedItems(max = MAX_SHOWN) {
  const now = Date.now(), out = [];
  if (!isNative()) {
    const all = (await web.listMedia({ type: 'all', offset: 0, limit: 100000 })).items || [];
    for (const it of all.slice().sort((a, b) => b.date - a.date)) { if (untouched(it, now)) { out.push(it); if (out.length > max) break; } }
  } else {
    for (let off = 0, page = 0; page < 400 && out.length <= max; page++) {
      const r = await listMedia({ type: 'all', offset: off, limit: 500 });
      const got = r.items || [];
      for (const it of got) if (untouched(it, now)) out.push(it);
      off += got.length;
      if (!r.hasMore || !got.length) break;
    }
  }
  return { items: out.slice(0, max), more: out.length > max };
}

/** Groups by day and town: [{ key, day, place, label, items }], newest first. Photos with no location group by day alone. */
export async function groups(items) {
  const town = new Map();
  try { for (const x of await places.locatedItems()) town.set(String(x.item.id), x.l); } catch (e) { /* no places yet: by day only */ }
  const by = new Map();
  for (const it of items) {
    const place = town.get(String(it.id)) || '';
    const key = `${dayKey(it.date)}|${place}`;
    let g = by.get(key);
    if (!g) { g = { key, day: formatDayLabel(it.date), place, start: it.date, items: [] }; by.set(key, g); }
    g.items.push(it);
    if (it.date > g.start) g.start = it.date;
  }
  return [...by.values()].sort((a, b) => b.start - a.start).map((g) => ({ ...g, label: g.place ? `${g.day} · ${g.place}` : g.day }));
}

let cached = null;
/** How many are waiting (for the Home tile) - counted at most once a minute. -> { n, more } */
export async function count() {
  if (cached && Date.now() - cached.at < 60000) return cached.v;
  const r = await untouchedItems();
  cached = { at: Date.now(), v: { n: r.items.length, more: r.more } };
  return cached.v;
}
export function forgetCount() { cached = null; }
