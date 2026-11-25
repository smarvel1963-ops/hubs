// pets.js - C:\MarvelApps\photohub\www\js\native\pets.js
// JS side of PETS (android/.../PetsPlugin.java + PetsWorker.java + PetsCore.java) - 11/25, Scott: "yes build pets". The phone app looks
// at each photo with Google's on-phone image labels and remembers dogs, cats and other pets; the photos never leave the phone. The web
// version has no pet finder (it says so).

import { isNative, getItems } from './media-library.js';

const cap = () => globalThis.Capacitor;
function plugin() {
  const c = cap();
  return isNative() && c && typeof c.isPluginAvailable === 'function' && c.isPluginAvailable('Pets') ? c.registerPlugin('Pets') : null;
}

/** true when this phone app has the pet finder (0.7.8+). */
export const available = () => !!plugin();

const NONE = { total: 0, checked: 0, dog: 0, cat: 0, other: 0, running: false, lastRun: 0 };
export async function status() { const p = plugin(); if (!p) return NONE; try { return await p.status(); } catch (e) { return NONE; } }
export async function start() { const p = plugin(); if (p) { try { await p.start(); } catch (e) { /* tried again next visit */ } } }

export const KINDS = [
  { key: 'dog', label: 'Dogs', one: 'dog photo' },
  { key: 'cat', label: 'Cats', one: 'cat photo' },
  { key: 'other', label: 'Other pets', one: 'pet photo' },
];

const cache = new Map();   // kind -> { at, items }
/** The photos of one kind ('dog' | 'cat' | 'other' | 'all'), newest first, as full items. */
export async function items(kind = 'all') {
  const c = cache.get(kind);
  if (c && Date.now() - c.at < 30000) return c.items;
  const p = plugin();
  if (!p) return [];
  const ids = ((await p.list({ kind })).ids || []).map(String);
  const out = [];
  for (let i = 0; i < ids.length; i += 500) out.push(...(await getItems(ids.slice(i, i + 500))));
  out.sort((a, b) => b.date - a.date);
  cache.set(kind, { at: Date.now(), items: out });
  return out;
}
