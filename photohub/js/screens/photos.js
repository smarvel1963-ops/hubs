// photos.js - C:\MarvelApps\photohub\www\js\screens\photos.js
// Photos timeline: the phone's REAL photos and videos, newest first, grouped by day. Pages of 120 from
// MediaStore; thumbnails load only for cells on (or near) the screen. Tap = full-size view (read from the phone).
// Params: type=all|image|video, bucket=<album id>, fav=1, title=<header text>, album=<your album>, place=<town>, tag=<one of your tags>.
// 11/24 TAGS (plan step 3): the viewer's Tags button, Tag / Remove tag on many at once, and a list per tag (lib/tags.js).

import { icons } from '../icons.js';
import { esc, askForPhotoAccess } from '../ui.js';
import { canRead, listMedia, thumbnailUrl, fullImageUrl, heart, myAlbums, hasFullFile, canShare, shareItems } from '../native/media-library.js';
import { pending as vaultPending } from './vault.js';
import { albumName, albumsWith, toggleInAlbum, createAlbum, renameAlbum, deleteAlbum, addManyToAlbum, removeManyFromAlbum } from '../lib/mine.js';
import { cloudFullUrl } from '../lib/cloud-images.js';
import { tagsOf, addTags, removeTag, tagMany, allTags, parseTags, taggedSnapItems } from '../lib/tags.js';
import * as places from '../lib/places.js';
import * as trips from '../lib/trips.js';
import * as events from '../lib/events.js';
import * as pets from '../native/pets.js';
import { askText, openSheet as sheet } from '../ui.js';
import { groupByDay, formatDayLabel, formatBytes, formatDuration, formatCount } from '../lib/timeline.js';
import { attachSwipe } from '../lib/swipe.js';

const PAGE = 120;

export async function render(root, params, ctx) {
  let alive = true;
  const type = ['all', 'image', 'video'].includes(params.type) ? params.type : 'all';
  const bucketId = params.bucket || null;
  const fav = params.fav === '1';
  const albumId = params.album || null;   // one of your own albums (11/22)
  const placeKey = params.place || null;  // 0.7.0: one town from Places
  const tagKey = params.tag || null;      // 11/24: one of your tags
  const tripId = params.trip || null;     // 11/24: one trip (lib/trips.js)
  const eventId = params.event || null;   // 11/25: one big day (lib/events.js)
  const petKind = params.pet || null;     // 11/25: dogs / cats / other pets (native/pets.js, phone app)
  const title = (albumId && albumName(albumId)) || params.title || (tagKey ? '#' + tagKey : '') || (type === 'video' ? 'Videos' : 'All Photos');
  const access = ctx.access;

  root.innerHTML = `<div class="screen">
    <div class="subbar">
      <button class="icon-btn" id="back" aria-label="Back">${icons.back}</button>
      <h1>${esc(title)}</h1><span class="count" id="count"></span><button class="pill-btn" id="selBtn">Select</button>${albumId ? `<button class="pill-btn" id="albumEdit">Edit</button>` : ''}
    </div>
    ${bucketId || albumId || placeKey || tagKey || tripId ? '' : `<div class="chips">
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
      ${albumId ? '<button class="pill-btn" id="selOut">Take out</button>' : tagKey ? '<button class="pill-btn" id="selUntag">Remove tag</button>' : ''}<button class="pill-btn" id="selShare">Share</button><button class="pill-btn" id="selTag">Tag</button><button class="primary-btn" id="selAdd">Add to album</button></div>
  </div>`;

  const list = root.querySelector('#list');
  // 0.7.0 Places: one town's photos (remembered by lib/places.js), a page at a time like every other list
  async function placePage(off) {
    const all = await places.items(placeKey);
    const page = all.slice(off, off + PAGE);
    return { items: page, offset: off, total: all.length, hasMore: off + page.length < all.length };
  }
  // 11/24 one tag's photos: the phone app reads its kept snapshots; the web version looks among the photos picked this visit
  async function tagPage(off) {
    let all = [];
    if (access.web) {
      for (let o = 0, more = true; more && o < 100000; ) { const r = await listMedia({ type: 'all', offset: o, limit: 500 }); all = all.concat((r.items || []).filter((i) => tagsOf(i).includes(tagKey))); o = r.offset + (r.items || []).length; more = r.hasMore && (r.items || []).length > 0; }
    } else all = taggedSnapItems(tagKey);
    const page = all.slice(off, off + PAGE);
    return { items: page, offset: off, total: all.length, hasMore: off + page.length < all.length };
  }
  async function tripPage(off) {
    const t = await trips.find(tripId); const all = t ? t.items : [];
    const page = all.slice(off, off + PAGE);
    return { items: page, offset: off, total: all.length, hasMore: off + page.length < all.length };
  }
  async function petPage(off) {
    const all = await pets.items(petKind);
    const page = all.slice(off, off + PAGE);
    return { items: page, offset: off, total: all.length, hasMore: off + page.length < all.length };
  }
  async function eventPage(off) {
    const ev = await events.find(eventId); const all = ev ? ev.items : [];
    const page = all.slice(off, off + PAGE);
    return { items: page, offset: off, total: all.length, hasMore: off + page.length < all.length };
  }
  if (eventId) events.find(eventId).then((ev) => { const h = root.querySelector('.subbar h1'); if (alive && ev && h) h.textContent = ev.name; });
  if (tripId) trips.find(tripId).then((t) => { const h = root.querySelector('.subbar h1'); if (alive && t && h) h.textContent = `${t.name} · ${t.when}`; });
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
      const r = placeKey ? await placePage(offset) : tripId ? await tripPage(offset) : eventId ? await eventPage(offset) : petKind ? await petPage(offset) : tagKey ? await tagPage(offset) : await listMedia({ type, bucketId, favoritesOnly: fav, albumId, offset, limit: PAGE });
      if (!alive) return;
      offset = r.offset + r.items.length;
      hasMore = r.hasMore;
      root.querySelector('#count').textContent = `${formatCount(r.total)} ${r.total === 1 ? 'item' : 'items'}`;
      if (offset === 0 && !r.items.length) {
        list.innerHTML = `<div class="empty"><div class="ico">${icons.image}</div><b>Nothing here yet</b>${tagKey ? 'Open any photo and tap Tags to add this tag.' : albumId ? 'Open any photo and tap "Add to album" to put it here.' : fav ? (access.web ? 'Open a photo and tap the heart - it stays on your phone.' : 'Heart a photo in your phone\'s gallery and it shows up here.') : 'No photos or videos on this phone match.'}</div>`;
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
    for (const id of ['#selOut', '#selTag', '#selUntag', '#selShare']) { const b = root.querySelector(id); if (b) b.disabled = !picked.size; }
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
    // 11/25 swipe: left / right pages through this screen's photos, loading more at the end
    openViewer(byId.get(cell.dataset.id), { items: () => [...list.querySelectorAll('.cell')].map((c) => byId.get(c.dataset.id)), hasMore: () => hasMore, more: () => loadMore() });
  });
  root.querySelector('#selBtn').addEventListener('click', () => setSelecting(!selecting));
  root.querySelector('#selX').addEventListener('click', () => setSelecting(false));
  root.querySelector('#selAll').addEventListener('click', () => {
    list.querySelectorAll('.cell').forEach((c) => { picked.add(c.dataset.id); c.classList.add('sel'); });
    paintSel();
  });
  const pickedItems = () => [...picked].map((id) => byId.get(id)).filter(Boolean);
  root.querySelector('#selAdd').addEventListener('click', () => albumPickerMany(pickedItems(), () => setSelecting(false)));
  root.querySelector('#selShare').addEventListener('click', async () => { const r = await shareItems(pickedItems()); if (r === 'shared') setSelecting(false); shareNote(r); });
  root.querySelector('#selTag').addEventListener('click', async () => {
    const items = pickedItems();
    const text = await askText({ title: `Tag ${formatCount(items.length)} ${items.length === 1 ? 'photo' : 'photos'}`, label: 'A word or a few - like "beach" or "grandkids". Commas make more than one tag.', ok: 'Tag' });
    const list = parseTags(text); if (!list.length) return;
    let n = 0; for (const tg of list) n = Math.max(n, tagMany(items, tg));
    setSelecting(false);
    note(`Tagged ${list.map((x) => '#' + x).join(' ')}`);
  });
  const su = root.querySelector('#selUntag');
  if (su) su.addEventListener('click', () => {
    const items = pickedItems(); for (const it of items) removeTag(it, tagKey);
    setSelecting(false); note(`#${tagKey} taken off ${formatCount(items.length)} - the photos themselves stay where they are`); ctx.rerender();
  });
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

/** Opens a photo full screen. nav (11/25 swipe, Scott: "pan left to right and back ... like normal galleries work"):
 *  { items(): the photos in screen order, hasMore(): more to load, more(): loads them } - drag left / right pages through them. */
export function openViewer(item, nav = null) {
  if (!item) return;
  const v = document.createElement('div');
  v.className = 'viewer';
  v.innerHTML = '<div class="vbody"></div>';
  const body = v.firstElementChild;
  let cur = item, cloudUrl = '';
  const list = () => (nav && nav.items ? nav.items().filter(Boolean) : [cur]);
  const at = () => { const l = list(); const i = l.indexOf(cur); return i >= 0 ? i : l.findIndex((x) => x.id === cur.id && !!x.cloud === !!cur.cloud); };
  const close = () => { v.remove(); if (cloudUrl) URL.revokeObjectURL(cloudUrl); cloudUrl = ''; };

  function draw(it) {
    if (cloudUrl) { URL.revokeObjectURL(cloudUrl); cloudUrl = ''; }
    cur = it;
    const isVideo = it.type === 'video';
    const when = new Date(it.date);
    const dims = it.width && it.height ? `${it.width} x ${it.height}` : '';
    // 11/22: a picked photo (web version) can go into the Private Vault; picked videos play right here.
    // 11/22 album sync: an album photo kept only in the cloud (put in on another phone) is fetched from the cloud to show it.
    const cloud = !!it.cloud;
    body.innerHTML = `<div class="top"><button class="icon-btn" id="vclose" aria-label="Close">${icons.close}</button><span style="flex:1"></span>${cloud ? `<button class="pill-btn" id="toalbum">${icons.image} Albums</button>` : `<button class="pill-btn heart-btn ${it.favorite ? 'on' : ''}" id="heart" aria-label="Keep on phone">${icons.heart} <span>${it.favorite ? 'On your phone' : 'Keep on phone'}</span></button><button class="pill-btn" id="toalbum">${icons.image} Add to album</button><button class="pill-btn" id="totags">${icons.tag} Tags</button>${canShare(it) ? `<button class="pill-btn" id="toshare">${icons.share} Share</button>` : ''}${hasFullFile(it) ? `<button class="pill-btn" id="tovault">${icons.lock} Put in Vault</button>` : ''}`}</div>
      <div class="stage">${cloud ? '<div class="loading">Loading from the cloud...</div>' : isVideo ? (hasFullFile(it) ? `<video src="${esc(fullImageUrl(it))}" controls playsinline style="max-width:100%;max-height:100%"></video>` : it.web ? `<img alt="" draggable="false" src="${esc(fullImageUrl(it))}">` : `<div class="empty"><div class="ico">${icons.video}</div><b>Video</b>Playing videos comes in a later step.</div>`) : `<img alt="" draggable="false" src="${esc(fullImageUrl(it))}">`}</div>
      ${cloud ? '<div class="small-note">Kept in your cloud backup - this photo is in the album on another phone or the web.</div>' : !hasFullFile(it) ? `<div class="small-note">Small copy - pick this photo again to see it full size${it.type === 'video' ? ' and play it' : ''} or put it in the vault.</div>` : ''}
      <div class="info"><b>${esc(formatDayLabel(it.date))}</b> &middot; ${esc(when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}${it.favorite ? ' &middot; Favorite' : ''}${nav ? `<span class="vpos">${at() + 1} of ${formatCount(list().length)}${nav.hasMore && nav.hasMore() ? '+' : ''}</span>` : ''}<br>
        ${esc(it.name || '')}<br>${esc([formatBytes(it.size), dims, it.bucketName, isVideo ? formatDuration(it.durationMs) : ''].filter(Boolean).join(' · '))}</div>
      <div class="vtags" id="vtags"></div>`;
    body.querySelector('#vclose').addEventListener('click', close);
    if (cloud) {
      cloudFullUrl(it).then((url) => {
        if (!v.isConnected || cur !== it) { URL.revokeObjectURL(url); return; }
        cloudUrl = url;
        body.querySelector('.stage').innerHTML = isVideo ? `<video src="${esc(url)}" controls playsinline style="max-width:100%;max-height:100%"></video>` : `<img alt="" draggable="false" src="${esc(url)}">`;
      }).catch((e) => { const st = body.querySelector('.stage'); if (st && cur === it) st.innerHTML = `<div class="empty"><b>Could not load it</b>${esc(e.message || e)}</div>`; });
    }
    const tv = body.querySelector('#tovault');
    if (tv) tv.addEventListener('click', () => { vaultPending.item = it; close(); location.hash = '#vault'; });
    const ta = body.querySelector('#toalbum');
    if (ta) ta.addEventListener('click', () => albumPicker(it));
    const paintTags = () => { const el = body.querySelector('#vtags'); if (el) el.innerHTML = cloud ? '' : tagsOf(it).map((x) => `<span>#${esc(x)}</span>`).join(''); };
    paintTags();
    const sh = body.querySelector('#toshare');
    if (sh) sh.addEventListener('click', async () => shareNote(await shareItems([it])));
    const tg = body.querySelector('#totags');
    if (tg) tg.addEventListener('click', () => tagSheet(it, paintTags));
    const hb = body.querySelector('#heart');
    if (hb) hb.addEventListener('click', () => {
      const on = heart(it);
      hb.classList.toggle('on', on);
      hb.querySelector('span').textContent = on ? 'On your phone' : 'Keep on phone';
      const cell = document.querySelector(`.cell[data-id="${CSS.escape(it.id)}"]`);
      if (cell) { cell.querySelector('.fav')?.remove(); if (on) cell.insertAdjacentHTML('beforeend', `<span class="fav">${icons.heart}</span>`); }
    });
  }

  draw(item);
  if (nav) {
    attachSwipe(v, {
      canPrev: () => at() > 0,
      canNext: () => { const i = at(); return i >= 0 && (i < list().length - 1 || !!(nav.hasMore && nav.hasMore())); },
      prev: async () => { const i = at(); if (i > 0) draw(list()[i - 1]); },
      next: async () => {
        let l = list(); const i = at();
        if (i === l.length - 1 && nav.more && nav.hasMore && nav.hasMore()) { await nav.more(); l = list(); }
        if (i >= 0 && i < l.length - 1) draw(l[i + 1]);
      },
      close,
    });
  }
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
// 11/24 TAGS: this photo's tags (tap one to take it off), your other tags to add with one tap, and a box for new ones.
function tagSheet(item, done) {
  const back = document.createElement('div');
  back.className = 'sheet-backdrop';
  const draw = () => {
    const mine = tagsOf(item), others = allTags().filter((x) => !mine.includes(x.tag)).slice(0, 12);
    back.innerHTML = `<div class="sheet tag-sheet"><div class="grab"></div><h2>Tags</h2>
      <p>Your own words for this photo - like "beach" or "grandkids". Kept on this phone.</p>
      <div class="chips wrap">${mine.length ? mine.map((x) => `<button class="chip on" data-off="${esc(x)}" aria-label="Take off #${esc(x)}">#${esc(x)} &#10005;</button>`).join('') : '<span class="note">No tags yet.</span>'}</div>
      ${others.length ? `<div class="section-title">Your tags</div><div class="chips wrap">${others.map((x) => `<button class="chip" data-on="${esc(x.tag)}">+ #${esc(x.tag)}</button>`).join('')}</div>` : ''}
      <input class="text-in" maxlength="80" placeholder="Add tags - commas for more than one" aria-label="New tags">
      <div class="actions"><button class="primary-btn" data-add>Add</button><button class="ghost-btn" data-done>Done</button></div></div>`;
    const input = back.querySelector('input');
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { addTags(item, parseTags(input.value)); done(); draw(); } });
  };
  back.addEventListener('click', (e) => {
    if (e.target === back || e.target.closest('[data-done]')) { back.remove(); return; }
    const off = e.target.closest('[data-off]'); if (off) { removeTag(item, off.dataset.off); done(); draw(); return; }
    const on = e.target.closest('[data-on]'); if (on) { addTags(item, [on.dataset.on]); done(); draw(); return; }
    if (e.target.closest('[data-add]')) { const input = back.querySelector('input'); const list = parseTags(input.value); if (list.length) { addTags(item, list); done(); draw(); } }
  });
  draw();
  document.body.appendChild(back);
}
// 11/24 Share: what to say when the share menu could not open (nothing to say when it did or was closed)
function shareNote(r) {
  if (r === 'nofile') note('Pick this photo again to share it full size');
  else if (r === 'unsupported') note("This browser can't share photos - share it from your phone's gallery");
  else if (r === 'failed') note('Could not open the share menu - try again');
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
