// copies.js - C:\MarvelApps\photohub\www\js\screens\copies.js
// DUPLICATE CLEANUP (#copies) - 11/25, plan step 6 (Scott 11/24 via Desktop: "he will finish photo app"). Phone app only.
// Finds EXACT copies only: photos / videos whose bytes are identical (same size, then the same SHA-256, read on the phone - CleanupCore).
// Look-alikes (bursts, edits) are NOT copies and are never shown here. In each group one copy is kept (a favorite, else one you hearted /
// put in an album / tagged, else the oldest) and the extra copies are ticked; untick any. Android asks before anything moves, at least one
// copy of every group always stays, and the phone's trash keeps them about 30 days (Free Up Phone Space - Recently cleaned puts them back).
// Review 11/25: the plugin reads every copy again right before Android asks (and the copy that stays, byte for byte); anything changed
// since the search -> look again. Needs Android's OK to read photo locations (else two photos differing only in location look the same).

import { icons } from '../icons.js';
import { esc, openSheet } from '../ui.js';
import { thumbnailUrl, requestLocation, openAppSettings } from '../native/media-library.js';
import * as cleanup from '../native/cleanup.js';
import { formatBytes, formatCount, formatDayLabel } from '../lib/timeline.js';

const MAX_ROUND = 500;

export async function render(root, params, ctx) {
  let alive = true;
  root.innerHTML = `<div class="screen copies">
    <div class="subbar"><button class="icon-btn" id="back" aria-label="Back">${icons.back}</button><h1>Duplicate Cleanup</h1></div>
    <div id="dbody"></div>
    <p class="small-note" style="margin-top:18px">Only exact copies - the very same file saved twice. Look-alike photos are never counted.
      Favorites and photos you hearted, put in an album or tagged are never moved, and one copy of every photo always stays.</p>
  </div>`;
  root.querySelector('#back').addEventListener('click', () => (history.length > 1 ? history.back() : ctx.go('#storage')));
  const body = root.querySelector('#dbody');

  if (!cleanup.available()) {
    body.innerHTML = `<div class="empty"><div class="ico">${icons.copies}</div><b>Duplicate Cleanup is in the Photo Hub phone app</b>
      On your Android phone, open Photo Hub and go to Cloud - Duplicate Cleanup.</div>`;
    return () => { alive = false; };
  }

  async function look() {
    body.innerHTML = `<section class="card"><div class="card-head">${icons.copies}<h2>Looking for copies...</h2></div>
      <p class="note">Photo Hub compares files of the same size, byte for byte. On a big phone this can take a minute.</p></section>`;
    let r;
    try { r = await cleanup.findCopies(); } catch (e) { body.innerHTML = `<div class="empty"><b>Could not look right now</b>${esc((e && e.message) || '')}</div>`; return; }
    if (!alive) return;
    const groups = r.groups || [];
    if (r.needsLocation) {
      body.innerHTML = `<section class="card"><div class="card-head">${icons.pin}<h2>One more OK first</h2></div>
        <p class="note">Duplicate Cleanup needs your OK for Photo Hub to read where each photo was taken. Without it Android hides the
        location, so two photos taken in different places could look like copies.</p>
        <button class="primary-btn" id="loc">Allow photo locations</button></section>`;
      body.querySelector('#loc').addEventListener('click', async () => {
        const a = await requestLocation().catch(() => null);
        if (a && a.location === 'denied') { openAppSettings(); return; }
        look();
      });
      return;
    }
    if (!groups.length) {
      body.innerHTML = `<section class="card"><div class="card-head">${icons.check}<h2>No copies found</h2></div>
        <p class="note">Every photo and video on this phone is saved only once.</p></section>`;
      return;
    }
    if (!r.trashSupported) {
      body.innerHTML = `<div class="empty"><div class="ico">${icons.copies}</div><b>${formatCount(groups.length)} photos are saved more than once</b>
        Removing copies needs Android 11 or newer (a trash Photo Hub can use safely). Your photos are untouched.</div>`;
      return;
    }
    const sel = new Set();
    for (const g of groups) for (const it of g.items) if (String(it.id) !== String(g.keep) && !it.favorite && !it.kept) sel.add(String(it.id));
    const extra = groups.reduce((n, g) => n + g.items.length - 1, 0);
    body.innerHTML = `<section class="card">
      <div class="card-head">${icons.copies}<h2>${formatCount(groups.length)} photos saved more than once</h2></div>
      <p class="note">${formatCount(extra)} extra ${extra === 1 ? 'copy' : 'copies'}. The kept copy is marked; tap any other to keep it too.</p>
      <button class="primary-btn" id="go"></button></section>
      <div id="glist">${groups.map((g, gi) => `<section class="mem-group"><div class="day">${esc(formatDayLabel(g.items[0].date))}
        <span>${g.items.length} copies · ${esc(formatBytes(g.size))} each</span></div>
        <div class="grid">${g.items.map((it, i) => `<button class="cell ${sel.has(String(it.id)) ? 'sel' : ''} ${String(it.id) === String(g.keep) ? 'keep' : ''}"
          data-g="${gi}" data-i="${i}" aria-label="${esc(it.bucketName || '')} ${esc(it.name || '')}"><img alt="">
          <span class="where">${String(it.id) === String(g.keep) ? 'Kept · ' : ''}${esc(it.bucketName || '')}</span></button>`).join('')}</div></section>`).join('')}</div>`;
    const go = body.querySelector('#go');
    const sizeOf = (id) => { for (const g of groups) for (const it of g.items) if (String(it.id) === id) return Number(it.size) || 0; return 0; };
    const paint = () => {
      const bytes = [...sel].reduce((n, id) => n + sizeOf(id), 0);
      go.disabled = !sel.size;
      go.innerHTML = `${icons.broom} Move ${formatCount(sel.size)} ${sel.size === 1 ? 'copy' : 'copies'} to the phone's trash (${esc(formatBytes(bytes))})`;
    };
    paint();
    groups.forEach((g, gi) => g.items.forEach((it, i) => thumbnailUrl(it).then((url) => {
      const img = body.querySelector(`[data-g="${gi}"][data-i="${i}"] img`);
      if (alive && url && img) { img.src = url; img.classList.add('ready'); }
    }).catch(() => {})));
    body.querySelector('#glist').addEventListener('click', (e) => {
      const c = e.target.closest('.cell'); if (!c) return;
      const g = groups[+c.dataset.g], it = g.items[+c.dataset.i], id = String(it.id);
      if (sel.has(id)) { sel.delete(id); c.classList.remove('sel'); paint(); return; }
      if (it.favorite || it.kept) { toast('A favorite or a photo you keep in Photo Hub always stays.'); return; }
      const left = g.items.filter((x) => !sel.has(String(x.id)) && String(x.id) !== id).length;
      if (left < 1) { toast('One copy always stays.'); return; }
      sel.add(id); c.classList.add('sel'); paint();
    });
    go.addEventListener('click', () => {
      if (!sel.size) return;
      const ids = [...sel].slice(0, MAX_ROUND);
      const bytes = ids.reduce((n, id) => n + sizeOf(id), 0);
      openSheet({
        icon: 'copies',
        title: `Move ${formatCount(ids.length)} ${ids.length === 1 ? 'copy' : 'copies'} to the phone's trash?`,
        body: `Each one is an exact copy of a photo that stays on your phone. This frees about ${formatBytes(bytes)}. Android asks you next; its trash keeps them about 30 days.`,
        actions: [
          { label: 'Move to trash', primary: true, onClick: async () => {
            try {
              const r = await cleanup.trash(ids, 'copies');
              if (r.moved) { toast(`Done - ${formatCount(r.count)} ${r.count === 1 ? 'copy' : 'copies'} moved to the phone's trash.`); look(); }
            } catch (e) {
              toast(e && e.message ? `${e.message}. Nothing was moved.` : 'Nothing was moved.');
              if (e && (e.code === 'CHANGED' || e.code === 'NOT_CHECKED' || e.code === 'NOT_COPIES' || e.code === 'NEEDS_LOCATION')) look();
            }
          } },
          { label: 'Cancel' },
        ],
      });
    });
  }

  function toast(text) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4200);
  }

  look();
  return () => { alive = false; };
}
