// albums.js - C:\MarvelApps\photohub\www\js\screens\albums.js
// Albums: All Photos / Favorites / Videos plus the phone's REAL folders (Camera, Screenshots, WhatsApp...) from
// MediaStore, each opening the timeline. Places (0.7.0) sorts photos by town. 11/24 (Scott: "Start with steps 1 + 2"): People / Pets / Events stay hidden until built.

import { icons } from '../icons.js';
import { esc, comingLater, askForPhotoAccess } from '../ui.js';
import { canRead, listAlbums, getLibrarySummary, listMedia, thumbnailUrl, myAlbums } from '../native/media-library.js';
import { createAlbum } from '../lib/mine.js';
import { askText } from '../ui.js';
import { formatCount } from '../lib/timeline.js';


function card({ key = '', name, icon, sub, hash = '', later = '' }) {
  return `<button class="album-card ${later ? 'later' : ''}" ${hash ? `data-go="${esc(hash)}"` : ''} ${later ? `data-later="${esc(later)}"` : ''} data-card="${esc(key)}">
    <span class="ph">${icons[icon] || icons.folder}</span>
    <span class="meta"><b>${esc(name)}</b><span data-sub>${esc(sub)}</span></span></button>`;
}

export async function render(root, params, ctx) {
  let alive = true;
  const readable = canRead(ctx.access);
  // 11/22 album sync: the web version shows your albums even before you pick anything - their photos come from the cloud
  const showMine = readable || (ctx.access.web && myAlbums().length > 0);

  root.innerHTML = `<div class="screen">
    <div class="subbar"><h1>Albums</h1></div>
    ${readable ? '' : `<div class="empty"><div class="ico">${icons.image}</div><b>Your albums show up here</b>
      ${ctx.access.web ? 'Pick photos from your phone and Photo Hub sorts them into albums by month.' : ctx.access.state === 'unavailable' ? 'Open Photo Hub on your Android phone.' : 'Allow photo access to see your phone\'s albums.'}
      ${ctx.access.state === 'unavailable' ? '' : `<button class="primary-btn" id="ask">${ctx.access.web ? 'Pick photos' : 'Allow photo access'}</button>`}</div>`}
    ${showMine ? `<div class="section-title">Your albums</div>
    <div class="album-grid" id="mine"><button class="album-card new-album" id="newAlbum"><span class="ph">+</span><span class="meta"><b>New album</b><span>Make your own</span></span></button>
      ${myAlbums().map((a) => card({ key: `m-${a.id}`, name: a.name, icon: 'image', sub: a.count ? `${formatCount(a.count)} ${a.count === 1 ? 'item' : 'items'}` : (a.total ? `${a.total} saved - pick them to see` : 'Empty'), hash: `#photos?type=all&album=${encodeURIComponent(a.id)}` })).join('')}</div>` : ''}
    <div class="section-title">${ctx.access.web ? 'Your picks' : 'On this phone'}</div>
    <div class="album-grid" id="top">
      ${card({ key: 'all', name: 'All Photos', icon: 'image', sub: '--', hash: '#photos?type=all&title=All%20Photos' })}
      ${card({ key: 'fav', name: 'Favorites', icon: 'heart', sub: '--', hash: '#photos?type=all&fav=1&title=Favorites' })}
      ${card({ key: 'video', name: 'Videos', icon: 'play', sub: '--', hash: '#videos' })}
    </div>
    <div class="section-title">${ctx.access.web ? 'By month' : 'Phone folders'}</div>
    <div class="album-grid" id="folders">${readable ? '<div class="loading">Reading albums...</div>' : '<div class="note">--</div>'}</div>
    <div class="section-title">Smart albums</div>
    <div class="album-grid">${card({ key: 'places', name: 'Places', icon: 'pin', sub: 'By town', hash: '#places' })}</div>
  </div>`;

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'newAlbum') {
      const n = await askText({ title: 'New album', label: 'Give it a name - like "Grandkids", "Beach 2026" or "Recipes". Then open a photo and tap "Add to album".', ok: 'Make album' });
      if (n) { createAlbum(n); ctx.rerender(); }
      return;
    }
    if (b.id === 'ask') {
      const a = await askForPhotoAccess(ctx.access);
      ctx.setAccess(a);
      if (canRead(a)) ctx.rerender();
    } else if (b.dataset.later) comingLater(b.dataset.later);
    else if (b.dataset.go) ctx.go(b.dataset.go);
  });

  // 11/22 album sync: albums that change on another phone (or the web) show up here without leaving the screen
  const onAlbums = () => { if (alive && !document.querySelector('.sheet-backdrop')) ctx.rerender(); };
  globalThis.addEventListener('photohub:albums', onAlbums);
  const stop = () => { alive = false; globalThis.removeEventListener('photohub:albums', onAlbums); };

  const addCover = async (cardEl, item) => {
    const url = await thumbnailUrl(item);
    if (alive && url && cardEl) cardEl.insertAdjacentHTML('afterbegin', `<img alt="" src="${esc(url)}">`);
  };
  if (!readable) {
    if (showMine) for (const a of myAlbums()) if (a.cover) addCover(root.querySelector(`[data-card="m-${CSS.escape(a.id)}"]`), a.cover);
    return stop;
  }

  getLibrarySummary().then((s) => {
    if (!alive) return;
    const sub = (k, v) => { const n = root.querySelector(`[data-card="${k}"] [data-sub]`); if (n) n.textContent = v; };
    sub('all', `${formatCount(s.photos.count + s.videos.count)} items`);
    sub('video', `${formatCount(s.videos.count)} videos`);
    sub('fav', s.favorites === null || s.favorites === undefined ? 'Needs Android 11+' : `${formatCount(s.favorites)} items`);
  }).catch(() => {});
  for (const a of myAlbums()) if (a.cover) addCover(root.querySelector(`[data-card="m-${CSS.escape(a.id)}"]`), a.cover);
  for (const [key, q] of [['all', { type: 'all' }], ['fav', { type: 'all', favoritesOnly: true }], ['video', { type: 'video' }]]) {
    listMedia({ ...q, limit: 1, offset: 0 }).then((r) => r.items[0] && addCover(root.querySelector(`[data-card="${key}"]`), r.items[0])).catch(() => {});
  }

  try {
    const { albums } = await listAlbums();
    if (!alive) return stop;
    const box = root.querySelector('#folders');
    if (!albums.length) {
      box.innerHTML = '<div class="note">No folders with photos yet.</div>';
    } else {
      box.innerHTML = albums.map((a) => card({
        key: `b-${a.bucketId}`,
        name: a.name,
        icon: 'folder',
        sub: `${formatCount(a.count)} ${a.count === 1 ? 'item' : 'items'}`,
        hash: `#photos?type=all&bucket=${encodeURIComponent(a.bucketId)}&title=${encodeURIComponent(a.name)}`,
      })).join('');
      for (const a of albums) if (a.cover) addCover(box.querySelector(`[data-card="b-${CSS.escape(a.bucketId)}"]`), a.cover);
    }
  } catch (e) {
    root.querySelector('#folders').innerHTML = `<div class="note">Could not read albums: ${esc(e.message || e)}</div>`;
  }
  return stop;
}
