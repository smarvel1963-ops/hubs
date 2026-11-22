// albums.js - C:\MarvelApps\photohub\www\js\screens\albums.js
// Albums: All Photos / Favorites / Videos plus the phone's REAL folders (Camera, Screenshots, WhatsApp...) from
// MediaStore, each opening the timeline. People / Places / Pets / Events are later-phase smart albums (no counts).

import { icons } from '../icons.js';
import { esc, comingLater, askForPhotoAccess } from '../ui.js';
import { canRead, listAlbums, getLibrarySummary, listMedia, thumbnailUrl } from '../native/media-library.js';
import { formatCount } from '../lib/timeline.js';

const LATER = [
  { key: 'people', name: 'People', icon: 'people' },
  { key: 'places', name: 'Places', icon: 'pin' },
  { key: 'pets', name: 'Pets', icon: 'paw' },
  { key: 'events', name: 'Events', icon: 'cake' },
];

function card({ key = '', name, icon, sub, hash = '', later = '' }) {
  return `<button class="album-card ${later ? 'later' : ''}" ${hash ? `data-go="${esc(hash)}"` : ''} ${later ? `data-later="${esc(later)}"` : ''} data-card="${esc(key)}">
    <span class="ph">${icons[icon] || icons.folder}</span>
    <span class="meta"><b>${esc(name)}</b><span data-sub>${esc(sub)}</span></span></button>`;
}

export async function render(root, params, ctx) {
  let alive = true;
  const readable = canRead(ctx.access);

  root.innerHTML = `<div class="screen">
    <div class="subbar"><h1>Albums</h1></div>
    ${readable ? '' : `<div class="empty"><div class="ico">${icons.image}</div><b>Your albums show up here</b>
      ${ctx.access.web ? 'Pick photos from your phone and Photo Hub sorts them into albums by month.' : ctx.access.state === 'unavailable' ? 'Open Photo Hub on your Android phone.' : 'Allow photo access to see your phone\'s albums.'}
      ${ctx.access.state === 'unavailable' ? '' : `<button class="primary-btn" id="ask">${ctx.access.web ? 'Pick photos' : 'Allow photo access'}</button>`}</div>`}
    <div class="section-title">${ctx.access.web ? 'Your picks' : 'On this phone'}</div>
    <div class="album-grid" id="top">
      ${card({ key: 'all', name: 'All Photos', icon: 'image', sub: '--', hash: '#photos?type=all&title=All%20Photos' })}
      ${card({ key: 'fav', name: 'Favorites', icon: 'heart', sub: '--', hash: '#photos?type=all&fav=1&title=Favorites' })}
      ${card({ key: 'video', name: 'Videos', icon: 'play', sub: '--', hash: '#videos' })}
    </div>
    <div class="section-title">${ctx.access.web ? 'By month' : 'Phone folders'}</div>
    <div class="album-grid" id="folders">${readable ? '<div class="loading">Reading albums...</div>' : '<div class="note">--</div>'}</div>
    <div class="section-title">Smart albums</div>
    <div class="album-grid">${LATER.map((a) => card({ name: a.name, icon: a.icon, sub: 'Later phase', later: a.key })).join('')}</div>
  </div>`;

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'ask') {
      const a = await askForPhotoAccess(ctx.access);
      ctx.setAccess(a);
      if (canRead(a)) ctx.rerender();
    } else if (b.dataset.later) comingLater(b.dataset.later);
    else if (b.dataset.go) ctx.go(b.dataset.go);
  });

  if (!readable) return () => { alive = false; };

  const addCover = async (cardEl, item) => {
    const url = await thumbnailUrl(item);
    if (alive && url && cardEl) cardEl.insertAdjacentHTML('afterbegin', `<img alt="" src="${esc(url)}">`);
  };

  getLibrarySummary().then((s) => {
    if (!alive) return;
    const sub = (k, v) => { const n = root.querySelector(`[data-card="${k}"] [data-sub]`); if (n) n.textContent = v; };
    sub('all', `${formatCount(s.photos.count + s.videos.count)} items`);
    sub('video', `${formatCount(s.videos.count)} videos`);
    sub('fav', s.favorites === null || s.favorites === undefined ? 'Needs Android 11+' : `${formatCount(s.favorites)} items`);
  }).catch(() => {});
  for (const [key, q] of [['all', { type: 'all' }], ['fav', { type: 'all', favoritesOnly: true }], ['video', { type: 'video' }]]) {
    listMedia({ ...q, limit: 1, offset: 0 }).then((r) => r.items[0] && addCover(root.querySelector(`[data-card="${key}"]`), r.items[0])).catch(() => {});
  }

  try {
    const { albums } = await listAlbums();
    if (!alive) return null;
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
  return () => { alive = false; };
}
