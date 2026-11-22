// photos.js - C:\MarvelApps\photohub\www\js\screens\photos.js
// Photos timeline: the phone's REAL photos and videos, newest first, grouped by day. Pages of 120 from
// MediaStore; thumbnails load only for cells on (or near) the screen. Tap = full-size view (read from the phone).
// Params: type=all|image|video, bucket=<album id>, fav=1, title=<header text>.

import { icons } from '../icons.js';
import { esc, askForPhotoAccess } from '../ui.js';
import { canRead, listMedia, thumbnailUrl, fullImageUrl, heart, myAlbums, hasFullFile } from '../native/media-library.js';
import { pending as vaultPending } from './vault.js';
import { albumName, albumsWith, toggleInAlbum, createAlbum, renameAlbum, deleteAlbum } from '../lib/mine.js';
import { askText, openSheet as sheet } from '../ui.js';
import { groupByDay, formatDayLabel, formatBytes, formatDuration, formatCount } from '../lib/timeline.js';

const PAGE = 120;

export async function render(root, params, ctx) {
  let alive = true;
  const type = ['all', 'image', 'video'].includes(params.type) ? params.type : 'all';
  const bucketId = params.bucket || null;
  const fav = params.fav === '1';
  const albumId = params.album || null;   // one of your own albums (11/22)
  const title = (albumId && albumName(albumId)) || params.title || (type === 'video' ? 'Videos' : 'All Photos');
  const access = ctx.access;

  root.innerHTML = `<div class="screen">
    <div class="subbar">
      <button class="icon-btn" id="back" aria-label="Back">${icons.back}</button>
      <h1>${esc(title)}</h1><span class="count" id="count"></span>${albumId ? `<button class="pill-btn" id="albumEdit">Edit</button>` : ''}
    </div>
    ${bucketId || albumId ? '' : `<div class="chips">
      <button class="chip ${type === 'all' && !fav ? 'on' : ''}" data-go="#photos?type=all&title=All%20Photos">All</button>
      <button class="chip ${type === 'image' && !fav ? 'on' : ''}" data-go="#photos?type=image&title=Photos">Photos</button>
      <button class="chip ${type === 'video' ? 'on' : ''}" data-go="#videos">Videos</button>
      ${access.favoritesSupported ? `<button class="chip ${fav ? 'on' : ''}" data-go="#photos?type=all&fav=1&title=Favorites">Favorites</button>` : ''}
    </div>`}
    <div id="banner"></div>
    <div id="list"></div>
    <div class="sentinel" id="sentinel"></div>
    <div id="status"></div>
  </div>`;

  const list = root.querySelector('#list');
  const status = root.querySelector('#status');
  const ae = root.querySelector('#albumEdit');
  if (ae) ae.addEventListener('click', () => sheet({ icon: 'image', title, body: 'Rename this album, or delete it. Deleting an album never deletes a photo.',
    actions: [{ label: 'Rename', primary: true, onClick: async () => { const n = await askText({ title: 'Rename album', value: title }); if (n) { renameAlbum(albumId, n); ctx.rerender(); } } },
      { label: 'Delete album', onClick: () => { deleteAlbum(albumId); ctx.go('#albums'); } }, { label: 'Cancel' }] }));
  root.querySelector('#back').addEventListener('click', () => (history.length > 1 ? history.back() : ctx.go('#home')));
  root.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-go]');
    if (chip) ctx.go(chip.dataset.go);
  });

  // ---------- no access yet ----------
  if (!canRead(access)) {
    const unavailable = access.state === 'unavailable';
    list.innerHTML = `<div class="empty"><div class="ico">${icons.image}</div>
      <b>${unavailable ? 'Your photos show up in the phone app' : 'See your photos here'}</b>
      ${access.web ? 'Pick photos and videos from your phone. They stay on your phone - nothing is uploaded.' : unavailable ? 'This page is running outside the Android app, so there is no photo library to read.' : 'Photo Hub needs your OK to read your photos and videos. It never changes or deletes them.'}
      ${unavailable ? '' : `<button class="primary-btn" id="ask">${access.web ? 'Pick photos' : access.state === 'denied' ? 'Turn on photo access' : 'Allow photo access'}</button>`}</div>`;
    const ask = root.querySelector('#ask');
    if (ask) ask.addEventListener('click', async () => {
      const a = await askForPhotoAccess(ctx.access);
      ctx.setAccess(a);
      if (canRead(a)) ctx.rerender();
    });
    return () => { alive = false; };
  }

  if (access.state === 'limited') {
    root.querySelector('#banner').innerHTML = `<div class="banner"><span style="flex:1">Photo Hub can see only the photos you picked.</span><button id="more">Choose more</button></div>`;
    root.querySelector('#more').addEventListener('click', async () => {
      const a = await askForPhotoAccess(ctx.access);
      ctx.setAccess(a);
      ctx.rerender();
    });
  }

  // ---------- timeline ----------
  const byId = new Map();
  let offset = 0;
  let hasMore = true;
  let loading = false;
  let lastDay = null;
  let lastGrid = null;
  let lastDayCount = null;
  let lastDayN = 0;

  const thumbObserver = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const cell = en.target;
      thumbObserver.unobserve(cell);
      const item = byId.get(cell.dataset.id);
      if (!item) continue;
      thumbnailUrl(item).then((url) => {
        if (!alive || !url) return;
        const img = cell.querySelector('img');
        img.onload = () => img.classList.add('ready');
        img.src = url;
      });
    }
  }, { rootMargin: '600px 0px' });

  function cellHtml(it) {
    return `<button class="cell" data-id="${esc(it.id)}" aria-label="${esc(it.type)} ${esc(formatDayLabel(it.date))}">
      <img alt="">
      ${it.favorite ? `<span class="fav">${icons.heart}</span>` : ''}
      ${it.type === 'video' ? `<span class="dur">${icons.play}${esc(formatDuration(it.durationMs))}</span>` : ''}
    </button>`;
  }

  function appendItems(items) {
    const now = Date.now();
    for (const g of groupByDay(items, now)) {
      let grid;
      if (g.key === lastDay && lastGrid) {
        grid = lastGrid;
        lastDayN += g.items.length;
      } else {
        list.insertAdjacentHTML('beforeend', `<h3 class="day">${esc(g.label)}<span></span></h3><div class="grid"></div>`);
        grid = list.lastElementChild;
        lastDayCount = grid.previousElementSibling.querySelector('span');
        lastDay = g.key;
        lastGrid = grid;
        lastDayN = g.items.length;
      }
      lastDayCount.textContent = `${lastDayN}`;
      grid.insertAdjacentHTML('beforeend', g.items.map(cellHtml).join(''));
      for (const it of g.items) {
        byId.set(it.id, it);
        thumbObserver.observe(grid.querySelector(`[data-id="${CSS.escape(it.id)}"]`));
      }
    }
  }

  async function loadMore() {
    if (loading || !hasMore || !alive) return;
    loading = true;
    status.innerHTML = '<div class="loading">Loading photos...</div>';
    try {
      const r = await listMedia({ type, bucketId, favoritesOnly: fav, albumId, offset, limit: PAGE });
      if (!alive) return;
      offset = r.offset + r.items.length;
      hasMore = r.hasMore;
      root.querySelector('#count').textContent = `${formatCount(r.total)} ${r.total === 1 ? 'item' : 'items'}`;
      if (offset === 0 && !r.items.length) {
        list.innerHTML = `<div class="empty"><div class="ico">${icons.image}</div><b>Nothing here yet</b>${albumId ? 'Open any photo and tap "Add to album" to put it here.' : fav ? (access.web ? 'Open a photo and tap the heart - it stays on your phone.' : 'Heart a photo in your phone\'s gallery and it shows up here.') : 'No photos or videos on this phone match.'}</div>`;
      } else {
        appendItems(r.items);
      }
      status.innerHTML = '';
    } catch (e) {
      status.innerHTML = `<div class="loading">Could not read your photos: ${esc(e.message || e)}</div>`;
      hasMore = false;
    } finally {
      loading = false;
    }
    // Re-observe: if the end marker is still near the screen after this page, the observer reports it again
    // (it only fires on changes, so without this the list could stop loading).
    if (alive && hasMore && pageObserver) {
      pageObserver.unobserve(sentinel);
      pageObserver.observe(sentinel);
    }
  }

  const sentinel = root.querySelector('#sentinel');
  const pageObserver = new IntersectionObserver((entries) => {
    if (entries.some((en) => en.isIntersecting)) loadMore();
  }, { rootMargin: '1200px 0px' });
  pageObserver.observe(sentinel);

  list.addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    if (cell) openViewer(byId.get(cell.dataset.id));
  });

  await loadMore();

  return () => {
    alive = false;
    thumbObserver.disconnect();
    pageObserver.disconnect();
    document.querySelector('.viewer')?.remove();
  };
}

export function openViewer(item) {
  if (!item) return;
  const isVideo = item.type === 'video';
  const v = document.createElement('div');
  v.className = 'viewer';
  const when = new Date(item.date);
  const dims = item.width && item.height ? `${item.width} x ${item.height}` : '';
  // 11/22: a picked photo (web version) can go into the Private Vault; picked videos play right here
  v.innerHTML = `<div class="top"><button class="icon-btn" aria-label="Close">${icons.close}</button><span style="flex:1"></span>${true ? `<button class="pill-btn heart-btn ${item.favorite ? 'on' : ''}" id="heart" aria-label="Keep on phone">${icons.heart} <span>${item.favorite ? 'On your phone' : 'Keep on phone'}</span></button><button class="pill-btn" id="toalbum">${icons.image} Add to album</button>${hasFullFile(item) ? `<button class="pill-btn" id="tovault">${icons.lock} Put in Vault</button>` : ''}` : ''}</div>
    <div class="stage">${isVideo ? (hasFullFile(item) ? `<video src="${esc(fullImageUrl(item))}" controls playsinline style="max-width:100%;max-height:100%"></video>` : item.web ? `<img alt="" src="${esc(fullImageUrl(item))}">` : `<div class="empty"><div class="ico">${icons.video}</div><b>Video</b>Playing videos comes in a later step.</div>`) : `<img alt="" src="${esc(fullImageUrl(item))}">`}</div>
    ${!hasFullFile(item) ? `<div class="small-note">Small copy - pick this photo again to see it full size${item.type === 'video' ? ' and play it' : ''} or put it in the vault.</div>` : ''}
    <div class="info"><b>${esc(formatDayLabel(item.date))}</b> &middot; ${esc(when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}${item.favorite ? ' &middot; Favorite' : ''}<br>
      ${esc(item.name || '')}<br>${esc([formatBytes(item.size), dims, item.bucketName, isVideo ? formatDuration(item.durationMs) : ''].filter(Boolean).join(' · '))}</div>`;
  v.querySelector('button').addEventListener('click', () => v.remove());
  const tv = v.querySelector('#tovault');
  if (tv) tv.addEventListener('click', () => { vaultPending.item = item; v.remove(); location.hash = '#vault'; });
  const ta = v.querySelector('#toalbum');
  if (ta) ta.addEventListener('click', () => albumPicker(item));
  const hb = v.querySelector('#heart');
  if (hb) hb.addEventListener('click', () => {
    const on = heart(item);
    hb.classList.toggle('on', on);
    hb.querySelector('span').textContent = on ? 'On your phone' : 'Keep on phone';
    const cell = document.querySelector(`.cell[data-id="${CSS.escape(item.id)}"]`);
    if (cell) { cell.querySelector('.fav')?.remove(); if (on) cell.insertAdjacentHTML('beforeend', `<span class="fav">${icons.heart}</span>`); }
  });
  document.body.appendChild(v);
}

// YOUR OWN ALBUMS (11/22): tick the albums this photo goes in; "New album" makes one and puts the photo in it.
function albumPicker(item) {
  const back = document.createElement('div');
  back.className = 'sheet-backdrop';
  const draw = () => {
    const mine = myAlbums(), inn = new Set(albumsWith(item));
    back.innerHTML = `<div class="sheet"><div class="grab"></div><h2>Add to album</h2>
      <div class="album-pick">${mine.length ? mine.map((a) => `<button data-a="${esc(a.id)}" class="${inn.has(a.id) ? 'on' : ''}"><span class="box">${inn.has(a.id) ? icons.check : ''}</span><span class="nm">${esc(a.name)}</span><span class="ct">${a.total}</span></button>`).join('') : '<p class="note">No albums yet - make your first one.</p>'}</div>
      <div class="actions"><button class="primary-btn" data-new>+ New album</button><button class="ghost-btn" data-done>Done</button></div></div>`;
  };
  draw();
  back.addEventListener('click', async (e) => {
    if (e.target === back || e.target.closest('[data-done]')) { back.remove(); return; }
    const a = e.target.closest('[data-a]');
    if (a) { toggleInAlbum(a.dataset.a, item); draw(); return; }
    if (e.target.closest('[data-new]')) {
      back.remove();
      const n = await askText({ title: 'New album', label: 'Give it a name - like "Grandkids", "Beach 2026" or "Recipes".', ok: 'Make album' });
      if (n) { const id = createAlbum(n); toggleInAlbum(id, item); }
      document.body.appendChild(back); draw();
    }
  });
  document.body.appendChild(back);
}
