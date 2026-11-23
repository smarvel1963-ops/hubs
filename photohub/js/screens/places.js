// places.js - C:\MarvelApps\photohub\www\js\screens\places.js
// PLACES SCREEN (0.7.0, Scott 11/22: "Yes, build Places"): your photos grouped by the town they were taken in, the town with the most
// photos first. Each card opens that town's photos. The first visit reads every photo's location (shown as "checked N of M");
// after that only new photos are read. Locations are read on the phone and never sent anywhere (lib/places.js).

import { icons } from '../icons.js';
import { esc, askForPhotoAccess } from '../ui.js';
import { canRead, thumbnailUrl, isNative, openAppSettings } from '../native/media-library.js';
import * as places from '../lib/places.js';
import { formatCount } from '../lib/timeline.js';

export async function render(root, params, ctx) {
  let alive = true;
  const readable = canRead(ctx.access);
  root.innerHTML = `<div class="screen">
    <div class="subbar"><button class="icon-btn" id="back" aria-label="Back">${icons.back}</button><h1>Places</h1><span class="count" id="pcount"></span></div>
    <div class="note" id="pline"></div>
    <div class="album-grid" id="pgrid"></div>
    <p class="small-note" style="margin-top:18px">Where each photo was taken is read right here and never sent anywhere. Town names: GeoNames (CC BY 4.0).</p>
  </div>`;
  root.querySelector('#back').addEventListener('click', () => (history.length > 1 ? history.back() : ctx.go('#albums')));
  const line = root.querySelector('#pline');
  const grid = root.querySelector('#pgrid');

  if (!readable) {
    line.innerHTML = `<div class="empty"><div class="ico">${icons.pin}</div><b>Your places show up here</b>
      ${ctx.access.web ? 'Pick photos and Photo Hub sorts them by the town they were taken in.' : 'Allow photo access and Photo Hub sorts your photos by the town they were taken in.'}
      ${ctx.access.state === 'unavailable' ? '' : `<button class="primary-btn" id="ask">${ctx.access.web ? 'Pick photos' : 'Allow photo access'}</button>`}</div>`;
    const ask = root.querySelector('#ask');
    if (ask) ask.addEventListener('click', async () => { const a = await askForPhotoAccess(ctx.access); ctx.setAccess(a); if (canRead(a)) ctx.rerender(); });
    return () => { alive = false; };
  }

  let shown = '';
  async function drawGrid() {
    const list = await places.list();
    if (!alive) return;
    const sig = list.map((p) => `${p.key}:${p.count}`).join(',');
    if (sig === shown) return;
    shown = sig;
    root.querySelector('#pcount').textContent = list.length ? `${formatCount(list.length)} ${list.length === 1 ? 'place' : 'places'}` : '';
    grid.innerHTML = list.map((p, i) => `<button class="album-card" data-i="${i}" data-place="${esc(p.key)}">
      <span class="ph">${icons.pin}</span><span class="meta"><b>${esc(p.label)}</b><span>${formatCount(p.count)} ${p.count === 1 ? 'item' : 'items'}</span></span></button>`).join('');
    list.forEach((p, i) => thumbnailUrl(p.cover).then((url) => {
      const c = grid.querySelector(`[data-i="${i}"]`);
      if (alive && url && c && !c.querySelector('img')) c.insertAdjacentHTML('afterbegin', `<img alt="" src="${esc(url)}">`);
    }).catch(() => {}));
  }

  function drawLine(s) {
    if (s.needsPermission) {
      line.innerHTML = `<div class="banner"><span style="flex:1">Photo Hub needs your OK to see where your photos were taken.</span><button id="allow">Allow</button></div>`;
      root.querySelector('#allow').addEventListener('click', async () => {
        const a = await places.allowLocations();
        if (a && a.location === 'denied') {
          line.innerHTML = `<div class="banner"><span style="flex:1">Photo locations are turned off for Photo Hub. Turn on "Photos and videos" with location in its settings.</span><button id="sett">Settings</button></div>`;
          root.querySelector('#sett').addEventListener('click', () => openAppSettings());
        }
      });
      return;
    }
    if (s.error) { line.textContent = `Could not finish finding places: ${s.error}`; return; }
    if (s.running) { line.textContent = s.total ? `Finding places... ${formatCount(s.checked)} of ${formatCount(s.total)} photos checked.` : 'Finding places...'; return; }
    if (s.done && !s.withPlace) {
      line.innerHTML = isNative()
        ? 'None of your photos have a location yet. Turn on <b>Location tags</b> in your camera\'s settings and new photos will be sorted by town here.'
        : 'None of the photos picked here have a location. Phones often remove it when a photo is picked in a browser - the Photo Hub phone app reads it from the original.';
      return;
    }
    line.textContent = s.done ? `${formatCount(s.withPlace)} of your ${formatCount(s.total)} photos have a location.` : '';
  }

  let t = null;
  const stop = places.onChange((s) => {
    drawLine(s);
    if (!s.running) { clearTimeout(t); t = null; drawGrid(); }   // finished: show the result right away
    else if (!t) t = setTimeout(() => { t = null; drawGrid(); }, 1500);   // while reading: refresh the cards now and then
  });
  grid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-place]');
    if (b) ctx.go(`#photos?type=all&place=${encodeURIComponent(b.dataset.place)}`);
  });
  drawLine(places.status());
  drawGrid();
  places.scan();
  return () => { alive = false; stop(); clearTimeout(t); };
}
