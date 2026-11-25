// tags.js - C:\MarvelApps\photohub\www\js\lib\tags.js
// TAGS (Scott 11/24 "he will finish photo app" -> plan step 3, docs/UNFINISHED_PAGES_2026-11-24.md): your own words on photos -
// "beach", "grandkids", "receipts" - kept on this phone (localStorage), like hearts and your own albums. A photo's key is the same one
// hearts and albums use (lib/mine.js sigOf). The phone app also keeps a small snapshot of each tagged photo so a tag can list its photos
// without reading the whole library; the web version finds them among the photos picked this visit.
//   'photohub.tags' = { key: ['beach', 'grandkids'] }   - tags are lower-case, 1-30 letters, numbers, spaces or dashes, at most 20 a photo.

import { sigOf, keepSnapFor, snapFor } from './mine.js';

const TAGS = 'photohub.tags';
const load = () => { try { const v = JSON.parse(localStorage.getItem(TAGS)); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } };
let tags = load();
const save = () => { try { localStorage.setItem(TAGS, JSON.stringify(tags)); } catch (e) { /* private mode */ } };

/** "  Beach!! " -> "beach"; "" when nothing is left. */
export function cleanTag(t) {
  return String(t || '').toLowerCase().replace(/[^a-z0-9 \-']+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30);
}
/** The words someone typed ("beach, grandkids  summer 2025") -> tags. Commas split; one tag can have spaces. */
export function parseTags(text) {
  return [...new Set(String(text || '').split(/[,;\n]+/).map(cleanTag).filter(Boolean))];
}

export function tagsOf(i) { return tags[sigOf(i)] ? [...tags[sigOf(i)]] : []; }
/** Adds these tags to the photo; returns its tags. */
export function addTags(i, list) {
  const k = sigOf(i), have = new Set(tags[k] || []);
  for (const t of list.map(cleanTag).filter(Boolean)) if (have.size < 20) have.add(t);
  if (have.size) { tags[k] = [...have].sort(); keepSnapFor(i); } else delete tags[k];
  save(); changed(); return tagsOf(i);
}
export function removeTag(i, tag) {
  const k = sigOf(i); if (!tags[k]) return [];
  tags[k] = tags[k].filter((t) => t !== tag);
  if (!tags[k].length) delete tags[k];
  save(); changed(); return tagsOf(i);
}
/** Puts one tag on many photos (select many); returns how many did not have it. */
export function tagMany(items, tag) {
  const t = cleanTag(tag); if (!t) return 0;
  let n = 0;
  for (const i of items) { const k = sigOf(i); const have = tags[k] || []; if (have.includes(t) || have.length >= 20) continue; tags[k] = [...have, t].sort(); keepSnapFor(i); n++; }
  if (n) { save(); changed(); }
  return n;
}
/** Every tag with how many photos carry it, most used first. */
export function allTags() {
  const count = new Map();
  for (const list of Object.values(tags)) for (const t of list) count.set(t, (count.get(t) || 0) + 1);
  return [...count].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag));
}
/** Does this photo carry a tag containing these words (search)? */
export function tagMatch(i, q) { const s = String(q || '').toLowerCase().trim(); return !!s && tagsOf(i).some((t) => t.includes(s)); }
/** The keys carrying a tag. */
export function keysWith(tag) { return Object.keys(tags).filter((k) => tags[k].includes(tag)); }
/** Phone app: the tagged photos as items (from the kept snapshots), newest first. */
export function taggedSnapItems(tag) {
  return keysWith(tag).filter((k) => k.startsWith('n:')).map((k) => snapFor(k)).filter(Boolean).sort((a, b) => b.date - a.date);
}

function changed() { try { globalThis.dispatchEvent(new Event('photohub:tags')); } catch (e) { /* no window (tests) */ } }
