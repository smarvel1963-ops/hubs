// app.js - C:\MarvelApps\photohub\www\js\app.js
// Photo Hub app shell: hash router, bottom bar (Home / Albums / Tools / Videos / More), shared photo-access state.
// Routes: #home  #albums  #tools  #videos  #more  #storage  #photos?type=all|image|video&bucket=..&fav=1&title=..

import { icons } from './icons.js';
import { getAccess } from './native/media-library.js';
import * as home from './screens/home.js';
import * as photos from './screens/photos.js';
import * as albums from './screens/albums.js';
import * as tools from './screens/tools.js';
import * as storage from './screens/storage.js';
import * as more from './screens/more.js';

export const APP_VERSION = '0.1.0 (Phase 1 skeleton)';

const ROUTES = {
  home: { mod: home, tab: 'home' },
  albums: { mod: albums, tab: 'albums' },
  photos: { mod: photos, tab: 'albums' },
  videos: { mod: photos, tab: 'videos', params: { type: 'video', title: 'Videos' } },
  tools: { mod: tools, tab: 'tools' },
  storage: { mod: storage, tab: 'tools' },
  more: { mod: more, tab: 'more' },
};

const TABS = [
  { id: 'home', label: 'Home', icon: 'home', hash: '#home' },
  { id: 'albums', label: 'Albums', icon: 'image', hash: '#albums' },
  { id: 'tools', label: 'Tools', icon: 'wand', hash: '#tools' },
  { id: 'videos', label: 'Videos', icon: 'play', hash: '#videos' },
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
  const tab = name === 'photos' && params.type === 'video' ? 'videos' : route.tab;
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
}

start();
