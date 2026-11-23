// photos.js - C:\MarvelApps\photohub\www\js\screens\photos.js
// Photos timeline: the phone's REAL photos and videos, newest first, grouped by day. Pages of 120 from
// MediaStore; thumbnails load only for cells on (or near) the screen. Tap = full-size view (read from the phone).
// Params: type=all|image|video, bucket=<album id>, fav=1, title=<header text>.

import { icons } from '../icons.js';
import { esc, askForPhotoAccess } from '../ui.js';
import { canRead, listMedia, thumbnailUrl, fullImageUrl, heart, myAlbums, hasFullFile } from '../native/media-library.js';
import { pending as vaultPending } from './vault.js';
import { albumName, albumsWith, toggleInAlbum, createAlbum, renameAlbum, deleteAlbum, addManyToAlbum, removeManyFromAlbum } from '../lib/mine.js';
import { cloudFullUrl } from '../lib/cloud-images.js';
import * as places from '../lib/places.js';
import { askText, openSheet as sheet } from '../ui.js';
import { groupByDay, formatDayLabel, formatBytes, formatDuration, formatCount } from '../lib/timeline.js';

const PAGE = 120;

export async function render(root, params, ctx) {
  let alive = true;
  const type = ['all', 'image', 'video'].includes(params.type) ? params.type : 'all';
  const bucketId = params.bucket || null;
  const fav = params.fav === '1';
  const albumId = params.album || null;   // one of your own albums (11/22)
  const placeKey = params.place || null;  // 0.7.0: one town from Places
  const title = (albumId && albumName(albumId)) || params.title || (type === 'video' ? 'Videos' : 'All Photos');
  const access = ctx.access;

  root.innerHTML = `<div class="screen">
    <div class="subbar">
      <button class="icon-btn" id="back" aria-label="Back">${icons.back}</button>
      <h1>${esc(title)}</h1><span class="count" id="count"></span><button class="pill-btn" id="selBtn">Select</button>${albumId ? `<button class="pill-btn" id="albumEdit">Edit</button>` : ''}
    </div>
    ${bucketId || albumId || placeKey ? '' : `<div class="chips">
      <button class="chip ${type === 'all' && !fav ? 'on' : ''}" data-go="#photos?type=all&title=All%20Photos">All</button>
      <button class="chip ${type === 'image' && !fav ? 'on' : ''}" data-go="#photos?type=image&title=Photos">Photos</button>
      <button class="chip ${type === 'video' ? 'on' : ''}" data-go="#videos">Videos</button>
      ${access.favoritesSupported ? `<button class="chip ${fav ? 'on' : ''}" data-go="#photos?type=all&fav=1&title=Favorites">Favorites</button>` : ''}
    </div>`}
    <div id="banner"></div>
    <div id="list"></div>
    <div class="sentinel" id="sentinel"></div>
    <div id="status"></div>
    <div class="selbar" id="selbar" hidden><button class="icon-btn" id="selX" aria-label="Stop selecting">${icons.close}</button>
      <b id="selN">Tap photos to pick them</b><span style="flex:1"></span><button class="pill-btn" id="selAll">All</button>
      ${albumId ? '<button class="pill-btn" id="selOut">Take out</button>' : ''}<button class="primary-btn" id="selAdd">Add to album</button></div>
  </div>`;

  const list = root.querySelector('#list');
  // 0.7.0 Places: one town's photos (remembered by lib/places.js), a page at a time like every other list
  async function placePage(off) {
    const all = await places.items(placeKey);
    const page = all.slice(off, off + PAGE);
    return { items: page, offset: off, total: all.length, hasMore: off + page.length < all.length };
  }
  if (placeKey) places.label(placeKey).then((l) => { const h = root.querySelector('.subbar h1'); if (alive && l && h) h.textContent = l; });
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

  // ---------- no access yet ----------  (11/22: the web version opens one of your albums anyway - its photos come from the cloud)
  if (!canRead(access) && !(albumId && access.web)) {
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
      ${it.cloud ? '<span class="incloud" title="In the cloud">&#9729;</span>' : ''}
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
      const r = placeKey ? await placePage(offset) : await listMedia({ type, bucketId, favoritesOnly: fav, albumId, offset, limit: PAGE });
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

  // ---------- 0.6.0 SELECT MANY: hold a photo (or tap Select) -> it highlights; tap more; then act on them all ----------
  let selecting = false, longFired = false, pressT = null, pressAt = null;
  const picked = new Set();
  const selbar = root.querySelector('#selbar');
  function paintSel() {
    root.querySelector('#selN').textContent = picked.size ? `${formatCount(picked.size)} selected` : 'Tap photos to pick them';
    root.querySelector('#selAdd').disabled = !picked.size;
    const out = root.querySelector('#selOut'); if (out) out.disabled = !picked.size;
  }
  function setSelecting(on) {
    selecting = on;
    selbar.hidden = !on;
    root.classList.toggle('selecting', on);
    root.querySelector('#selBtn').textContent = on ? 'Done' : 'Select';
    if (!on) { picked.clear(); list.querySelectorAll('.cell.sel').forEach((c) => c.classList.remove('sel')); }
    paintSel();
  }
  function toggleCell(cell) {
    const id = cell.dataset.id;
    if (picked.has(id)) picked.delete(id); else picked.add(id);
    cell.classList.toggle('sel', picked.has(id));
    paintSel();
  }
  function longPress(cell) {
    longFired = true;
    if (!selecting) setSelecting(true);
    if (!picked.has(cell.dataset.id)) toggleCell(cell);
    try { navigator.vibrate && navigator.vibrate(15); } catch (e) { /* no buzz */ }
  }
  const cancelPress = () => { clearTimeout(pressT); pressT = null; };
  list.addEventListener('pointerdown', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell || (e.pointerType === 'mouse' && e.button !== 0)) return;
    longFired = false; pressAt = [e.clientX, e.clientY];
    cancelPress();
    pressT = setTimeout(() => { pressT = null; longPress(cell); }, 450);
  });
  list.addEventListener('pointermove', (e) => { if (pressT && pressAt && Math.hypot(e.clientX - pressAt[0], e.clientY - pressAt[1]) > 10) cancelPress(); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) list.addEventListener(ev, cancelPress);
  // a long press on a phone also sends 'contextmenu' (and right-click on a PC): no menu, it selects
  list.addEventListener('contextmenu', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    e.preventDefault();
    if (pressT) { cancelPress(); longPress(cell); } else if (!longFired) longPress(cell);
  });
  list.addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    if (longFired) { longFired = false; return; }   // the finger that started the selection lifting off
    if (selecting) { toggleCell(cell); return; }
    openViewer(byId.get(cell.dataset.id));
  });
  root.querySelector('#selBtn').addEventListener('click', () => setSelecting(!selecting));
  root.querySelector('#selX').addEventListener('click', () => setSelecting(false));
  root.querySelector('#selAll').addEventListener('click', () => {
    list.querySelectorAll('.cell').forEach((c) => { picked.add(c.dataset.id); c.classList.add('sel'); });
    paintSel();
  });
  const pickedItems = () => [...picked].map((id) => byId.get(id)).filter(Boolean);
  root.querySelector('#selAdd').addEventListener('click', () => albumPickerMany(pickedItems(), () => setSelecting(false)));
  const so = root.querySelector('#selOut');
  if (so) so.addEventListener('click', () => {
    const n = removeManyFromAlbum(albumId, pickedItems());
    setSelecting(false);
    note(`${formatCount(n)} taken out of ${albumName(albumId)} - the photos themselves stay where they are`);
    ctx.rerender();
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
  // 11/22: a picked photo (web version) can go into the Private Vault; picked videos play right here.
  // 11/22 album sync: an album photo kept only in the cloud (put in on another phone) is fetched from the cloud to show it.
  const cloud = !!item.cloud;
  v.innerHTML = `<div class="top"><button class="icon-btn" aria-label="Close">${icons.close}</button><span style="flex:1"></span>${cloud ? `<button class="pill-btn" id="toalbum">${icons.image} Albums</button>` : true ? `<button class="pill-btn heart-btn ${item.favorite ? 'on' : ''}" id="heart" aria-label="Keep on phone">${icons.heart} <span>${item.favorite ? 'On your phone' : 'Keep on phone'}</span></button><button class="pill-btn" id="toalbum">${icons.image} Add to album</button>${hasFullFile(item) ? `<button class="pill-btn" id="tovault">${icons.lock} Put in Vault</button>` : ''}` : ''}</div>
    <div class="stage">${cloud ? '<div class="loading">Loading from the cloud...</div>' : isVideo ? (hasFullFile(item) ? `<video src="${esc(fullImageUrl(item))}" controls playsinline style="max-width:100%;max-height:100%"></video>` : item.web ? `<img alt="" src="${esc(fullImageUrl(item))}">` : `<div class="empty"><div class="ico">${icons.video}</div><b>Video</b>Playing videos comes in a later step.</div>`) : `<img alt="" src="${esc(fullImageUrl(item))}">`}</div>
    ${cloud ? '<div class="small-note">Kept in your cloud backup - this photo is in the album on another phone or the web.</div>' : !hasFullFile(item) ? `<div class="small-note">Small copy - pick this photo again to see it full size${item.type === 'video' ? ' and play it' : ''} or put it in the vault.</div>` : ''}
    <div class="info"><b>${esc(formatDayLabel(item.date))}</b> &middot; ${esc(when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}${item.favorite ? ' &middot; Favorite' : ''}<br>
      ${esc(item.name || '')}<br>${esc([formatBytes(item.size), dims, item.bucketName, isVideo ? formatDuration(item.durationMs) : ''].filter(Boolean).join(' · '))}</div>`;
  let cloudUrl = '';
  v.querySelector('button').addEventListener('click', () => { v.remove(); if (cloudUrl) URL.revokeObjectURL(cloudUrl); });
  if (cloud) {
    cloudFullUrl(item).then((url) => {
      cloudUrl = url;
      if (!v.isConnected) { URL.revokeObjectURL(url); return; }
      v.querySelector('.stage').innerHTML = isVideo ? `<video src="${esc(url)}" controls playsinline style="max-width:100%;max-height:100%"></video>` : `<img alt="" src="${esc(url)}">`;
    }).catch((e) => { const st = v.querySelector('.stage'); if (st) st.innerHTML = `<div class="empty"><b>Could not load it</b>${esc(e.message || e)}</div>`; });
  }
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

// 0.6.0 SELECT MANY: tap an album and every picked photo goes in it; "New album" makes one and puts them all in.
function albumPickerMany(items, done) {
  if (!items.length) return;
  const back = document.createElement('div');
  back.className = 'sheet-backdrop';
  const mine = myAlbums();
  back.innerHTML = `<div class="sheet"><div class="grab"></div><h2>Add ${formatCount(items.length)} to an album</h2>
    <div class="album-pick">${mine.length ? mine.map((a) => `<button data-a="${esc(a.id)}"><span class="box">${icons.image}</span><span class="nm">${esc(a.name)}</span><span class="ct">${a.total}</span></button>`).join('') : '<p class="note">No albums yet - make your first one.</p>'}</div>
    <div class="actions"><button class="primary-btn" data-new>+ New album</button><button class="ghost-btn" data-done>Cancel</button></div></div>`;
  const put = (id) => { const n = addManyToAlbum(id, items); back.remove(); done(); note(n ? `${formatCount(n)} added to ${albumName(id)}` : `They were already in ${albumName(id)}`); };
  back.addEventListener('click', async (e) => {
    if (e.target === back || e.target.closest('[data-done]')) { back.remove(); return; }
    const a = e.target.closest('[data-a]');
    if (a) { put(a.dataset.a); return; }
    if (e.target.closest('[data-new]')) {
      back.remove();
      const n = await askText({ title: 'New album', label: 'Give it a name - like "Grandkids", "Beach 2026" or "Recipes".', ok: 'Make album' });
      if (n) put(createAlbum(n));
    }
  });
  document.body.appendChild(back);
}
function note(text) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
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
