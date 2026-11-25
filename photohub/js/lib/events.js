// events.js - C:\MarvelApps\photohub\www\js\lib\events.js
// EVENTS (11/25, plan step 6 - Scott 11/24 via Desktop: "he will finish photo app"): your big days - a day you took at least MIN_PHOTOS
// photos and videos (a birthday, a game, a party, a wedding). Found from each photo's own date taken - no AI, no faces, nothing sent
// anywhere. Named by the day ("Sat, Jun 14, 2025"); the newest first.

import { listMedia } from '../native/media-library.js';

export const MIN_PHOTOS = 20;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dayName = (d) => `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

let cache = null, cacheAt = 0;

/** -> [{ id: 'YYYY-MM-DD', name, count, photos, videos, cover, items }] newest first (items newest first). */
export async function list({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cacheAt < 60000) return cache;
  const by = new Map();
  for (let off = 0, i = 0; i < 400; i++) {
    const r = await listMedia({ type: 'all', offset: off, limit: 500 });
    const got = r.items || [];
    for (const it of got) {
      if (!it.date) continue;
      const k = dayKey(new Date(it.date));
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(it);
    }
    off += got.length;
    if (!r.hasMore || !got.length) break;
  }
  const out = [];
  for (const [k, items] of by) {
    if (items.length < MIN_PHOTOS) continue;
    items.sort((a, b) => b.date - a.date);
    const videos = items.filter((x) => x.type === 'video').length;
    out.push({ id: k, name: dayName(new Date(items[0].date)), count: items.length, photos: items.length - videos, videos,
      cover: items.find((x) => x.type !== 'video') || items[0], items });
  }
  out.sort((a, b) => (a.id < b.id ? 1 : -1));
  cache = out; cacheAt = Date.now();
  return out;
}
export async function find(id) { return (await list()).find((e) => e.id === id) || null; }
