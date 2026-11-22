// home.js - C:\MarvelApps\photohub\www\js\screens\home.js
// Home screen after board 4: header, hero, search bar, 8 tiles, Smart Albums row, AI Photo Tools card.
// Real: Videos tile, Smart Albums tile, Backup & Sync tile, and the All Photos / Favorites / Videos album cards
// (counts + covers come from the phone once photo access is given; "--" before). Everything else opens the
// "Coming in a later phase" sheet - no mockup numbers.

import { icons, logoSvg } from '../icons.js';
import { esc, comingLater, askForPhotoAccess } from '../ui.js';
import { canRead, listMedia, getLibrarySummary, thumbnailUrl } from '../native/media-library.js';
import { formatCount } from '../lib/timeline.js';

const TILES = [
  { cls: 't-blue', icon: 'image', label: 'Smart<br>Albums', go: '#albums' },
  { cls: 't-purple', icon: 'copies', label: 'Duplicate<br>Cleanup', later: 'duplicates' },
  { cls: 't-green', icon: 'wand', label: 'Restore &amp;<br>Enhance', later: 'restore' },
  { cls: 't-gold', icon: 'play', label: 'Videos<br>Manage', go: '#videos' },
  { cls: 't-violet', icon: 'lock', label: 'Private<br>Vault', go: '#vault' },   // 11/22: built - opens with your code
  { cls: 't-pink', icon: 'calHeart', label: 'Memories<br>&amp; Highlights', later: 'memories' },
  { cls: 't-sky', icon: 'cloudUp', label: 'Backup<br>&amp; Sync', go: '#storage' },
  { cls: 't-teal', icon: 'share', label: 'Share<br>&amp; Create', later: 'share' },
];

const REAL_ALBUMS = [
  { key: 'all', name: 'All Photos', icon: 'image', hash: '#photos?type=all&title=All%20Photos', query: { type: 'all' } },
  { key: 'fav', name: 'Favorites', icon: 'heart', hash: '#photos?type=all&fav=1&title=Favorites', query: { type: 'all', favoritesOnly: true } },
  { key: 'video', name: 'Videos', icon: 'play', hash: '#videos', query: { type: 'video' } },
];
const LATER_ALBUMS = [
  { key: 'people', name: 'People', icon: 'people' },
  { key: 'places', name: 'Places', icon: 'pin' },
  { key: 'pets', name: 'Pets', icon: 'paw' },
  { key: 'events', name: 'Events', icon: 'cake' },
];

export async function render(root, params, ctx) {
  let alive = true;
  const access = ctx.access;
  const readable = canRead(access);

  root.innerHTML = `<div class="screen">
    <header class="topbar">
      <button class="icon-btn" data-go="#more" aria-label="Menu">${icons.menu}</button>
      <div class="brand">${logoSvg}<div><div class="name">Photo <b>Hub</b></div><div class="sub">by Marvel Corp</div></div></div>
      <button class="icon-btn round" data-later="alerts" aria-label="Notifications">${icons.bell}</button>
      <button class="icon-btn avatar" data-later="account" aria-label="Account">${icons.user}</button>
    </header>

    <section class="hero">
      <h1>Your Photos,<br>Safe &amp; Organized</h1>
      <ul>
        <li>${icons.check}Favorites stay on your phone</li>
        <li>${icons.check}Every upload checked</li>
        <li>${icons.check}Never deletes without you</li>
      </ul>
      <div class="collage">${[0, 1, 2].map(() => `<div class="frame"><div class="pic">${icons.image}</div></div>`).join('')}</div>
    </section>

    <button class="search" data-later="search">${icons.search}<span>Search your photos, people, places, or things...</span>${icons.scan}</button>

    <div class="tiles">
      ${TILES.map((t, i) => `<button class="tile ${t.cls}" data-i="${i}">${icons[t.icon]}<span>${t.label}</span>${t.later ? '<span class="tag">Later</span>' : ''}</button>`).join('')}
    </div>

    ${readable ? (access.web ? `<button class="row" id="grant">
        <span class="ico">${icons.image}</span>
        <span class="txt"><b>Pick more photos</b><span>Add more from your phone - they stay on your phone.</span></span>
        ${icons.chevron}</button>` : '') : `<button class="row" id="grant">
        <span class="ico">${icons.image}</span>
        <span class="txt"><b>See your photos here</b><span>${access.web ? 'Pick photos to try it - they stay on your phone.' : access.state === 'unavailable' ? 'Open Photo Hub on your Android phone to see your photos.' : 'Allow photo access - Photo Hub only reads them.'}</span></span>
        ${icons.chevron}</button>`}

    <section class="card">
      <div class="card-head">${icons.image}<h2>Smart Albums</h2><button class="link" data-go="#albums">See All ${icons.chevron}</button></div>
      <div class="album-row">
        ${REAL_ALBUMS.map((a) => `<button class="album-card" data-album="${a.key}" data-go="${a.hash}">
            <span class="ph">${icons[a.icon]}</span>
            <span class="meta"><b>${esc(a.name)}</b><span data-count="${a.key}">--</span></span></button>`).join('')}
        ${LATER_ALBUMS.map((a) => `<button class="album-card later" data-later="${a.key}">
            <span class="ph">${icons[a.icon]}</span>
            <span class="meta"><b>${esc(a.name)}</b><span>Later phase</span></span></button>`).join('')}
      </div>
    </section>

    <section class="card ai-card">
      <div class="ai-badge">AI</div>
      <div class="txt"><b>AI Photo Tools</b><p>Organize, clean up, restore, and bring old photos to life.</p></div>
      <button class="pill-btn" data-go="#tools">Explore Tools ${icons.chevron}</button>
    </section>
  </div>`;

  root.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.id === 'grant') {
      if (access.state === 'unavailable') return;
      const a = await askForPhotoAccess(ctx.access);
      ctx.setAccess(a);
      if (canRead(a)) ctx.rerender();
      return;
    }
    if (t.dataset.i !== undefined) {
      const tile = TILES[Number(t.dataset.i)];
      if (tile.go) ctx.go(tile.go); else comingLater(tile.later);
      return;
    }
    if (t.dataset.later) { comingLater(t.dataset.later); return; }
    if (t.dataset.go) ctx.go(t.dataset.go);
  });

  if (!readable) return () => { alive = false; };

  // Real numbers + covers from the phone.
  getLibrarySummary().then((s) => {
    if (!alive) return;
    const set = (k, v) => { const n = root.querySelector(`[data-count="${k}"]`); if (n) n.textContent = v; };
    set('all', `${formatCount(s.photos.count + s.videos.count)} items`);
    set('video', `${formatCount(s.videos.count)} videos`);
    set('fav', access.web ? 'In the phone app' : s.favorites === null || s.favorites === undefined ? 'Needs Android 11+' : `${formatCount(s.favorites)} photos`);
  }).catch(() => {});

  const frames = [...root.querySelectorAll('.collage .pic')];
  listMedia({ type: 'image', limit: 3, offset: 0 }).then(async (r) => {
    for (let i = 0; i < r.items.length && i < frames.length; i++) {
      const url = await thumbnailUrl(r.items[i]);
      if (alive && url) frames[i].innerHTML = `<img alt="" src="${esc(url)}">`;
    }
  }).catch(() => {});

  for (const a of REAL_ALBUMS) {
    listMedia({ ...a.query, limit: 1, offset: 0 }).then(async (r) => {
      if (!alive || !r.items.length) return;
      const url = await thumbnailUrl(r.items[0]);
      const card = root.querySelector(`[data-album="${a.key}"]`);
      if (alive && url && card) card.insertAdjacentHTML('afterbegin', `<img alt="" src="${esc(url)}">`);
    }).catch(() => {});
  }

  return () => { alive = false; };
}
