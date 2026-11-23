// album-merge.js - C:\MarvelApps\photohub\www\js\lib\album-merge.js
// YOUR ALBUMS, KEPT IN THE CLOUD (11/22, Scott: "when you add to app album then it should move them to same album on cloud").
// ONE file used by BOTH sides: the app (lib/album-sync.js) and the cloud service (cloud/src/index.js imports this same file), so the
// rules can never drift apart.
//
// The cloud keeps one album list per person. Every change carries the time it was made; when two phones disagree, the LATER change
// wins, one item at a time (an album's name, whether it is deleted, and each photo in it). Photos are named by their SHA-256 - the
// same name the backup uses - so the cloud never needs to know a phone's own photo numbers.
//
//   doc = { v: 1,
//           albums: { <id>: { n: name, nt: when it got that name, c: made, g: when deleted (0 = not deleted),
//                             m: { <sha256>: +when put in  /  -when taken out } } },
//           meta:   { <sha256>: { d: date taken (ms), v: 1 for a video, n: file name } } }   - so another phone can list them
//
// Deleting an album never deletes a photo. A deleted album stays deleted (album ids are random, so a new album is a new id).

export const LIMITS = Object.freeze({ albums: 1000, members: 50000, name: 40, fileName: 120, bytes: 4 * 1024 * 1024 });
const ID = /^a[0-9a-z]{3,24}$/;
const SHA = /^[0-9a-f]{64}$/;
const DAY = 86400000;
export const KEEP_TOMBSTONES_MS = 180 * DAY;   // "taken out" / "deleted" marks are forgotten after 180 days

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const own = (o) => (isObj(o) ? Object.entries(o) : []);
export const cleanName = (s, max = LIMITS.name) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

// a time from a phone: a whole number, never more than a day ahead of "now" (a phone with its clock set wrong can't win forever)
function when(x, now) {
  const n = Math.round(Number(x));
  if (!Number.isFinite(n) || n === 0) return 0;
  const lim = now + DAY;
  return n > 0 ? Math.min(n, lim) : Math.max(n, -lim);
}

/** The later of two marks for one photo (+in / -out). A tie goes to "taken out". */
export function pick(a, b) {
  if (a === undefined || a === null || a === 0) return b;
  if (b === undefined || b === null || b === 0) return a;
  const x = Math.abs(a), y = Math.abs(b);
  if (y > x) return b;
  if (x > y) return a;
  return Math.min(a, b);
}

/** A safe copy of whatever arrived: bad ids, bad photo names, odd values and anything over the limits are left out. */
export function cleanDoc(doc, now = Date.now()) {
  const out = { v: 1, albums: {}, meta: {} };
  const src = isObj(doc) ? doc : {};
  let count = 0;
  for (const [id, a] of own(src.albums)) {
    if (!ID.test(id) || !isObj(a)) continue;
    if (++count > LIMITS.albums) break;
    const m = {};
    let k = 0;
    for (const [sha, t] of own(a.m)) {
      if (!SHA.test(sha)) continue;
      const v = when(t, now);
      if (!v) continue;
      if (++k > LIMITS.members) break;
      m[sha] = v;
    }
    out.albums[id] = {
      n: cleanName(a.n) || 'My album',
      nt: Math.max(0, when(a.nt, now)),
      c: Math.max(0, when(a.c, now)),
      g: Math.max(0, when(a.g, now)),
      m,
    };
  }
  for (const [sha, x] of own(src.meta)) {
    if (!SHA.test(sha) || !isObj(x)) continue;
    const d = Math.round(Number(x.d));
    out.meta[sha] = { d: Number.isFinite(d) && d > 0 ? d : 0, v: x.v ? 1 : 0, n: cleanName(x.n, LIMITS.fileName) };
  }
  return out;
}

/** Puts two album lists together, item by item, later change wins. Both must have been through cleanDoc. */
export function mergeDocs(a, b) {
  const out = { v: 1, albums: {}, meta: {} };
  const ids = new Set([...Object.keys(a.albums), ...Object.keys(b.albums)]);
  for (const id of ids) {
    const x = a.albums[id], y = b.albums[id];
    if (!x || !y) { const z = x || y; out.albums[id] = { ...z, m: { ...z.m } }; continue; }
    const named = y.nt > x.nt || (y.nt === x.nt && y.n > x.n) ? y : x;
    const m = { ...x.m };
    for (const [sha, t] of Object.entries(y.m)) m[sha] = pick(m[sha], t);
    out.albums[id] = { n: named.n, nt: named.nt, c: x.c && y.c ? Math.min(x.c, y.c) : (x.c || y.c), g: Math.max(x.g, y.g), m };
  }
  out.meta = { ...b.meta, ...a.meta };   // they describe the same bytes, so either copy is right
  return out;
}

/** The cloud's tidy-up after a merge: deleted albums lose their photo list, old "taken out" marks and old deletions are forgotten,
 *  and file details are kept only for photos that are in an album. */
export function tidyDoc(doc, now = Date.now()) {
  const out = { v: 1, albums: {}, meta: {} };
  const used = new Set();
  for (const [id, a] of Object.entries(doc.albums)) {
    if (a.g > 0) { if (now - a.g < KEEP_TOMBSTONES_MS) out.albums[id] = { n: a.n, nt: a.nt, c: a.c, g: a.g, m: {} }; continue; }
    const m = {};
    for (const [sha, t] of Object.entries(a.m)) {
      if (t < 0 && now + t > KEEP_TOMBSTONES_MS) continue;
      m[sha] = t;
      if (t > 0) used.add(sha);
    }
    out.albums[id] = { ...a, m };
  }
  for (const [sha, x] of Object.entries(doc.meta)) if (used.has(sha)) out.meta[sha] = x;
  return out;
}

/** true when both lists say exactly the same thing (the cloud only saves when something changed). */
export function sameDoc(a, b) { return stable(a) === stable(b); }
function stable(o) {
  if (Array.isArray(o)) return '[' + o.map(stable).join(',') + ']';
  if (isObj(o)) return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + stable(o[k])).join(',') + '}';
  return JSON.stringify(o);
}
