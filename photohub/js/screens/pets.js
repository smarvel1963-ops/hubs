// pets.js - C:\MarvelApps\photohub\www\js\screens\pets.js
// PETS (#pets) - 11/25, Scott: "yes build pets". Dogs, Cats and Other pets, each a card with a photo and how many, opening its photos
// (#photos?pet=dog - the timeline, select many and swipe all work there). Found on the phone by Google's on-phone image labels
// (native/pets.js); a progress line shows how far it has got - it keeps going in the background. Phone app only.

import { icons } from '../icons.js';
import { esc, askForPhotoAccess } from '../ui.js';
import { canRead, thumbnailUrl } from '../native/media-library.js';
import * as pets from '../native/pets.js';
import { formatCount } from '../lib/timeline.js';

export async function render(root, params, ctx) {
  let alive = true, timer = null;
  root.innerHTML = `<div class="screen pets">
    <div class="subbar"><button class="icon-btn" id="back" aria-label="Back">${icons.back}</button><h1>Pets</h1><span class="count" id="pcount"></span></div>
    <div class="note" id="pline"></div>
    <div class="album-grid" id="pgrid"></div>
    <p class="small-note" style="margin-top:18px">Photo Hub finds dogs, cats and other pets with Google's image labels, right on your phone -
      your photos never leave it. It looks at each photo once, newest first, and keeps going in the background. It can miss a pet or two;
      it would rather miss one than show you the wrong photo.</p>
  </div>`;
  root.querySelector('#back').addEventListener('click', () => (history.length > 1 ? history.back() : ctx.go('#albums')));
  const line = root.querySelector('#pline'), grid = root.querySelector('#pgrid');

  if (!pets.available()) {
    line.innerHTML = `<div class="empty"><div class="ico">${icons.paw}</div><b>Pets is in the Photo Hub phone app</b>
      On your Android phone, Photo Hub finds your dogs, cats and other pets by itself.</div>`;
    return () => { alive = false; };
  }
  if (!canRead(ctx.access)) {
    line.innerHTML = `<div class="empty"><div class="ico">${icons.paw}</div><b>Your pets show up here</b>Allow photo access and Photo Hub finds them.
      ${ctx.access.state === 'unavailable' ? '' : '<button class="primary-btn" id="ask">Allow photo access</button>'}</div>`;
    const ask = root.querySelector('#ask');
    if (ask) ask.addEventListener('click', async () => { const a = await askForPhotoAccess(ctx.access); ctx.setAccess(a); if (canRead(a)) ctx.rerender(); });
    return () => { alive = false; };
  }

  pets.start();
  let shown = '';
  async function draw() {
    const s = await pets.status();
    if (!alive) return;
    const found = (s.dog || 0) + (s.cat || 0) + (s.other || 0);
    root.querySelector('#pcount').textContent = found ? `${formatCount(found)} photos` : '';
    line.textContent = s.total && s.checked < s.total
      ? `Looking... ${formatCount(s.checked)} of ${formatCount(s.total)} photos checked - this keeps going in the background.`
      : !s.lastRun ? 'Getting started - your pets show up here in a minute.'
      : found ? '' : 'No pets found yet.';
    const sig = `${s.dog}|${s.cat}|${s.other}`;
    if (sig === shown) return;
    shown = sig;
    const cards = pets.KINDS.filter((k) => s[k.key] > 0);
    grid.innerHTML = cards.map((k) => `<button class="album-card" data-kind="${k.key}"><span class="ph">${icons.paw}</span>
      <span class="meta"><b>${esc(k.label)}</b><span>${formatCount(s[k.key])} ${s[k.key] === 1 ? 'photo' : 'photos'}</span></span></button>`).join('');
    for (const k of cards) {
      pets.items(k.key).then((list) => (list[0] ? thumbnailUrl(list[0]) : null)).then((url) => {
        const c = grid.querySelector(`[data-kind="${k.key}"]`);
        if (alive && url && c && !c.querySelector('img')) c.insertAdjacentHTML('afterbegin', `<img alt="" src="${esc(url)}">`);
      }).catch(() => {});
    }
  }
  grid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-kind]');
    if (!b) return;
    const k = pets.KINDS.find((x) => x.key === b.dataset.kind);
    ctx.go(`#photos?type=all&pet=${encodeURIComponent(b.dataset.kind)}&title=${encodeURIComponent(k ? k.label : 'Pets')}`);
  });
  await draw();
  timer = setInterval(() => { if (document.visibilityState === 'visible') draw(); }, 5000);
  return () => { alive = false; clearInterval(timer); };
}
