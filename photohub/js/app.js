// app.js - C:\MarvelApps\photohub\www\js\app.js
// Photo Hub app shell: hash router, bottom bar (Home / Gallery / Albums / Cloud / More), shared photo-access state.
// Routes: #home  #gallery  #memories  #albums  #videos  #more  #storage  #places  #trips  #vault  #photos?type=all|image|video&bucket=..&fav=1&title=..
// 11/24 (Scott: "Start with steps 1 + 2"): the old Tools page is gone - nothing linked to it and it called built things "Later".

import { icons } from './icons.js';
import { getAccess } from './native/media-library.js';
import * as home from './screens/home.js';
import * as photos from './screens/photos.js';
import * as albums from './screens/albums.js';
import * as storage from './screens/storage.js';
import * as more from './screens/more.js';
import * as vault from './screens/vault.js';
import * as gallery from './screens/gallery.js';
import * as memories from './screens/memories.js';
import * as placesScreen from './screens/places.js';
import * as tripsScreen from './screens/trips.js';
import * as runner from './backup/runner.js';

export const APP_VERSION = '0.7.5';

// 11/22 new look: bottom bar Home / Gallery / Albums / Cloud / More (Scott: "your ideas are good")
const ROUTES = {
  home: { mod: home, tab: 'home' },
  gallery: { mod: gallery, tab: 'gallery' },
  memories: { mod: memories, tab: 'home' },
  albums: { mod: albums, tab: 'albums' },
  photos: { mod: photos, tab: 'gallery' },
  videos: { mod: photos, tab: 'gallery', params: { type: 'video', title: 'Videos' } },
  storage: { mod: storage, tab: 'cloud' },
  more: { mod: more, tab: 'more' },
  places: { mod: placesScreen, tab: 'albums' },   // 0.7.0 your photos by town
  trips: { mod: tripsScreen, tab: 'gallery' },    // 11/24 your trips, from where + when photos were taken
  vault: { mod: vault, tab: 'home' },   // Private Vault (11/22) - opens only with the code
};

const TABS = [
  { id: 'home', label: 'Home', icon: 'home', hash: '#home' },
  { id: 'gallery', label: 'Gallery', icon: 'image', hash: '#gallery' },
  { id: 'albums', label: 'Albums', icon: 'layers', hash: '#albums' },
  { id: 'cloud', label: 'Cloud', icon: 'cloud', hash: '#storage' },
  { id: 'more', label: 'More', icon: 'grid', hash: '#more' },
];

const state = { access: { state: 'unknown' }, cleanup: null, renderId: 0 };

export const ctx = {
  version: APP_VERSION,
  go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  },
  get access() { return state.access; },
  async refreshAccess() {
    try { state.access = await getAccess(); } catch (e) { state.access = { state: 'unavailable' }; }
    return state.access;
  },
  setAccess(a) { if (a) state.access = a; },
  rerender: () => render(),
};

function parseHash() {
  const raw = (location.hash || '#home').slice(1);
  const [name, query] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  return { name: ROUTES[name] ? name : 'home', params };
}

function renderNav(activeTab) {
  const nav = document.getElementById('nav');
  nav.innerHTML = TABS.map((t) => `<button data-hash="${t.hash}" class="${t.id === activeTab ? 'on' : ''}" aria-label="${t.label}">${icons[t.icon]}<span>${t.label}</span></button>`).join('');
}

async function render() {
  const { name, params } = parseHash();
  const route = ROUTES[name];
  if (state.cleanup) { try { state.cleanup(); } catch (e) { /* ignore */ } state.cleanup = null; }
  const app = document.getElementById('app');
  app.innerHTML = '';
  // A fresh element per screen, so listeners a screen adds go away with it (no double handlers after re-renders).
  const view = document.createElement('div');
  app.appendChild(view);
  document.querySelectorAll('.viewer, .sheet-backdrop').forEach((n) => n.remove());
  window.scrollTo(0, 0);
  const tab = route.tab;
  renderNav(tab);
  const my = ++state.renderId;
  const cleanup = (await route.mod.render(view, { ...(route.params || {}), ...params }, ctx)) || null;
  if (my !== state.renderId) { if (cleanup) cleanup(); return; } // the user already moved on to another screen
  state.cleanup = cleanup;
}

async function start() {
  document.getElementById('nav').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-hash]');
    if (b) ctx.go(b.dataset.hash);
  });
  window.addEventListener('hashchange', render);
  // Coming back from Android settings (photo access may have changed): re-check and redraw.
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    const before = state.access.state;
    const now = (await ctx.refreshAccess()).state;
    if (now !== before) render();
  });
  await ctx.refreshAccess();
  render();
  // 11/22 cloud backup: keeps going while Photo Hub is open (Auto Backup on + signed in); picked photos on the web version too
  window.addEventListener('photohub:picked', () => runner.kick());
  runner.start().catch(() => {});
}

start();
