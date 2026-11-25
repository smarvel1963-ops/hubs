// trips.js - C:\MarvelApps\photohub\www\js\lib\trips.js
// TRIPS (11/24, plan step 3 - Scott "he will finish photo app"): your trips found from WHERE and WHEN your photos were taken - no AI, nothing
// sent anywhere. It reads the same on-the-phone locations as Places (lib/places.js):
//   home  = the town with the most of your photos;
//   away  = a photo taken more than AWAY_KM from home;
//   a trip = away photos no more than GAP_DAYS apart, at least MIN_PHOTOS of them. Its name is the town with the most of its photos
//            ("Cozumel, Mexico", or "Cozumel, Mexico + 2 more" when it went to more towns), with its dates.
// Photos with no location are not in a trip (Places can't see them either).

import * as places from './places.js';

export const AWAY_KM = 50, GAP_DAYS = 2, MIN_PHOTOS = 3;
const DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function km(a, b) {
  const R = 6371, r = (d) => (d * Math.PI) / 180;
  const dLa = r(b[0] - a[0]), dLo = r(b[1] - a[1]);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/** "Nov 3 - 7, 2026", "Oct 30 - Nov 2, 2026", "Dec 30, 2025 - Jan 2, 2026", or one day "Nov 3, 2026". */
export function dateRange(start, end) {
  const a = new Date(start), b = new Date(end);
  const md = (d) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  if (a.toDateString() === b.toDateString()) return `${md(a)}, ${a.getFullYear()}`;
  if (a.getFullYear() !== b.getFullYear()) return `${md(a)}, ${a.getFullYear()} - ${md(b)}, ${b.getFullYear()}`;
  if (a.getMonth() === b.getMonth()) return `${md(a)} - ${b.getDate()}, ${a.getFullYear()}`;
  return `${md(a)} - ${md(b)}, ${a.getFullYear()}`;
}

/** Your trips, the newest first: [{ id, name, towns, start, end, when, count, cover, items }] (items newest first). */
export async function list() {
  const all = (await places.locatedItems()).filter((x) => x.ll && x.item && x.item.date);
  if (!all.length) return [];
  const count = new Map();
  for (const x of all) count.set(x.p, (count.get(x.p) || 0) + 1);
  const homeKey = [...count].sort((a, b) => b[1] - a[1])[0][0];
  const homeAt = all.find((x) => x.p === homeKey).ll;
  const away = all.filter((x) => x.p !== homeKey && km(x.ll, homeAt) > AWAY_KM).sort((a, b) => a.item.date - b.item.date);
  const groups = [];
  let cur = null;
  for (const x of away) {
    if (cur && x.item.date - cur.end <= GAP_DAYS * DAY) { cur.list.push(x); cur.end = x.item.date; }
    else { cur = { start: x.item.date, end: x.item.date, list: [x] }; groups.push(cur); }
  }
  return groups.filter((g) => g.list.length >= MIN_PHOTOS).map((g) => {
    const by = new Map();
    for (const x of g.list) by.set(x.l, (by.get(x.l) || 0) + 1);
    const towns = [...by].sort((a, b) => b[1] - a[1]).map(([l]) => l);
    const items = g.list.map((x) => x.item).sort((a, b) => b.date - a.date);
    return { id: `${new Date(g.start).toISOString().slice(0, 10)}-${slug(towns[0])}`, name: towns.length > 1 ? `${towns[0]} + ${towns.length - 1} more` : towns[0],
      towns, start: g.start, end: g.end, when: dateRange(g.start, g.end), count: items.length, cover: items[Math.floor(items.length / 2)], items };
  }).sort((a, b) => b.start - a.start);
}
export async function find(id) { return (await list()).find((t) => t.id === id) || null; }
