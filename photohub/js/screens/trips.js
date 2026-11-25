// trips.js - C:\MarvelApps\photohub\www\js\screens\trips.js
// TRIPS SCREEN (11/24, plan step 3): your trips, the newest first - each card shows a photo from the trip, where it went and when, and
// opens its photos. Trips are found from where and when your photos were taken (lib/trips.js), read on the phone like Places - the first
// visit may read locations ("checked N of M"); nothing is sent anywhere.

import { icons } from '../icons.js';
import { esc, askForPhotoAccess } from '../ui.js';
import { canRead, thumbnailUrl, isNative, openAppSettings } from '../native/media-library.js';
import * as places from '../lib/places.js';
import * as trips from '../lib/trips.js';
import { formatCount } from '../lib/timeline.js';

export async function render(root, params, ctx) {
  let alive = true;
  const readable = canRead(ctx.access);
  root.innerHTML = `<div class="screen">
    <div class="subbar"><button class="icon-btn" id="back" aria-label="Back">${icons.back}</button><h1>Trips</h1><span class="count" id="tcount"></span></div>
    <div class="note" id="tline"></div>
    <div class="album-grid" id="tgrid"></div>
    <p class="small-note" style="margin-top:18px">A trip is photos taken more than ${trips.AWAY_KM} km from home (the town with most of your photos),
      no more than ${trips.GAP_DAYS} days apart. Worked out right here from where each photo was taken - never sent anywhere.</p>
  </div>`;
  root.querySelector('#back').addEventListener('click', () => (history.length > 1 ? history.back() : ctx.go('#gallery')));
  const line = root.querySelector('#tline');
  const grid = root.querySelector('#tgrid');

  if (!readable) {
    line.innerHTML = `<div class="empty"><div class="ico">${icons.plane}</div><b>Your trips show up here</b>
      ${ctx.access.web ? 'Pick photos and Photo Hub finds your trips from where and when they were taken.' : 'Allow photo access and Photo Hub finds your trips from where and when your photos were taken.'}
      ${ctx.access.state === 'unavailable' ? '' : `<button class="primary-btn" id="ask">${ctx.access.web ? 'Pick photos' : 'Allow photo access'}</button>`}</div>`;
    const ask = root.querySelector('#ask');
    if (ask) ask.addEventListener('click', async () => { const a = await askForPhotoAccess(ctx.access); ctx.setAccess(a); if (canRead(a)) ctx.rerender(); });
    return () => { alive = false; };
  }

  let shown = '';
  async function drawGrid() {
    const list = await trips.list();
    if (!alive) return;
    const sig = list.map((t) => `${t.id}:${t.count}`).join(',');
    if (sig === shown) return;
    shown = sig;
    root.querySelector('#tcount').textContent = list.length ? `${formatCount(list.length)} ${list.length === 1 ? 'trip' : 'trips'}` : '';
    grid.innerHTML = list.map((t, i) => `<button class="album-card" data-i="${i}" data-trip="${esc(t.id)}">
      <span class="ph">${icons.plane}</span><span class="meta"><b>${esc(t.name)}</b><span>${esc(t.when)} · ${formatCount(t.count)} ${t.count === 1 ? 'item' : 'items'}</span></span></button>`).join('');
    list.forEach((t, i) => thumbnailUrl(t.cover).then((url) => {
      const c = grid.querySelector(`[data-i="${i}"]`);
      if (alive && url && c && !c.querySelector('img')) c.insertAdjacentHTML('afterbegin', `<img alt="" src="${esc(url)}">`);
    }).catch(() => {}));
    if (!list.length) drawLine(places.status());
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
    if (s.error) { line.textContent = `Could not finish finding trips: ${s.error}`; return; }
    if (s.running) { line.textContent = s.total ? `Finding trips... ${formatCount(s.checked)} of ${formatCount(s.total)} photos checked.` : 'Finding trips...'; return; }
    if (s.done && !s.withPlace) {
      line.innerHTML = isNative()
        ? 'None of your photos have a location yet. Turn on <b>Location tags</b> in your camera\'s settings and your next trip shows up here.'
        : 'None of the photos picked here have a location. Phones often remove it when a photo is picked in a browser - the Photo Hub phone app reads it from the original.';
      return;
    }
    line.textContent = s.done && !shown ? 'No trips yet - photos taken away from home show up here as trips.' : '';
  }

  let tm = null;
  const stop = places.onChange((s) => {
    drawLine(s);
    if (!s.running) { clearTimeout(tm); tm = null; drawGrid(); }
    else if (!tm) tm = setTimeout(() => { tm = null; drawGrid(); }, 1500);
  });
  grid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-trip]');
    if (b) ctx.go(`#photos?type=all&trip=${encodeURIComponent(b.dataset.trip)}`);
  });
  drawLine(places.status());
  drawGrid();
  places.scan();
  return () => { alive = false; stop(); clearTimeout(tm); };
}
