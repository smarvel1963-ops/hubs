// sort.js - C:\MarvelApps\photohub\www\js\screens\sort.js
// PHOTO INBOX (#inbox) + UNSORTED PHOTOS (#sort) - 11/25, Scott: "if a pic is left untouched it sould got to sorting folder", "maybe grouped
// by date and locations", "all photos when taken or arrive through texts should go to are called photo inbox ... unless assigned", "should
// also have warning if in box is going to empty to cloud on such and such date", "the folder on cloud everything non sorted goes to should
// be unsorted photos label". lib/sort.js decides which photo is where:
//   Photo Inbox     - photos that came to the phone in the last week (camera, texts, downloads) and are not in any folder or album yet.
//                     A warning says when the next ones leave for Unsorted Photos; each group says the day it leaves.
//   Unsorted Photos - the ones left unsorted after a week (kept in the cloud when Cloud Backup is on).
// Both are grouped by day and town. Hold a photo for the Send to menu, or tap "Send all" for a group; a sent photo leaves the list at once.
// Tap a photo to see it full size (swipe works). Nothing is moved or deleted on the phone.

import { icons } from '../icons.js';
import { esc, askForPhotoAccess } from '../ui.js';
import { canRead, thumbnailUrl } from '../native/media-library.js';
import { formatCount } from '../lib/timeline.js';
import * as sorting from '../lib/sort.js';
import * as account from '../lib/account.js';
import { openViewer } from './photos.js';
import { sendMenu, holdToSend } from './sendto.js';

const MODES = {
  inbox: {
    title: 'Photo Inbox', icon: 'inbox', load: () => sorting.inboxItems(), keep: (it) => sorting.inInbox(it),
    note: 'New photos land here - from your camera, texts and downloads - until you put them in a folder or album. Hold a photo, or tap <b>Send all</b>, to send it. After a week, unsorted ones move to <b>Unsorted Photos</b>.',
    empty: '<b>Your Inbox is empty</b>New photos from your camera, texts and downloads show up here until you sort them.',
  },
  sort: {
    title: 'Unsorted Photos', icon: 'inbox', load: () => sorting.untouchedItems(), keep: (it) => sorting.untouched(it),
    note: 'Photos left in the Inbox for more than a week, by day and place. Hold a photo - or tap <b>Send all</b> - to put it in Family, Personal Info, Cool Stuff or any album. Nothing is moved or deleted on your phone.',
    empty: `<b>All sorted</b>Every photo older than a week is in an album or folder, hearted or tagged.`,
  },
};

export function screen(mode) {
  const M = MODES[mode];
  return async function render(root, params, ctx) {
    let alive = true;
    root.innerHTML = `<div class="screen sort ${mode}">
      <div class="subbar"><button class="icon-btn" id="back" aria-label="Back">${icons.back}</button><h1>${M.title}</h1><span class="count" id="scount"></span></div>
      <p class="note" style="margin-top:0">${M.note}</p>
      <div id="sortWarn"></div>
      <div id="sortList"><div class="loading">Looking...</div></div>
      ${mode === 'inbox' ? `<button class="row" id="toUnsorted"><span class="ico">${icons.inbox}</span><span class="txt"><b>Unsorted Photos</b><span id="unsortedN">Photos left unsorted after a week</span></span>${icons.chevron}</button>` : ''}
    </div>`;
    root.querySelector('#back').addEventListener('click', () => (history.length > 1 ? history.back() : ctx.go('#home')));
    const tu = root.querySelector('#toUnsorted');
    if (tu) tu.addEventListener('click', () => ctx.go('#sort'));
    const box = root.querySelector('#sortList');
    if (!canRead(ctx.access)) {
      box.innerHTML = `<div class="empty"><div class="ico">${icons.inbox}</div><b>Your photos show up here</b>${ctx.access.web ? 'Pick photos from your phone to try it.' : 'Allow photo access to see them.'}
        ${ctx.access.state === 'unavailable' ? '' : `<button class="primary-btn" id="ask">${ctx.access.web ? 'Pick photos' : 'Allow photo access'}</button>`}</div>`;
      const ask = root.querySelector('#ask');
      if (ask) ask.addEventListener('click', async () => { const a = await askForPhotoAccess(ctx.access); ctx.setAccess(a); if (canRead(a)) ctx.rerender(); });
      return () => { alive = false; };
    }
    if (mode === 'inbox') sorting.count().then((c) => { const n = root.querySelector('#unsortedN'); if (alive && n) n.textContent = c.n ? `${formatCount(c.n)}${c.more ? '+' : ''} photos left unsorted after a week` : 'Nothing left unsorted'; }).catch(() => {});

    const { items, more } = await M.load();
    if (!alive) return null;
    let gs = await sorting.groups(items);
    if (!alive) return null;
    const toCloud = !!(account.current && account.current());

    function draw() {
      gs = gs.map((g) => ({ ...g, items: g.items.filter((it) => M.keep(it)) })).filter((g) => g.items.length);
      const all = gs.flatMap((g) => g.items);
      root.querySelector('#scount').textContent = all.length ? `${formatCount(all.length)}${more ? '+' : ''}` : '';
      const warn = root.querySelector('#sortWarn');
      const next = mode === 'inbox' ? sorting.nextLeave(all) : null;
      warn.innerHTML = next ? `<div class="banner inbox-warn">${icons.calHeart}<span style="flex:1">${esc(sorting.leaveText(next, toCloud))}.</span></div>` : '';
      if (!gs.length) { box.innerHTML = `<div class="empty"><div class="ico">${icons.check}</div>${M.empty}</div>`; return; }
      box.innerHTML = gs.map((g, gi) => `<section class="mem-group sort-g"><div class="day sort-h"><span class="sort-t"><b>${esc(g.day)}</b>${g.place ? `<i>${icons.pin} ${esc(g.place)}</i>` : ''}
          ${mode === 'inbox' ? `<em class="sort-leave">Leaves ${esc(sorting.shortDay(Math.min(...g.items.map(sorting.leavesOn))))}</em>` : ''}</span>
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
      const btn = e.target.closest('[data-all]');
      if (btn) {
        const g = gs[+btn.dataset.all], r = btn.getBoundingClientRect();
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
  };
}

export const render = screen('sort');
