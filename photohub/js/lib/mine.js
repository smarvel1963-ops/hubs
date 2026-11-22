// mine.js - C:\MarvelApps\photohub\www\js\lib\mine.js
// HEARTS + YOUR OWN ALBUMS for BOTH versions (11/22 phone-app update, Scott: "yes"). Kept on the phone (localStorage).
// A photo's key: web version = file name + size + date (the same photo picked again keeps its heart); phone app = the phone's own photo id.
// The phone app also keeps a small snapshot of each hearted / album photo (id, date, name, ...) so Favorites and albums can list them
// without reading the whole library. Hearts: "a hearted photo stays on the phone" (Scott 11/22).

const HEARTS = 'photohub.hearts', ALBUMS = 'photohub.albums', SNAPS = 'photohub.snaps';
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };
let hearts = new Set(load(HEARTS, []));
let albums = load(ALBUMS, []);
let snaps = load(SNAPS, {});

export const sigOf = (i) => (i.web ? `${i.name}|${i.size}|${i.lastModified}` : `n:${i.id}`);
const snapOf = (i) => ({ id: i.id, type: i.type, mime: i.mime, name: i.name, size: i.size, date: i.date, dateModified: i.dateModified, orientation: i.orientation,
  bucketId: i.bucketId, bucketName: i.bucketName, durationMs: i.durationMs, width: i.width, height: i.height, uri: i.uri });
function keepSnap(i) { if (!i.web) { snaps[sigOf(i)] = snapOf(i); save(SNAPS, snaps); } }
const snapItems = (sigs) => sigs.filter((s) => s.startsWith('n:')).map((s) => snaps[s]).filter(Boolean).map((x) => ({ ...x, favorite: hearts.has(`n:${x.id}`) }));

// ---------- hearts ----------
export function isHearted(i) { return hearts.has(sigOf(i)); }
/** Turns the heart on / off; returns the new state. On the phone app Android's own favorites still count as favorites. */
export function toggleHeart(i) {
  const s = sigOf(i);
  if (hearts.has(s)) hearts.delete(s); else { hearts.add(s); keepSnap(i); }
  save(HEARTS, [...hearts]);
  i.favorite = hearts.has(s) || i.androidFav === true;
  return hearts.has(s);
}
/** Phone app: the hearted photos (snapshots), newest first. */
export function heartedItems() { return snapItems([...hearts]).sort((a, b) => b.date - a.date); }

// ---------- your own albums ----------
export function albumList() { return albums; }
export function createAlbum(name) {
  const a = { id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: String(name).trim().slice(0, 40) || 'My album', created: Date.now(), members: [] };
  albums.unshift(a); save(ALBUMS, albums); return a.id;
}
export function renameAlbum(id, name) { const a = albums.find((x) => x.id === id); if (a && String(name).trim()) { a.name = String(name).trim().slice(0, 40); save(ALBUMS, albums); } }
export function deleteAlbum(id) { albums = albums.filter((x) => x.id !== id); save(ALBUMS, albums); }   // the photos themselves are never touched
export function albumName(id) { const a = albums.find((x) => x.id === id); return a ? a.name : ''; }
export function albumsWith(i) { const s = sigOf(i); return albums.filter((a) => a.members.includes(s)).map((a) => a.id); }
export function inAlbum(id, i) { const a = albums.find((x) => x.id === id); return !!a && a.members.includes(sigOf(i)); }
/** Puts the photo in the album or takes it out; returns true when it is now in. */
export function toggleInAlbum(id, i) {
  const a = albums.find((x) => x.id === id); if (!a) return false;
  const s = sigOf(i), at = a.members.indexOf(s);
  if (at >= 0) a.members.splice(at, 1); else { a.members.push(s); keepSnap(i); }
  save(ALBUMS, albums); return at < 0;
}
/** Phone app: an album's photos (snapshots), newest first. */
export function albumItems(id) { const a = albums.find((x) => x.id === id); return a ? snapItems(a.members).sort((x, y) => y.date - x.date) : []; }

/** true when this key is hearted (web version: name|size|date). */
export function heartSig(s) { return hearts.has(s); }
