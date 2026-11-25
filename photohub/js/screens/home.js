// home.js - C:\MarvelApps\photohub\www\js\screens\home.js
// HOME, new look 11/22 (Scott's design "Home Dashboard" + "your ideas are good"): bright header with your newest photos, then big colorful
// tiles - Memories, Family Albums, Favorites, Private Vault, Cloud Backup. Tiles show YOUR photos once you have picked some (never a
// vault photo); before that, colors and icons only. No made-up numbers: counts are real. 11/24 (Scott: "Start with steps 1 + 2" after
// "photo app has lots unfinished pages"): the tiles not built yet (AI Editing) and the bell are hidden until they are (Vacation Trips came back the same night, built),
// and the person button opens the Cloud page, where Google sign-in lives. 11/25 (plan step 4): the bell is back - it opens Notifications
// (#alerts) and shows a dot when there is a new note or today's memory not seen yet.

import { icons, logoSvg } from '../icons.js';
import { esc, askForPhotoAccess } from '../ui.js';
import { canRead, listMedia, getLibrarySummary, thumbnailUrl, myAlbums } from '../native/media-library.js';
import { HOME_FOLDERS, ensureAlbum } from '../lib/mine.js';
import * as sorting from '../lib/sort.js';
import { formatCount } from '../lib/timeline.js';
import { onThisDay } from './memories.js';
import { hasNew } from './alerts.js';

const TILES = [
  { key: 'memories', cls: 't-sunset', icon: 'calHeart', label: 'Memories', go: '#memories' },
  { key: 'family', cls: 't-teal', icon: 'image', label: 'All Albums', go: '#albums' },   // 11/25 was 'Family Albums' - Family is its own folder now (row above)
  { key: 'trips', cls: 't-ocean', icon: 'plane', label: 'Vacation Trips', go: '#trips' },   // 11/24 built (lib/trips.js)
  { key: 'fav', cls: 't-rose', icon: 'heart', label: 'Favorites', go: '#photos?type=all&fav=1&title=Favorites' },
  { key: 'vault', cls: 't-violet', icon: 'lock', label: 'Private Vault', go: '#vault' },
];

export async function render(root, params, ctx) {
  let alive = true;
  const access = ctx.access;
  const readable = canRead(access);

  root.innerHTML = `<div class="screen home2">
    <header class="hero2">
      <div class="hero2-bg" id="heroBg"></div>
      <div class="hero2-top">
        <button class="icon-btn" data-go="#more" aria-label="Menu">${icons.menu}</button>
        <div class="brand2">${logoSvg}<span>Photo Hub</span></div>
        <button class="icon-btn bell" id="bell" data-go="#alerts" aria-label="Notifications">${icons.bell}<i class="dot" hidden></i></button>
        <button class="icon-btn" data-go="#storage" aria-label="Account and Cloud Backup">${icons.user}</button>
      </div>
      <div class="hero2-text"><b>Your Photos, Safe &amp; Organized</b>
        <span class="counts"><span data-count="all">--</span> · <span data-count="video">--</span> · <span data-count="fav">--</span></span></div>
      <div class="collage">${[0, 1, 2].map(() => `<div class="frame"><div class="pic">${icons.image}</div></div>`).join('')}</div>
    </header>

    <button class="search2" data-go="#gallery">${icons.search}<span>Search your photos...</span></button>

    ${readable ? (access.web ? `<button class="row" id="grant">
        <span class="ico">${icons.image}</span>
        <span class="txt"><b>Pick more photos</b><span>Add more from your phone - they stay on your phone.</span></span>
        ${icons.chevron}</button>` : '') : `<button class="row" id="grant">
        <span class="ico">${icons.image}</span>
        <span class="txt"><b>See your photos here</b><span>${access.web ? 'Pick photos to try it - they stay on your phone.' : access.state === 'unavailable' ? 'Open Photo Hub on your Android phone to see your photos.' : 'Allow photo access to see them here.'}</span></span>
        ${icons.chevron}</button>`}

    <!-- 11/25 (Scott: "at that home page you need to add family, personal info and cool stuff so those have easy access"): the three home
         folders + To Sort (photos nobody sorted for a week), one tap each -->
    <div class="hfolders">
      ${HOME_FOLDERS.map((f, i) => `<button class="hfolder hf${i}" data-folder="${esc(f.id)}"><span class="hf-ico">${icons[f.icon]}</span>
        <b>${esc(f.name)}</b><span class="hf-n" data-hfn="${esc(f.id)}"></span></button>`).join('')}
      <button class="hfolder hf-sort" data-go="#sort"><span class="hf-ico">${icons.inbox}</span><b>To Sort</b><span class="hf-n" id="sortN"></span></button>
    </div>

    <div id="memStrip"></div>

    <div class="tiles2">
      ${TILES.map((t) => `<button class="tile2 ${t.cls}" data-tile="${t.key}" data-go="${esc(t.go)}">
          <span class="t2-ico">${icons[t.icon]}</span><span class="t2-lbl">${esc(t.label)}</span>
          <span class="t2-pic"></span></button>`).join('')}
      <button class="tile2 wide t-green" data-tile="cloud" data-go="#storage">
        <span class="t2-ico">${icons.cloudUp}</span><span class="t2-lbl">Cloud Backup</span><span class="t2-sub">Back up your photos and albums</span><span class="t2-pics" id="cloudPics"></span></button>
    </div>
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
    if (t.dataset.folder) {   // a home folder: made the first time it is opened, then its photos
      const f = HOME_FOLDERS.find((x) => x.id === t.dataset.folder);
      ensureAlbum(f.id);
      ctx.go(`#photos?type=all&album=${encodeURIComponent(f.id)}&title=${encodeURIComponent(f.name)}`);
      return;
    }
    if (t.dataset.go) ctx.go(t.dataset.go);
  });
  // how many photos are in each home folder (real counts; nothing shown for an empty one)
  for (const a of myAlbums()) { const n = root.querySelector(`[data-hfn="${CSS.escape(a.id)}"]`); if (n && a.total) n.textContent = formatCount(a.total); }

  const bellDot = (memToday) => hasNew(memToday).then((n) => { const d = root.querySelector('#bell .dot'); if (alive && d) d.hidden = !n; }).catch(() => {});
  if (!readable) { bellDot(false); return () => { alive = false; }; }
  sorting.count().then((c) => { const n = root.querySelector('#sortN'); if (alive && n && c.n) n.textContent = `${formatCount(c.n)}${c.more ? '+' : ''}`; }).catch(() => {});

  const setPic = async (sel, item, cls = '') => {
    if (!item) return;
    const url = await thumbnailUrl(item);
    const el = root.querySelector(sel);
    if (alive && url && el) el.innerHTML = `<img alt="" class="${cls}" src="${esc(url)}">`;
  };

  getLibrarySummary().then((s) => {
    if (!alive) return;
    const set = (k, v) => { const n = root.querySelector(`[data-count="${k}"]`); if (n) n.textContent = v; };
    set('all', `${formatCount(s.photos.count + s.videos.count)} items`);
    set('video', `${formatCount(s.videos.count)} videos`);
    set('fav', s.favorites === null || s.favorites === undefined ? 'Favorites: Android 11+' : `${formatCount(s.favorites)} on your phone`);
  }).catch(() => {});

  // newest photos: the header + the collage + the Cloud tile; an older one for Memories; hearts for Favorites
  const r = await listMedia({ type: 'image', limit: 60, offset: 0 }).catch(() => ({ items: [] }));
  if (!alive) return null;
  const imgs = r.items || [];
  const frames = [...root.querySelectorAll('.collage .pic')];
  for (let i = 0; i < 3 && i < imgs.length; i++) {
    const url = await thumbnailUrl(imgs[i]);
    if (alive && url) frames[i].innerHTML = `<img alt="" src="${esc(url)}">`;
  }
  if (imgs[0]) {
    const url = await thumbnailUrl(imgs[0]);
    const bg = root.querySelector('#heroBg');
    if (alive && url && bg) bg.style.backgroundImage = `url("${url}")`;
  }
  setPic('[data-tile="memories"] .t2-pic', imgs[imgs.length - 1]);
  setPic('[data-tile="family"] .t2-pic', imgs[1] || imgs[0]);
  import('../lib/trips.js').then((m) => m.list()).then((ts) => { if (ts[0]) setPic('[data-tile="trips"] .t2-pic', ts[0].cover); }).catch(() => {});
  listMedia({ type: 'all', favoritesOnly: true, limit: 1, offset: 0 }).then((f) => setPic('[data-tile="fav"] .t2-pic', f.items[0])).catch(() => {});
  const cp = root.querySelector('#cloudPics');
  for (const it of imgs.slice(0, 3)) {
    const url = await thumbnailUrl(it);
    if (alive && url && cp) cp.insertAdjacentHTML('beforeend', `<img alt="" src="${esc(url)}">`);
  }

  // On this day (Scott 11/22: "one drive brings up memories on certain dates each day like 1 year 5 years")
  const mem = await onThisDay().catch(() => []);
  bellDot(mem.some((g) => g.exact));
  if (alive && mem.length) {
    const g = mem[0];
    const strip = root.querySelector('#memStrip');
    strip.innerHTML = `<button class="mem-strip" data-go="#memories"><span class="mem-k">${icons.calHeart} On this day</span>
      <b>${esc(g.label)}</b><span class="mem-pics"></span>${icons.chevron}</button>`;
    const pics = strip.querySelector('.mem-pics');
    for (const it of g.items.slice(0, 4)) {
      const url = await thumbnailUrl(it);
      if (alive && url) pics.insertAdjacentHTML('beforeend', `<img alt="" src="${esc(url)}">`);
    }
  }

  return () => { alive = false; };
}
