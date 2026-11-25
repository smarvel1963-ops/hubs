// cleanup.js - C:\MarvelApps\photohub\www\js\screens\cleanup.js
// FREE UP PHONE SPACE (#cleanup) - 11/25, plan step 5 (Scott 11/24 via Desktop: "he will finish photo app"). Phone app only.
// 1. Lists the photos that MAY go: backed up, older than 30 days, not a favorite, not hearted / in an album / tagged in Photo Hub.
// 2. "Check them" reads each file NOW and asks the cloud NOW (native/cleanup.js -> CleanupPlugin -> CleanupCore): same photo as the
//    backup, and the cloud holds it at the same size. Anything that can't be checked stays.
// 3. Only photos that passed are offered; the person can untick any. "Move to the phone's trash" -> Photo Hub asks, then Android asks.
//    The phone's trash keeps them about 30 days; "Recently cleaned" below puts them back. Your cloud copies are never touched here.
// Review 11/25: the plugin reads every photo again right before Android asks; a photo changed since the check, or a check older than
// 45 minutes, sends the person back through the check. Clean Up waits for Android's OK to read photo locations (else a backup could
// match while the photo's location is lost).

import { icons } from '../icons.js';
import { esc, openSheet } from '../ui.js';
import { thumbnailUrl, requestLocation, openAppSettings } from '../native/media-library.js';
import * as cleanup from '../native/cleanup.js';
import { formatBytes, formatCount } from '../lib/timeline.js';

const MAX_ROUND = 500;   // Android's trash question takes at most this many at once (CleanupPlugin.MAX_TRASH)

export async function render(root, params, ctx) {
  let alive = true;
  root.innerHTML = `<div class="screen cleanup">
    <div class="subbar"><button class="icon-btn" id="back" aria-label="Back">${icons.back}</button><h1>Free Up Phone Space</h1></div>
    <div id="cbody"><div class="loading">Looking at your photos...</div></div>
    <section class="card" id="trashCard" hidden>
      <div class="card-head">${icons.broom}<h2>Recently cleaned</h2><span class="count" id="tcount"></span></div>
      <p class="note">In the phone's trash - Android keeps them about 30 days. Pick any and put them back.</p>
      <div class="grid" id="tgrid"></div>
      <button class="ghost-btn" id="putBack" disabled>Put back</button>
    </section>
    <p class="small-note" style="margin-top:18px">Clean Up only offers a photo when its backup is checked right now: the photo on your phone
      is read again and must match the backup exactly, and your cloud must hold it at the same size. Favorites, photos you hearted, put in an
      album or tagged, and photos from the last ${cleanup.KEEP_DAYS} days always stay. Nothing goes without your OK and Android's.</p>
  </div>`;
  root.querySelector('#back').addEventListener('click', () => (history.length > 1 ? history.back() : ctx.go('#storage')));
  const body = root.querySelector('#cbody');

  if (!cleanup.available()) {
    body.innerHTML = `<div class="empty"><div class="ico">${icons.broom}</div><b>Clean Up is in the Photo Hub phone app</b>
      A browser can't remove photos from a phone. On your Android phone, open Photo Hub and go to Cloud - Free Up Phone Space.</div>`;
    return () => { alive = false; };
  }

  const thumbs = (box, list, sel) => {
    box.innerHTML = list.map((it, i) => `<button class="cell ${sel && sel.has(String(it.id)) ? 'sel' : ''}" data-i="${i}" aria-label="${esc(it.name || 'photo')}"><img alt=""></button>`).join('');
    list.forEach((it, i) => thumbnailUrl(it).then((url) => {
      const img = box.querySelector(`[data-i="${i}"] img`);
      if (alive && url && img) { img.src = url; img.classList.add('ready'); }
    }).catch(() => {}));
  };

  // ---------- Recently cleaned (the phone's trash) ----------
  const tSel = new Set();
  let trashed = [];
  async function drawTrash() {
    const r = await cleanup.listTrashed().catch(() => ({ items: [] }));
    if (!alive) return;
    trashed = r.items || [];
    tSel.clear();
    root.querySelector('#trashCard').hidden = !trashed.length;
    root.querySelector('#tcount').textContent = trashed.length ? formatCount(trashed.length) : '';
    thumbs(root.querySelector('#tgrid'), trashed, tSel);
    root.querySelector('#putBack').disabled = true;
  }
  root.querySelector('#tgrid').addEventListener('click', (e) => {
    const c = e.target.closest('.cell'); if (!c) return;
    const id = String(trashed[+c.dataset.i].id);
    if (tSel.has(id)) tSel.delete(id); else tSel.add(id);
    c.classList.toggle('sel', tSel.has(id));
    const b = root.querySelector('#putBack');
    b.disabled = !tSel.size;
    b.textContent = tSel.size ? `Put back ${formatCount(tSel.size)}` : 'Put back';
  });
  root.querySelector('#putBack').addEventListener('click', async () => {
    if (!tSel.size) return;
    try {
      const r = await cleanup.restore([...tSel].slice(0, MAX_ROUND));
      if (r.moved) toast(`${formatCount(r.count)} put back on your phone.`);
    } catch (e) { toast((e && e.message) || 'Android would not put them back.'); }
    drawTrash();
    start();
  });

  // ---------- step 1: what may go ----------
  async function start() {
    body.innerHTML = '<div class="loading">Looking at your photos...</div>';
    let r;
    try { r = await cleanup.candidates(); } catch (e) { body.innerHTML = `<div class="empty"><b>Could not read your photos</b>${esc((e && e.message) || '')}</div>`; return; }
    if (!alive) return;
    const c = r.counts || {};
    const items = (r.items || []).slice(0, MAX_ROUND);
    const stay = [
      c.notBackedUp ? `${formatCount(c.notBackedUp)} not backed up yet` : '',
      c.recent ? `${formatCount(c.recent)} from the last ${cleanup.KEEP_DAYS} days` : '',
      c.favorites ? `${formatCount(c.favorites)} favorites` : '',
      c.kept ? `${formatCount(c.kept)} hearted, in an album or tagged` : '',
    ].filter(Boolean);
    if (r.needsLocation) {
      body.innerHTML = `<section class="card"><div class="card-head">${icons.pin}<h2>One more OK first</h2></div>
        <p class="note">Clean Up needs your OK for Photo Hub to read where each photo was taken. Without it Android hides the location from
        Photo Hub, so a backup could look complete while the photo's location is missing - and Clean Up never takes that chance.</p>
        <button class="primary-btn" id="loc">Allow photo locations</button></section>`;
      body.querySelector('#loc').addEventListener('click', async () => {
        const a = await requestLocation().catch(() => null);
        if (a && a.location === 'denied') { openAppSettings(); return; }
        start();
      });
      return;
    }
    if (!r.trashSupported) {
      body.innerHTML = `<div class="empty"><div class="ico">${icons.broom}</div><b>Needs Android 11 or newer</b>Android 10 and older phones don't
        have a trash Photo Hub can use safely, so Clean Up stays off on this phone. Your photos are untouched.</div>`;
      return;
    }
    if (!items.length) {
      body.innerHTML = `<section class="card"><div class="card-head">${icons.check}<h2>Nothing to clean up right now</h2></div>
        <p class="note">${stay.length ? 'Staying on your phone: ' + esc(stay.join(', ')) + '.' : 'No photos on this phone yet.'}
        ${c.notBackedUp ? ' Photos show up here once they are backed up and older than ' + cleanup.KEEP_DAYS + ' days.' : ''}</p></section>`;
      return;
    }
    const bytes = items.reduce((n, it) => n + (Number(it.size) || 0), 0);
    body.innerHTML = `<section class="card">
      <div class="card-head">${icons.broom}<h2>${formatCount(items.length)} photos can be checked</h2><span class="c2-amt">${esc(formatBytes(bytes))}</span></div>
      <p class="note">Backed up, older than ${cleanup.KEEP_DAYS} days${(c.ready || 0) > items.length ? ` - the ${formatCount(items.length)} biggest of ${formatCount(c.ready)} first` : ''}.
        Next, each one is checked against your cloud.</p>
      ${stay.length ? `<p class="note">Staying on your phone: ${esc(stay.join(', '))}.</p>` : ''}
      <button class="primary-btn" id="check">${icons.shield} Check them against the cloud</button>
    </section>`;
    body.querySelector('#check').addEventListener('click', () => check(items));
  }

  // ---------- step 2: check every one now ----------
  let checkedAt = 0;
  async function check(items) {
    checkedAt = Date.now();
    body.innerHTML = `<section class="card"><div class="card-head">${icons.shield}<h2>Checking your backups...</h2></div>
      <p class="note" id="prog">0 of ${formatCount(items.length)} checked</p></section>`;
    let verdicts;
    try {
      verdicts = await cleanup.verify(items.map((i) => String(i.id)), (done, total) => {
        const p = body.querySelector('#prog'); if (p) p.textContent = `${formatCount(done)} of ${formatCount(total)} checked`;
      }, () => alive);
    } catch (e) {
      body.innerHTML = `<div class="empty"><b>Could not check right now</b>${esc((e && e.message) || '')}. Nothing was moved.</div>`;
      return;
    }
    if (!alive) return;
    const ok = new Set(verdicts.filter((v) => v.ok).map((v) => String(v.id)));
    const passed = items.filter((it) => ok.has(String(it.id)));
    const why = {};
    for (const v of verdicts) if (!v.ok) why[v.why] = (why[v.why] || 0) + 1;
    const whyLine = Object.entries(why).map(([k, n]) => `${formatCount(n)} ${k}`).join(', ');
    pick(passed, whyLine);
  }

  // ---------- step 3: the person picks, Photo Hub asks, Android asks ----------
  function pick(passed, whyLine) {
    const sel = new Set(passed.map((it) => String(it.id)));
    if (!passed.length) {
      body.innerHTML = `<section class="card"><div class="card-head">${icons.shield}<h2>None passed every check</h2></div>
        <p class="note">${esc(whyLine || '')}. They all stay on your phone.</p></section>`;
      return;
    }
    body.innerHTML = `<section class="card">
      <div class="card-head">${icons.check}<h2>${formatCount(passed.length)} passed every check</h2></div>
      <p class="note">Each one matches its backup exactly and is in your cloud. Tap a photo to keep it on the phone.${whyLine ? ` Staying: ${esc(whyLine)}.` : ''}</p>
      <div class="grid" id="pgrid"></div>
      <button class="primary-btn" id="go"></button>
    </section>`;
    const grid = body.querySelector('#pgrid'), go = body.querySelector('#go');
    const paint = () => {
      const bytes = passed.filter((it) => sel.has(String(it.id))).reduce((n, it) => n + (Number(it.size) || 0), 0);
      go.disabled = !sel.size;
      go.innerHTML = `${icons.broom} Move ${formatCount(sel.size)} to the phone's trash (${esc(formatBytes(bytes))})`;
    };
    thumbs(grid, passed, sel);
    paint();
    grid.addEventListener('click', (e) => {
      const c = e.target.closest('.cell'); if (!c) return;
      const id = String(passed[+c.dataset.i].id);
      if (sel.has(id)) sel.delete(id); else sel.add(id);
      c.classList.toggle('sel', sel.has(id));
      paint();
    });
    go.addEventListener('click', () => {
      if (!sel.size) return;
      const picked = passed.filter((it) => sel.has(String(it.id)));
      if (Date.now() - checkedAt > cleanup.RECHECK_AFTER_MS) { toast('It has been a while - checking them again first.'); check(picked); return; }
      const ids = [...sel];
      const bytes = passed.filter((it) => sel.has(String(it.id))).reduce((n, it) => n + (Number(it.size) || 0), 0);
      openSheet({
        icon: 'broom',
        title: `Move ${formatCount(ids.length)} to the phone's trash?`,
        body: `They are safe in your cloud - checked just now. This frees about ${formatBytes(bytes)} on your phone. Android asks you next; its trash keeps them about 30 days, and Recently cleaned puts them back.`,
        actions: [
          { label: 'Move to trash', primary: true, onClick: async () => {
            try {
              const r = await cleanup.trash(ids, 'cleanup');
              if (r.moved) { toast(`Done - ${formatCount(r.count)} moved to the phone's trash, about ${formatBytes(bytes)} freed.`); drawTrash(); start(); }
            } catch (e) {
              toast(e && e.message ? `${e.message}. Nothing was moved.` : 'Nothing was moved.');
              if (e && (e.code === 'CHANGED' || e.code === 'NOT_CHECKED')) check(picked);
              else if (e && e.code === 'NEEDS_LOCATION') start();
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

  start();
  drawTrash();
  return () => { alive = false; };
}
