// sort.js - C:\MarvelApps\photohub\www\js\screens\sort.js
// TO SORT screen (#sort) - 11/25, Scott: "if a pic is left untouched it sould got to sorting folder along with all other albums availble",
// "maybe grouped by date and locations". Photos nobody has sorted for a week (lib/sort.js), grouped by day and town. Hold a photo for the
// Send to menu (Family, Personal Info, Cool Stuff, every album, New album, Private Vault), or tap "Send all" to send the whole group.
// A sorted photo leaves this list at once. Tap a photo to see it full size (swipe works). Nothing is moved or deleted on the phone.

import { icons } from '../icons.js';
import { esc, askForPhotoAccess } from '../ui.js';
import { canRead, thumbnailUrl } from '../native/media-library.js';
import { formatCount } from '../lib/timeline.js';
import * as sorting from '../lib/sort.js';
import { openViewer } from './photos.js';
import { sendMenu, holdToSend } from './sendto.js';

export async function render(root, params, ctx) {
  let alive = true;
  root.innerHTML = `<div class="screen sort">
    <div class="subbar"><button class="icon-btn" id="back" aria-label="Back">${icons.back}</button><h1>To Sort</h1><span class="count" id="scount"></span></div>
    <p class="note" style="margin-top:0">Photos you haven't put anywhere for a week wait here, by day and place. Hold a photo - or tap
      <b>Send all</b> - to put it in Family, Personal Info, Cool Stuff or any album. Nothing is moved or deleted on your phone.</p>
    <div id="sortList"><div class="loading">Finding photos to sort...</div></div></div>`;
  root.querySelector('#back').addEventListener('click', () => (history.length > 1 ? history.back() : ctx.go('#home')));
  const box = root.querySelector('#sortList');
  if (!canRead(ctx.access)) {
    box.innerHTML = `<div class="empty"><div class="ico">${icons.inbox}</div><b>Photos to sort show up here</b>${ctx.access.web ? 'Pick photos from your phone - the ones you have not sorted after a week wait here.' : 'Allow photo access to see them.'}
      ${ctx.access.state === 'unavailable' ? '' : `<button class="primary-btn" id="ask">${ctx.access.web ? 'Pick photos' : 'Allow photo access'}</button>`}</div>`;
    const ask = root.querySelector('#ask');
    if (ask) ask.addEventListener('click', async () => { const a = await askForPhotoAccess(ctx.access); ctx.setAccess(a); if (canRead(a)) ctx.rerender(); });
    return () => { alive = false; };
  }

  const { items, more } = await sorting.untouchedItems();
  if (!alive) return null;
  let gs = await sorting.groups(items);
  if (!alive) return null;

  function draw() {
    gs = gs.map((g) => ({ ...g, items: g.items.filter((it) => sorting.untouched(it)) })).filter((g) => g.items.length);
    const n = gs.reduce((s, g) => s + g.items.length, 0);
    root.querySelector('#scount').textContent = n ? `${formatCount(n)}${more ? '+' : ''}` : '';
    if (!gs.length) {
      box.innerHTML = `<div class="empty"><div class="ico">${icons.check}</div><b>All sorted</b>Every photo older than a week is in an album or folder, hearted or tagged. New ones show up here after a week.</div>`;
      return;
    }
    box.innerHTML = gs.map((g, gi) => `<section class="mem-group sort-g"><div class="day sort-h"><span class="sort-t"><b>${esc(g.day)}</b>${g.place ? `<i>${icons.pin} ${esc(g.place)}</i>` : ''}</span>
        <span class="sort-n">${g.items.length} ${g.items.length === 1 ? 'photo' : 'photos'}</span><button class="pill-btn" data-all="${gi}">Send all</button></div>
      <div class="grid">${g.items.map((it, i) => `<button class="cell" data-g="${gi}" data-i="${i}"><img alt=""></button>`).join('')}</div></section>`).join('');
    for (const [gi, g] of gs.entries()) {
      for (const [i, it] of g.items.entries()) {
        thumbnailUrl(it).then((url) => {
          const img = box.querySelector(`[data-g="${gi}"][data-i="${i}"] img`);
          if (alive && url && img) { img.src = url; img.classList.add('ready'); }
        }).catch(() => {});
      }
    }
  }
  const after = () => { sorting.forgetCount(); draw(); };
  box.addEventListener('click', (e) => {
    const all = e.target.closest('[data-all]');
    if (all) {
      const g = gs[+all.dataset.all], r = all.getBoundingClientRect();
      if (g) sendMenu(g.items, { x: r.left + r.width / 2, y: r.bottom }, { title: `Send ${g.items.length} to`, done: after });
      return;
    }
    const c = e.target.closest('.cell'); if (!c) return;
    const flat = gs.flatMap((g) => g.items);
    openViewer(gs[+c.dataset.g].items[+c.dataset.i], { items: () => flat });
  });
  holdToSend(box, '.cell', (c) => gs[+c.dataset.g].items[+c.dataset.i], { done: after });
  draw();
  return () => { alive = false; document.querySelectorAll('.viewer, .send-back').forEach((x) => x.remove()); };
}
