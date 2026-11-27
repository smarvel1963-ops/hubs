// sendto.js - C:\MarvelApps\photohub\www\js\screens\sendto.js
// 11/26 MANY TO THE VAULT (Scott: "When you have a lot of bunch of pictures and you highlight them it doesn't give you drop downs to send
// them all to a particular place like the vault"): the select bar's "Send to" opens this menu for every picked photo, and "Private Vault"
// now takes all of them (it used to show for one photo only). Photos kept only in the cloud or only as a small copy can't go in; the
// row says how many can, and the vault says how many were left out.
// SEND TO (11/25, Scott: "when you hold your finger on a pic a small drop down pops up for where you can send that pick"). Hold a photo
// anywhere (Photos, Gallery, Memories, Photo Inbox, Unsorted Photos) and a small menu opens right by your finger: Family, Personal Info, Cool Stuff (the home
// folders), then every album you made, "+ New album", "Private Vault" and - where you can pick several - "Select more" (what holding a
// photo did before). "Send" puts the photo in that album; the photo itself stays where it is on the phone, and the album follows you to
// the cloud, the web and your PC when Cloud Backup is on. The Inbox's and Unsorted Photos' "Send all" use the same menu for a whole group.

import { icons } from '../icons.js';
import { esc, askText } from '../ui.js';
import { myAlbums, hasFullFile } from '../native/media-library.js';
import { HOME_FOLDERS, ensureAlbum, addManyToAlbum, albumName, createAlbum, isHomeFolder, albumsWith } from '../lib/mine.js';
import { pending as vaultPending } from './vault.js';

function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

export function closeSendMenu() { document.querySelectorAll('.send-back').forEach((n) => n.remove()); }

/**
 * Opens the menu by the point (x, y).
 * opts: { onSelectMore() - adds "Select more"; done(albumId) - after photos went into an album; onVault() - just before going to the
 *        vault with them; title - header text }
 */
export function sendMenu(items, at, opts = {}) {
  items = (items || []).filter(Boolean);
  if (!items.length) return null;
  closeSendMenu();
  const one = items.length === 1 ? items[0] : null;
  const inn = one ? new Set(albumsWith(one)) : new Set();
  const mine = myAlbums().filter((a) => !isHomeFolder(a.id));
  const toVault = items.filter((it) => !it.cloud && hasFullFile(it));
  const row = (id, icon, name, extra = '') => `<button class="sm-row" role="menuitem" data-a="${esc(id)}">${icons[icon] || icons.image}
      <span>${esc(name)}</span>${inn.has(id) ? `<i class="sm-in">${icons.check}</i>` : extra}</button>`;
  const back = document.createElement('div');
  back.className = 'send-back';
  back.innerHTML = `<div class="send-menu" role="menu" aria-label="Send to">
      <div class="sm-h">${esc(opts.title || (one ? 'Send to' : `Send ${items.length} to`))}</div>
      ${HOME_FOLDERS.map((f) => row(f.id, f.icon, f.name)).join('')}
      ${mine.length ? `<div class="sm-sep"></div>${mine.map((a) => row(a.id, 'image', a.name)).join('')}` : ''}
      <div class="sm-sep"></div>
      <button class="sm-row" role="menuitem" data-new>${icons.plus}<span>New album</span></button>
      ${toVault.length ? `<button class="sm-row" role="menuitem" data-vault>${icons.lock}<span>Private Vault${toVault.length < items.length ? ` (${toVault.length} of ${items.length})` : ''}</span></button>` : ''}
      ${opts.onSelectMore ? `<button class="sm-row" role="menuitem" data-sel>${icons.check}<span>Select more</span></button>` : ''}
    </div>`;
  document.body.appendChild(back);
  const menu = back.firstElementChild;
  // right by the finger, never off the screen
  const w = menu.offsetWidth, h = menu.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
  const x = at && Number.isFinite(at.x) ? at.x : vw / 2, y = at && Number.isFinite(at.y) ? at.y : vh / 2;
  menu.style.left = `${Math.max(8, Math.min(vw - w - 8, x - w / 2))}px`;
  menu.style.top = `${y + 14 + h < vh - 8 ? y + 14 : Math.max(8, y - h - 14)}px`;

  const done = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') done(); };
  document.addEventListener('keydown', onKey);
  const put = (id) => {
    if (isHomeFolder(id)) ensureAlbum(id);
    const n = addManyToAlbum(id, items);
    done();
    toast(n ? (one ? `Sent to ${albumName(id)}` : `${n} sent to ${albumName(id)}`) : `Already in ${albumName(id)}`);
    if (opts.done) opts.done(id);
  };
  back.addEventListener('click', async (e) => {
    if (e.target === back) { done(); return; }
    const a = e.target.closest('[data-a]');
    if (a) { put(a.dataset.a); return; }
    if (e.target.closest('[data-new]')) {
      done();
      const n = await askText({ title: 'New album', label: 'Give it a name - like "Grandkids", "Beach 2026" or "Recipes".', ok: 'Make album' });
      if (n) { const id = createAlbum(n); const k = addManyToAlbum(id, items); toast(k ? (one ? `Sent to ${albumName(id)}` : `${k} sent to ${albumName(id)}`) : `Already in ${albumName(id)}`); if (opts.done) opts.done(id); }
      return;
    }
    if (e.target.closest('[data-vault]')) {
      done();
      vaultPending.items = toVault; vaultPending.skipped = items.length - toVault.length;
      if (opts.onVault) opts.onVault();
      location.hash = '#vault';
      return;
    }
    if (e.target.closest('[data-sel]')) { done(); opts.onSelectMore(); }
  });
  back.addEventListener('contextmenu', (e) => e.preventDefault());
  return back;
}

/**
 * Hold-to-send for a grid of photo cells that has no select mode (Gallery, Memories): hold ~0.45 s (or right-click on a PC) and the
 * menu opens; the tap that ends the hold does not open the photo.
 */
export function holdToSend(container, selector, itemOf, opts = {}) {
  let t = null, at = null, fired = false;
  const cancel = () => { clearTimeout(t); t = null; };
  const fire = (cell, x, y) => {
    fired = true;
    try { navigator.vibrate && navigator.vibrate(15); } catch (e) { /* no buzz */ }
    sendMenu([itemOf(cell)], { x, y }, opts);
  };
  container.addEventListener('pointerdown', (e) => {
    const cell = e.target.closest(selector);
    if (!cell || (e.pointerType === 'mouse' && e.button !== 0)) return;
    fired = false; at = [e.clientX, e.clientY];
    cancel();
    t = setTimeout(() => { t = null; fire(cell, at[0], at[1]); }, 450);
  });
  container.addEventListener('pointermove', (e) => { if (t && at && Math.hypot(e.clientX - at[0], e.clientY - at[1]) > 10) cancel(); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) container.addEventListener(ev, cancel);
  container.addEventListener('contextmenu', (e) => {
    const cell = e.target.closest(selector);
    if (!cell) return;
    e.preventDefault();
    if (t) { cancel(); fire(cell, e.clientX, e.clientY); } else if (!fired) fire(cell, e.clientX, e.clientY);
  });
  // capture: runs before the grid's own click (which would open the photo)
  container.addEventListener('click', (e) => { if (fired && e.target.closest(selector)) { fired = false; e.stopPropagation(); e.preventDefault(); } }, true);
}
