// memories.js - C:\MarvelApps\photohub\www\js\screens\memories.js
// ON THIS DAY (Scott 11/22: "one drive brings up memories on certain dates each day like 1 year 5 years and so forth which is pretty cool").
// Photos taken on today's date in earlier years - "1 year ago today", "5 years ago today" - from each photo's own date taken. When no photo
// matches today exactly, the same week in earlier years ("This week, 3 years ago"). Shown on Home and on this Memories screen.

import { icons } from '../icons.js';
import { esc, askForPhotoAccess } from '../ui.js';
import { canRead, listMedia, thumbnailUrl } from '../native/media-library.js';
import { openViewer } from './photos.js';

const DAY = 86400000;

/** -> [{ years, exact, label, items }] newest year first. Exact-day matches first; else within 3 days of today in earlier years. */
export async function onThisDay(now = new Date()) {
  const r = await listMedia({ type: 'all', limit: 5000, offset: 0 });
  const items = r.items || [];
  const groups = new Map();
  for (const it of items) {
    const d = new Date(it.date);
    const years = now.getFullYear() - d.getFullYear();
    if (years < 1) continue;
    const sameDay = d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    const thatYear = new Date(d.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const near = Math.abs(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - thatYear) <= 3 * DAY;
    if (!sameDay && !near) continue;
    const k = `${years}|${sameDay ? 1 : 0}`;
    if (!groups.has(k)) groups.set(k, { years, exact: sameDay, items: [] });
    groups.get(k).items.push(it);
  }
  const out = [...groups.values()].sort((a, b) => (b.exact - a.exact) || (a.years - b.years));
  for (const g of out) g.label = g.exact ? `${g.years} ${g.years === 1 ? 'year' : 'years'} ago today` : `This week, ${g.years} ${g.years === 1 ? 'year' : 'years'} ago`;
  return out;
}

export async function render(root, params, ctx) {
  let alive = true;
  root.innerHTML = `<div class="screen">
    <div class="subbar"><button class="icon-btn" id="back" aria-label="Back">${icons.back}</button><h1>Memories</h1></div>
    <p class="note" style="margin-top:0">On this day in other years - from each photo's own date.</p>
    <div id="memList"><div class="loading">Looking back...</div></div></div>`;
  root.querySelector('#back').addEventListener('click', () => ctx.go('#home'));
  const box = root.querySelector('#memList');
  if (!canRead(ctx.access)) {
    box.innerHTML = `<div class="empty"><div class="ico">${icons.calHeart}</div><b>Your memories show up here</b>${ctx.access.web ? 'Pick photos from your phone - Photo Hub finds the ones taken on this day in other years.' : 'Allow photo access to see them.'}
      ${ctx.access.state === 'unavailable' ? '' : `<button class="primary-btn" id="ask">${ctx.access.web ? 'Pick photos' : 'Allow photo access'}</button>`}</div>`;
    const ask = root.querySelector('#ask');
    if (ask) ask.addEventListener('click', async () => { const a = await askForPhotoAccess(ctx.access); ctx.setAccess(a); if (canRead(a)) ctx.rerender(); });
    return () => { alive = false; };
  }
  const groups = await onThisDay().catch(() => []);
  if (!alive) return null;
  if (!groups.length) {
    box.innerHTML = `<div class="empty"><div class="ico">${icons.calHeart}</div><b>No memories for today yet</b>When you have photos taken on this date in earlier years, they show up here - 1 year ago, 5 years ago and more.</div>`;
    return () => { alive = false; };
  }
  box.innerHTML = groups.map((g, gi) => `<section class="mem-group"><div class="day">${esc(g.label)}<span>${g.items.length} ${g.items.length === 1 ? 'photo' : 'photos'}</span></div>
    <div class="grid">${g.items.map((it, i) => `<button class="cell" data-g="${gi}" data-i="${i}"><img alt=""></button>`).join('')}</div></section>`).join('');
  for (const [gi, g] of groups.entries()) {
    for (const [i, it] of g.items.entries()) {
      thumbnailUrl(it).then((url) => {
        const img = box.querySelector(`[data-g="${gi}"][data-i="${i}"] img`);
        if (alive && url && img) { img.src = url; img.classList.add('ready'); }
      });
    }
  }
  // 11/25 (Scott: "pan left to right and back ... like normal galleries work"): the full photo viewer, swiping through every memory shown
  const all = groups.flatMap((g) => g.items);
  box.addEventListener('click', (e) => {
    const c = e.target.closest('.cell'); if (!c) return;
    openViewer(groups[+c.dataset.g].items[+c.dataset.i], { items: () => all });
  });
  return () => { alive = false; document.querySelectorAll('.viewer').forEach((n) => n.remove()); };
}
