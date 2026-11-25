// mine.js - C:\MarvelApps\photohub\www\js\lib\mine.js
// HEARTS + YOUR OWN ALBUMS for BOTH versions (11/22 phone-app update, Scott: "yes"). Kept on the phone (localStorage).
// A photo's key: web version = file name + size + date (the same photo picked again keeps its heart); phone app = the phone's own photo id.
// The phone app also keeps a small snapshot of each hearted / album photo (id, date, name, ...) so Favorites and albums can list them
// without reading the whole library. Hearts: "a hearted photo stays on the phone" (Scott 11/22).
//
// 11/22 ALBUMS IN THE CLOUD (Scott: "when you add to app album then it should move them to same album on cloud"): each album also
// remembers WHEN each change was made (so lib/album-sync.js can put two phones together - later change wins), each photo's cloud name
// (its SHA-256, once it is backed up), and the photos that are in the album on ANOTHER phone / the web (cloud-only, shown from the cloud).
//   album = { id, name, nameAt, created, members: [key], at: {key: when put in / taken out}, sha: {key: sha256}, meta: {key: {d, v, n}},
//             cloud: {sha256: +when in / -when out}, cmeta: {sha256: {d, v, n}},
//             swap: {old sha256: when} - 0.6.0: a photo that went up again as its true original; the old copy leaves the album }
//   deleted albums: 'photohub.albums.gone' = {id: when deleted} - deleting an album never deletes a photo.

const HEARTS = 'photohub.hearts', ALBUMS = 'photohub.albums', SNAPS = 'photohub.snaps', GONE = 'photohub.albums.gone';
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };
let hearts = new Set(load(HEARTS, []));
let albums = load(ALBUMS, []).map(fixAlbum);
let gone = load(GONE, {});
let snaps = load(SNAPS, {});

// albums made before 11/22 have no change times: their photos count as put in when the album was made
function fixAlbum(a) {
  a.created = Number(a.created) || Date.now();
  a.nameAt = Number(a.nameAt) || a.created;
  a.members = Array.isArray(a.members) ? a.members : [];
  a.at = a.at && typeof a.at === 'object' ? a.at : {};
  for (const k of a.members) if (!a.at[k]) a.at[k] = a.created;
  for (const k of ['sha', 'meta', 'cloud', 'cmeta', 'swap']) if (!a[k] || typeof a[k] !== 'object') a[k] = {};
  return a;
}

export const sigOf = (i) => (i.cloud ? `c:${i.sha256}` : i.web ? `${i.name}|${i.size}|${i.lastModified}` : `n:${i.id}`);
const snapOf = (i) => ({ id: i.id, type: i.type, mime: i.mime, name: i.name, size: i.size, date: i.date, dateModified: i.dateModified, orientation: i.orientation,
  bucketId: i.bucketId, bucketName: i.bucketName, durationMs: i.durationMs, width: i.width, height: i.height, uri: i.uri });
function keepSnap(i) { if (!i.web && !i.cloud) { snaps[sigOf(i)] = snapOf(i); save(SNAPS, snaps); } }
/** album-sync: a phone photo found for a cloud album photo - keep its snapshot so the album can list it. */
export function keepSnapFor(i) { if (i && !i.web && !i.cloud && !snaps[sigOf(i)]) keepSnap(i); }
const snapItems = (sigs) => sigs.filter((s) => s.startsWith('n:')).map((s) => snaps[s]).filter(Boolean).map((x) => ({ ...x, favorite: hearts.has(`n:${x.id}`) }));
const metaOf = (i) => ({ d: Number(i.date) || 0, v: i.type === 'video' ? 1 : 0, n: String(i.name || '').slice(0, 120) });

// ---------- change listeners (album-sync sends a change to the cloud a moment after it is made) ----------
const edited = new Set();
/** cb() after a change made HERE (not after a change that came from the cloud). Returns a function that stops listening. */
export function onAlbumsEdited(cb) { edited.add(cb); return () => edited.delete(cb); }
function saveAlbums(byPerson = true) {
  save(ALBUMS, albums); save(GONE, gone);
  if (byPerson) for (const cb of edited) { try { cb(); } catch (e) { /* never block an edit */ } }
  try { globalThis.dispatchEvent(new Event('photohub:albums')); } catch (e) { /* no window (tests) */ }
}

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
  const now = Date.now();
  const a = fixAlbum({ id: 'a' + now.toString(36) + Math.random().toString(36).slice(2, 5), name: String(name).trim().slice(0, 40) || 'My album', created: now, nameAt: now, members: [] });
  albums.unshift(a); saveAlbums(); return a.id;
}
export function renameAlbum(id, name) {
  const a = albums.find((x) => x.id === id);
  if (a && String(name).trim()) { a.name = String(name).trim().slice(0, 40); a.nameAt = Date.now(); saveAlbums(); }
}
// 11/25 HOME FOLDERS (Scott: "at that home page you need to add family, personal info and cool stuff so those have easy access"): three
// albums with a FIXED id, so every phone, the web and the PC share the same three (album sync puts them together by id). Each is made the
// first time it is used, and it is never deleted (Rename / Delete are not offered for them).
export const HOME_FOLDERS = [
  { id: 'hf-family', name: 'Family', icon: 'people' },
  { id: 'hf-personal', name: 'Personal Info', icon: 'user' },
  { id: 'hf-cool', name: 'Cool Stuff', icon: 'sparkles' },
];
export const isHomeFolder = (id) => HOME_FOLDERS.some((f) => f.id === id);
/** Makes a home folder the first time it is needed; returns its id (or the id of an album that already exists). */
export function ensureAlbum(id) {
  if (albums.some((a) => a.id === id)) return id;
  const f = HOME_FOLDERS.find((x) => x.id === id);
  if (!f) return null;
  const now = Date.now();
  albums.push(fixAlbum({ id: f.id, name: f.name, created: now, nameAt: 1, members: [] }));   // nameAt 1: its own name never outvotes another phone's
  delete gone[id];
  saveAlbums();
  return id;
}

export function deleteAlbum(id) {   // the photos themselves are never touched
  if (isHomeFolder(id)) return;     // the three home folders always stay
  if (!albums.some((x) => x.id === id)) return;
  albums = albums.filter((x) => x.id !== id); gone[id] = Date.now(); saveAlbums();
}
export function albumName(id) { const a = albums.find((x) => x.id === id); return a ? a.name : ''; }
// 11/25 review: a phone photo that Clean Up freed comes back as a cloud item - it is still that album member (matched by its SHA-256)
const memberBySha = (a, sha) => a.members.find((k) => a.sha[k] === sha);
const isIn = (a, i) => (i.cloud ? (a.cloud[i.sha256] || 0) > 0 || !!memberBySha(a, i.sha256) : a.members.includes(sigOf(i)));
export function albumsWith(i) { return albums.filter((a) => isIn(a, i)).map((a) => a.id); }
export function inAlbum(id, i) { const a = albums.find((x) => x.id === id); return !!a && isIn(a, i); }
/** Puts the photo in the album or takes it out; returns true when it is now in. */
export function toggleInAlbum(id, i) {
  const a = albums.find((x) => x.id === id); if (!a) return false;
  const now = Date.now();
  if (i.cloud) {   // a photo that is only in the cloud (in this album on another phone / the web)
    const mem = memberBySha(a, i.sha256);
    if (mem) {   // 11/25: a freed phone photo - taking it out takes the member out
      a.members.splice(a.members.indexOf(mem), 1); a.at[mem] = now;
      if ((a.cloud[i.sha256] || 0) > 0) a.cloud[i.sha256] = -now;
      saveAlbums(); return false;
    }
    const inn = (a.cloud[i.sha256] || 0) > 0;
    a.cloud[i.sha256] = inn ? -now : now;
    if (!inn) a.cmeta[i.sha256] = a.cmeta[i.sha256] || metaOf(i);
    saveAlbums(); return !inn;
  }
  const s = sigOf(i), at = a.members.indexOf(s);
  if (at >= 0) a.members.splice(at, 1); else { a.members.push(s); keepSnap(i); a.meta[s] = metaOf(i); }
  a.at[s] = now;
  if (i.sha256 && !a.sha[s]) a.sha[s] = i.sha256;
  saveAlbums(); return at < 0;
}

/** 0.6.0 select many: puts all these photos in the album (one save, one cloud sync). Returns how many were not in it before. */
export function addManyToAlbum(id, items) {
  const a = albums.find((x) => x.id === id); if (!a) return 0;
  const now = Date.now();
  let n = 0;
  for (const i of items) {
    if (i.cloud) { if (!((a.cloud[i.sha256] || 0) > 0) && !memberBySha(a, i.sha256)) { a.cloud[i.sha256] = now; a.cmeta[i.sha256] = a.cmeta[i.sha256] || metaOf(i); n++; } continue; }
    const s = sigOf(i);
    if (a.members.includes(s)) continue;
    a.members.push(s); keepSnap(i); a.meta[s] = metaOf(i); a.at[s] = now; n++;
    if (i.sha256 && !a.sha[s]) a.sha[s] = i.sha256;
  }
  if (n) saveAlbums();
  return n;
}
/** 0.6.0 select many: takes these photos out of the album (the photos themselves are never touched). Returns how many. */
export function removeManyFromAlbum(id, items) {
  const a = albums.find((x) => x.id === id); if (!a) return 0;
  const now = Date.now();
  let n = 0;
  for (const i of items) {
    if (i.cloud) {
      let hit = false;
      if ((a.cloud[i.sha256] || 0) > 0) { a.cloud[i.sha256] = -now; hit = true; }
      const mem = memberBySha(a, i.sha256);   // 11/25: a freed phone photo shown from the cloud
      if (mem) { a.members.splice(a.members.indexOf(mem), 1); a.at[mem] = now; hit = true; }
      if (hit) n++;
      continue;
    }
    const s = sigOf(i), at = a.members.indexOf(s);
    if (at < 0) continue;
    a.members.splice(at, 1); a.at[s] = now; n++;
  }
  if (n) saveAlbums();
  return n;
}

/** Album photos that are only in the cloud (not on this phone / not picked this visit), as items the screens can show.
 *  present(key) says whether a member key is on hand here; a member that is not, but whose cloud name is known, shows from the cloud. */
export function cloudItems(id, present = () => true) {
  const a = albums.find((x) => x.id === id); if (!a) return [];
  const out = new Map();
  const add = (sha, m) => { if (!out.has(sha)) out.set(sha, { id: 'c:' + sha, cloud: true, sha256: sha, type: m && m.v ? 'video' : 'image', mime: '',
    name: (m && m.n) || '', date: (m && m.d) || 0, dateModified: 0, size: 0, favorite: false, bucketId: 'cloud', bucketName: 'In the cloud' }); };
  for (const [sha, t] of Object.entries(a.cloud)) if (t > 0) add(sha, a.cmeta[sha]);
  // 11/25 review: members from before 11/22 have no meta - their kept snapshot still knows the date, name and photo / video
  const fromSnap = (x) => (x ? { d: Number(x.date) || 0, v: x.type === 'video' ? 1 : 0, n: x.name || '' } : null);
  for (const k of a.members) if (!present(k) && a.sha[k]) add(a.sha[k], a.meta[k] || fromSnap(snaps[k]));
  return [...out.values()];
}
/** Phone app: an album's photos (snapshots + cloud-only ones), newest first.
 *  11/25: onPhone(key) - when given - says which members are still on the phone; one that is not (Clean Up freed it, or it was deleted)
 *  shows from the cloud when its backup is known, and is left out when it is not. */
export function albumItems(id, onPhone = null) {
  const a = albums.find((x) => x.id === id); if (!a) return [];
  const local = snapItems(a.members).filter((x) => !onPhone || onPhone(`n:${x.id}`));
  const have = new Set(local.map((x) => `n:${x.id}`));
  return local.concat(cloudItems(id, (k) => have.has(k))).sort((x, y) => y.date - x.date);
}

// ---------- album-sync only ----------
/** The albums + deletions as they are (album-sync reads them, then hands back a changed copy with replaceAlbums). */
export function albumState() { return { albums: JSON.parse(JSON.stringify(albums)), gone: { ...gone } }; }
/** Saves albums that came back from the cloud. Not a change made here, so it does not send anything back. */
export function replaceAlbums(list, goneMap) {
  const next = list.map(fixAlbum).sort((x, y) => y.created - x.created);
  if (JSON.stringify(next) === JSON.stringify(albums) && JSON.stringify(goneMap) === JSON.stringify(gone)) return false;   // nothing new: screens stay put
  albums = next;
  gone = { ...goneMap };
  saveAlbums(false);
  return true;
}
/** A photo's snapshot (phone app) - album-sync uses it for the file details it sends with an album photo. */
export function snapFor(key) { return snaps[key] || null; }

/** true when this key is hearted (web version: name|size|date). */
export function heartSig(s) { return hearts.has(s); }
/** 11/25 Duplicates: every photo you hearted or put in an album (their keys) - the copy that stays. */
export function keptKeys() { const k = new Set(hearts); for (const a of albums) for (const m of a.members) k.add(m); return [...k]; }
/** 11/25 Free Up Phone Space: only hearted photos ("Keep on phone") stay - album photos may go once safe in the cloud. */
export function heartKeys() { return [...hearts]; }
/** 11/25 ...EXCEPT an album photo whose cloud copy the album does not know yet (album sync has not put its SHA-256 in): it stays on the
 *  phone, so an album can never lose a photo it could not show from the cloud. */
export function albumKeysWithoutCloud() { const k = new Set(); for (const a of albums) for (const m of a.members) if (!a.sha[m]) k.add(m); return [...k]; }
