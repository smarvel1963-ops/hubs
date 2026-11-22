// vault.js - C:\MarvelApps\photohub\www\js\screens\vault.js
// PRIVATE VAULT screen (Scott 11/22: "we also need private session that needs code to view for photo hub").
// First visit: set a 4-8 number code (typed twice). After that the vault opens only with the code. Inside: add photos / videos (they
// are scrambled with the code and kept only on this phone), tap one to see it, remove it, or save a copy back to the phone.
// It locks itself when you leave the vault, when the app goes to the background, and after 2 minutes without a tap.
// A photo opened from Photos can be put in the vault ("Put in Vault"): vault.pending holds it until the code is entered.

import { icons } from '../icons.js';
import { esc, openSheet } from '../ui.js';
import * as vs from '../lib/vault-store.js';
import { isWebVersion, fileForVault } from '../native/media-library.js';
import * as web from '../native/web-library.js';
import { formatBytes, formatDayLabel, formatDuration } from '../lib/timeline.js';

export const pending = { item: null };   // a picked photo waiting to go in (from the Photos viewer)
const IDLE_MS = 2 * 60 * 1000;

export async function render(root, params, ctx) {
  let alive = true, urls = [], idle = null;
  const forget = () => { urls.forEach((u) => URL.revokeObjectURL(u)); urls = []; };
  const lockNow = () => { vs.lock(); forget(); if (alive) draw(); };
  const touch = () => { clearTimeout(idle); if (vs.isOpen()) idle = setTimeout(lockNow, IDLE_MS); };
  const onHide = () => { if (document.visibilityState === 'hidden' && vs.isOpen()) lockNow(); };
  document.addEventListener('visibilitychange', onHide);
  root.addEventListener('pointerdown', touch);

  async function draw() {
    if (!alive) return;
    if (!(await vs.hasCode())) return keypad('set');
    if (!vs.isOpen()) return keypad('open');
    return inside();
  }

  // ---------- the keypad: set a code (twice) or open ----------
  function keypad(mode, first = '') {
    let code = '';
    const title = mode === 'set' ? (first ? 'Type your code again' : 'Set your vault code') : 'Enter your code';
    const sub = mode === 'set'
      ? (first ? 'The same 4 to 8 numbers.' : 'Pick 4 to 8 numbers. Photos in the vault open only with this code - and if you forget it, the vault can only be erased.')
      : 'Your Private Vault is locked.';
    root.innerHTML = `<div class="screen vault">
      <div class="subbar"><button class="icon-btn" data-go="#home" aria-label="Back">${icons.back}</button><h1>Private Vault</h1></div>
      <div class="vault-lock">
        <div class="vault-ico">${icons.lock}</div>
        <h2>${esc(title)}</h2><p>${esc(sub)}</p>
        <div class="dots" id="dots"></div>
        <p class="vault-msg" id="msg"></p>
        <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}">${n}</button>`).join('')}
          <button data-k="del" aria-label="Delete">⌫</button><button data-k="0">0</button><button data-k="ok" class="ok" aria-label="Done">${icons.check}</button></div>
        ${mode === 'open' ? '<button class="ghost-btn" id="forgot">Forgot your code?</button>' : ''}
      </div></div>`;
    const dots = root.querySelector('#dots'), msg = root.querySelector('#msg');
    const show = () => { dots.innerHTML = Array.from({ length: Math.max(4, code.length) }, (_, i) => `<i class="${i < code.length ? 'on' : ''}"></i>`).join(''); };
    show();
    const wait = vs.waitSeconds();
    if (mode === 'open' && wait) msg.textContent = `Too many wrong codes. Try again in ${wait} seconds.`;
    root.querySelector('.keypad').addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const k = b.dataset.k;
      if (k === 'del') { code = code.slice(0, -1); show(); return; }
      if (k !== 'ok') { if (code.length < 8) code += k; show(); return; }   // numbers add; the check button submits
      if (code.length < 4) { msg.textContent = 'Use 4 to 8 numbers.'; return; }
      if (mode === 'set' && !first) return keypad('set', code);
      if (mode === 'set') {
        if (code !== first) { keypad('set'); root.querySelector('#msg').textContent = "Those didn't match - start again."; return; }
        msg.textContent = 'Locking your vault...';
        await vs.setCode(code); touch(); return draw();
      }
      msg.textContent = 'Checking...';
      if (await vs.unlock(code)) { touch(); return draw(); }
      const w = vs.waitSeconds();
      code = ''; show();
      msg.textContent = w ? `Too many wrong codes. Try again in ${w} seconds.` : 'Wrong code. Try again.';
      dots.classList.add('shake'); setTimeout(() => dots.classList.remove('shake'), 400);
    });
    root.querySelector('[data-go]').addEventListener('click', () => ctx.go('#home'));
    const forgot = root.querySelector('#forgot');
    if (forgot) forgot.addEventListener('click', () => openSheet({
      icon: 'lock', title: 'Forgot your code?',
      body: 'Nobody can open the vault without the code - not even Marvel Corp. The only way back in is to erase the vault and everything in it, then set a new code.',
      actions: [{ label: 'Erase the vault', primary: true, onClick: async () => { await vs.eraseAll(); draw(); } }, { label: 'Keep trying' }],
    }));
  }

  // ---------- inside the open vault ----------
  async function inside() {
    // a photo sent from the Photos viewer goes in first
    if (pending.item) {
      const it = pending.item; pending.item = null;
      const f = await fileForVault(it).catch(() => null);
      if (f) {
        const t = await web.makeThumbBlob(f); await vs.add(f, t.blob, { date: it.date, durationMs: t.durationMs });
        if (it.web) web.removeItem(it.id);
        else setTimeout(() => openSheet({ icon: 'lock', title: 'A copy is in your vault',
          body: 'It is locked with your code now. The original is still in your phone\'s gallery - delete it there if you want it gone from the phone.' }), 300);
      }
    }
    forget();
    const list = await vs.list();
    urls = list.map((i) => i.thumbUrl).filter(Boolean);
    if (!alive) return forget();
    const bytes = list.reduce((s, i) => s + (i.size || 0), 0);
    root.innerHTML = `<div class="screen vault">
      <div class="subbar"><button class="icon-btn" data-go="#home" aria-label="Back">${icons.back}</button><h1>Private Vault</h1>
        <button class="pill-btn" id="lock">${icons.lock} Lock</button></div>
      <p class="vault-note">${list.length} ${list.length === 1 ? 'item' : 'items'} · ${formatBytes(bytes)} · scrambled with your code, kept only on this phone</p>
      <button class="primary-btn" id="add">${icons.image} Add photos</button>
      ${list.length ? `<div class="grid vault-grid">${list.map((i) => `<button class="cell" data-v="${esc(i.id)}">${i.thumbUrl ? `<img class="ready" alt="" src="${esc(i.thumbUrl)}">` : `<span class="ph">${icons[i.type === 'video' ? 'play' : 'image']}</span>`}${i.type === 'video' ? `<span class="dur">${icons.play}${esc(formatDuration(i.durationMs))}</span>` : ''}</button>`).join('')}</div>`
        : `<div class="empty"><div class="ico">${icons.lock}</div><b>Your vault is empty</b>Add photos and videos you want to keep private. ${isWebVersion() ? 'You can also open a photo in Photos and tap "Put in Vault".' : ''}</div>`}
    </div>`;
    const byId = new Map(list.map((i) => [i.id, i]));
    root.querySelector('[data-go]').addEventListener('click', () => ctx.go('#home'));
    root.querySelector('#lock').addEventListener('click', lockNow);
    root.querySelector('#add').addEventListener('click', () => addPhotos());
    root.querySelectorAll('[data-v]').forEach((c) => c.addEventListener('click', () => viewer(byId.get(c.dataset.v))));
  }

  function addPhotos() {
    // the phone's picker opens straight from the tap; the picked files go into the vault (not into the regular picks)
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true; input.accept = 'image/*,video/*'; input.style.display = 'none';
    input.addEventListener('change', async () => {
      const picked = [...(input.files || [])]; input.remove();
      if (!picked.length || !vs.isOpen()) return;
      const note = root.querySelector('.vault-note'); if (note) note.textContent = `Locking ${picked.length} into the vault...`;
      for (const f of picked) {
        if (!/^(image|video)\//.test(f.type)) continue;
        const t = await web.makeThumbBlob(f);
        let date = f.lastModified;
        if (/jpe?g/i.test(f.type)) { const d = await web.exifDate(f).catch(() => null); if (d) date = d; }
        await vs.add(f, t.blob, { date, durationMs: t.durationMs });
        touch();
      }
      draw();
    });
    document.body.appendChild(input);
    input.click();
  }

  async function viewer(item) {
    if (!item || !vs.isOpen()) return;
    const url = await vs.fullUrl(item);
    const v = document.createElement('div');
    v.className = 'viewer';
    const close = () => { URL.revokeObjectURL(url); v.remove(); };
    v.innerHTML = `<div class="top"><button class="icon-btn" id="vx" aria-label="Close">${icons.close}</button><span style="flex:1"></span>
        <a class="pill-btn" id="vsave" href="${esc(url)}" download="${esc(item.name || 'photo')}">Save a copy</a>
        <button class="pill-btn danger" id="vdel">Remove</button></div>
      <div class="stage">${item.type === 'video' ? `<video src="${esc(url)}" controls playsinline style="max-width:100%;max-height:100%"></video>` : `<img alt="" src="${esc(url)}">`}</div>
      <div class="info"><b>${esc(formatDayLabel(item.date))}</b> &middot; In your Private Vault<br>${esc(item.name)}<br>${esc(formatBytes(item.size))}</div>`;
    v.querySelector('#vx').addEventListener('click', close);
    v.querySelector('#vdel').addEventListener('click', () => openSheet({
      icon: 'lock', title: 'Remove from the vault?', body: 'It is deleted from the vault for good. Save a copy first if you want to keep it.',
      actions: [{ label: 'Remove', primary: true, onClick: async () => { await vs.remove(item.id); close(); draw(); } }, { label: 'Cancel' }],
    }));
    document.body.appendChild(v);
    const stop = () => { if (!vs.isOpen()) close(); };
    const t = setInterval(() => { if (!document.body.contains(v)) clearInterval(t); else stop(); }, 1000);
  }

  await draw();
  return () => {
    alive = false;
    clearTimeout(idle);
    document.removeEventListener('visibilitychange', onHide);
    vs.lock();   // leaving the vault locks it
    forget();
    document.querySelectorAll('.viewer').forEach((n) => n.remove());
  };
}
