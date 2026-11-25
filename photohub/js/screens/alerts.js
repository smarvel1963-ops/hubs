// alerts.js - C:\MarvelApps\photohub\www\js\screens\alerts.js
// NOTIFICATIONS (#alerts, the bell on Home) - 11/25, plan step 4 (Scott 11/24 via Desktop: "he will finish photo app").
//   Today        - a memory from this day in other years, and your last backup (real numbers from the backup engine)
//   Notes        - the phone app's last notes: "Backup finished", "On this day" (native/alerts.js -> AlertsPlugin)
//   Switches     - each kind on or off (both on to start); Android 13+ also asks "Allow notifications?" once, from the button here
// The web version has no phone notifications and says so; it still shows Today.

import { icons } from '../icons.js';
import { esc } from '../ui.js';
import * as alerts from '../native/alerts.js';
import * as runner from '../backup/runner.js';
import { onThisDay } from './memories.js';
import { canRead } from '../native/media-library.js';
import { formatCount } from '../lib/timeline.js';

function when(ms) {
  if (!ms) return '';
  const d = new Date(ms), now = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Today ${time}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

export async function render(root, params, ctx) {
  let alive = true;
  root.innerHTML = `<div class="screen alerts">
    <div class="subbar"><button class="icon-btn" id="back" aria-label="Back">${icons.back}</button><h1>Notifications</h1></div>
    <div id="perm"></div>
    <div class="section-title">Today</div>
    <div id="today"><div class="loading">Looking...</div></div>
    <div id="hist"></div>
    <section class="card" id="switches" hidden>
      <div class="card-head">${icons.bell}<h2>Tell me when</h2></div>
      <label class="row"><span class="ico">${icons.cloudUp}</span><span class="txt"><b>A backup finishes</b><span>Once everything on this phone is in your cloud</span></span>
        <span class="switch"><input type="checkbox" data-k="backup"><i></i></span></label>
      <label class="row"><span class="ico">${icons.calHeart}</span><span class="txt"><b>On this day</b><span>Photos from today's date in other years - once a day, in the morning</span></span>
        <span class="switch"><input type="checkbox" data-k="memories"><i></i></span></label>
    </section>
  </div>`;
  root.querySelector('#back').addEventListener('click', () => (history.length > 1 ? history.back() : ctx.go('#home')));
  const seenBefore = alerts.lastSeen();
  alerts.markSeen();

  let st = await alerts.status();
  if (!alive) return null;

  function drawPerm() {
    const box = root.querySelector('#perm');
    if (st.permission === 'unavailable') {
      box.innerHTML = `<p class="note">${alerts.available() ? '' : 'Phone notifications come with the Photo Hub Android app. '}Here you can see today's memory and your last backup.</p>`;
      return;
    }
    root.querySelector('#switches').hidden = false;
    for (const k of ['backup', 'memories']) root.querySelector(`[data-k="${k}"]`).checked = st[k] !== false;
    if (st.permission === 'granted') { box.innerHTML = ''; return; }
    box.innerHTML = st.permission === 'prompt'
      ? `<section class="card"><div class="card-head">${icons.bell}<h2>Get a note on your phone</h2></div>
          <p class="note">When a backup finishes, and when you have photos from this day in other years. Android asks you once.</p>
          <button class="primary-btn" id="allow">Allow notifications</button></section>`
      : `<section class="card"><div class="card-head">${icons.bell}<h2>Notifications are off</h2></div>
          <p class="note">Android has notifications turned off for Photo Hub. Turn them on in Android's settings to get these notes.</p>
          <button class="ghost-btn" id="settings">Open Android settings</button></section>`;
  }
  drawPerm();
  root.querySelector('#perm').addEventListener('click', async (e) => {
    if (e.target.closest('#allow')) { st = await alerts.request().catch(() => st); if (alive) { drawPerm(); drawHist(); } }
    if (e.target.closest('#settings')) alerts.openSettings();
  });
  root.querySelector('#switches').addEventListener('change', async (e) => {
    const k = e.target.dataset.k; if (!k) return;
    st = { ...st, [k]: e.target.checked };
    st = await alerts.configure({ backup: st.backup !== false, memories: st.memories !== false }).catch(() => st);
  });
  document.addEventListener('visibilitychange', onVis);
  async function onVis() { if (document.visibilityState === 'visible' && alive) { st = await alerts.status(); if (alive) drawPerm(); } }

  function drawHist() {
    const list = (st.history || []).slice(0, 20);
    const box = root.querySelector('#hist');
    if (!list.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="section-title">Notes</div><section class="card">${list.map((h, i) => `<button class="row" data-h="${i}">
      <span class="ico">${h.kind === 'memories' ? icons.calHeart : icons.cloudUp}</span>
      <span class="txt"><b>${esc(h.title)}${h.at > seenBefore ? ' <span class="badge ok">New</span>' : ''}</b><span>${esc(h.text)}</span><span class="small-note">${esc(when(h.at))}</span></span>
      ${icons.chevron}</button>`).join('')}</section>`;
    box.onclick = (e) => { const b = e.target.closest('[data-h]'); if (b) { const h = list[+b.dataset.h]; if (h && h.go) ctx.go(h.go); } };
  }
  drawHist();

  // ---------- Today ----------
  const rows = [];
  if (canRead(ctx.access)) {
    const mem = await onThisDay().catch(() => []);
    if (!alive) return null;
    if (mem.length) rows.push(`<button class="row" data-go="#memories"><span class="ico">${icons.calHeart}</span>
      <span class="txt"><b>On this day</b><span>${esc(mem[0].label)} - ${formatCount(mem[0].items.length)} ${mem[0].items.length === 1 ? 'photo' : 'photos'}</span></span>${icons.chevron}</button>`);
  }
  const s = runner.status();
  const bg = await runner.backgroundStatus().catch(() => null);
  if (!alive) return null;
  const sum = s.summary || null;
  let backupLine = '';
  if (s.phase === 'done' && sum && sum.total) backupLine = `${formatCount(sum.backedUp)} of ${formatCount(sum.total)} backed up and checked${s.lastDone ? ' - ' + when(s.lastDone) : ''}`;
  else if (s.phase === 'uploading' && sum) backupLine = `Backing up now - ${formatCount(sum.backedUp)} of ${formatCount(sum.total)} done`;
  else if (s.phase === 'signed_out' || s.phase === 'no_signin') backupLine = 'Not signed in - your photos are not being backed up';
  else if (s.phase === 'off') backupLine = 'Auto Backup is off';
  if (bg && bg.lastRun) backupLine += `${backupLine ? '. ' : ''}In the background: ${when(bg.lastRun)}, ${formatCount(bg.lastUploaded || 0)} new`;
  if (backupLine) rows.push(`<button class="row" data-go="#storage"><span class="ico">${icons.cloudUp}</span>
    <span class="txt"><b>Backup</b><span>${esc(backupLine)}</span></span>${icons.chevron}</button>`);
  const today = root.querySelector('#today');
  today.innerHTML = rows.length ? `<section class="card">${rows.join('')}</section>` : '<p class="note">Nothing new today.</p>';
  today.onclick = (e) => { const b = e.target.closest('[data-go]'); if (b) ctx.go(b.dataset.go); };

  return () => { alive = false; document.removeEventListener('visibilitychange', onVis); };
}

/** Home's bell: is there anything newer than the last visit? (a note, or today's memory not seen yet today) */
export async function hasNew(memToday) {
  const seen = alerts.lastSeen();
  const st = await alerts.status();
  if ((st.history || []).some((h) => h.at > seen)) return true;
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  return !!memToday && seen < startOfDay.getTime();
}
