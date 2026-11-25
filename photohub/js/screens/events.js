// events.js - C:\MarvelApps\photohub\www\js\screens\events.js
// EVENTS SCREEN (#events) - 11/25, plan step 6: your big days, the newest first. Each card shows a photo from the day, the day and how
// many photos; it opens that day's photos. Worked out from each photo's own date on this phone (lib/events.js) - no AI, nothing sent.

import { icons } from '../icons.js';
import { esc, askForPhotoAccess } from '../ui.js';
import { canRead, thumbnailUrl } from '../native/media-library.js';
import * as events from '../lib/events.js';
import { formatCount } from '../lib/timeline.js';

export async function render(root, params, ctx) {
  let alive = true;
  root.innerHTML = `<div class="screen">
    <div class="subbar"><button class="icon-btn" id="back" aria-label="Back">${icons.back}</button><h1>Events</h1><span class="count" id="ecount"></span></div>
    <div class="note" id="eline">Looking for your big days...</div>
    <div class="album-grid" id="egrid"></div>
    <p class="small-note" style="margin-top:18px">An event is a day you took at least ${events.MIN_PHOTOS} photos and videos - a birthday, a game,
      a party. Worked out right here from each photo's own date - never sent anywhere.</p>
  </div>`;
  root.querySelector('#back').addEventListener('click', () => (history.length > 1 ? history.back() : ctx.go('#albums')));
  const line = root.querySelector('#eline'), grid = root.querySelector('#egrid');
  if (!canRead(ctx.access)) {
    line.innerHTML = `<div class="empty"><div class="ico">${icons.cake}</div><b>Your big days show up here</b>
      ${ctx.access.web ? 'Pick photos and Photo Hub finds the days you took lots of them.' : 'Allow photo access and Photo Hub finds the days you took lots of photos.'}
      ${ctx.access.state === 'unavailable' ? '' : `<button class="primary-btn" id="ask">${ctx.access.web ? 'Pick photos' : 'Allow photo access'}</button>`}</div>`;
    const ask = root.querySelector('#ask');
    if (ask) ask.addEventListener('click', async () => { const a = await askForPhotoAccess(ctx.access); ctx.setAccess(a); if (canRead(a)) ctx.rerender(); });
    return () => { alive = false; };
  }
  const list = await events.list({ fresh: true }).catch(() => []);
  if (!alive) return null;
  root.querySelector('#ecount').textContent = list.length ? `${formatCount(list.length)} ${list.length === 1 ? 'event' : 'events'}` : '';
  line.textContent = list.length ? '' : `No events yet - a day with ${events.MIN_PHOTOS} or more photos shows up here.`;
  grid.innerHTML = list.map((e, i) => `<button class="album-card" data-i="${i}" data-ev="${esc(e.id)}">
    <span class="ph">${icons.cake}</span><span class="meta"><b>${esc(e.name)}</b><span>${formatCount(e.photos)} ${e.photos === 1 ? 'photo' : 'photos'}${e.videos ? ` · ${formatCount(e.videos)} ${e.videos === 1 ? 'video' : 'videos'}` : ''}</span></span></button>`).join('');
  list.forEach((e, i) => thumbnailUrl(e.cover).then((url) => {
    const c = grid.querySelector(`[data-i="${i}"]`);
    if (alive && url && c && !c.querySelector('img')) c.insertAdjacentHTML('afterbegin', `<img alt="" src="${esc(url)}">`);
  }).catch(() => {}));
  grid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ev]');
    if (b) ctx.go(`#photos?type=all&event=${encodeURIComponent(b.dataset.ev)}`);
  });
  return () => { alive = false; };
}
