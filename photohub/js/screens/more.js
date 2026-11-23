// more.js - C:\MarvelApps\photohub\www\js\screens\more.js
// More: photo access status (and a way to turn it on), Smart Storage, sign-in (later), and what this test build is.

import { icons } from '../icons.js';
import { comingLater, askForPhotoAccess, openSheet } from '../ui.js';
import { canRead } from '../native/media-library.js';

const ACCESS_TEXT = {
  granted: 'Allowed - Photo Hub can read your photos and videos',
  limited: 'Only the photos you picked - tap to choose more',
  prompt: 'Not asked yet - tap to allow',
  denied: 'Turned off - tap to open Settings',
  unavailable: 'Only in the Android app',
  unknown: 'Checking...',
};

export async function render(root, params, ctx) {
  const st = ctx.access.state || 'unknown';
  root.innerHTML = `<div class="screen">
    <div class="subbar"><h1>More</h1></div>
    <button class="row" id="access"><span class="ico">${icons.image}</span>
      <span class="txt"><b>Photo access</b><span>${ACCESS_TEXT[st] || st}</span></span>
      ${canRead(ctx.access) && st === 'granted' ? '<span class="badge ok">On</span>' : icons.chevron}</button>
    <button class="row" data-go="#storage"><span class="ico">${icons.cloudUp}</span>
      <span class="txt"><b>Smart Storage</b><span>Backup settings and storage</span></span>${icons.chevron}</button>
    <button class="row" data-later="account"><span class="ico">${icons.user}</span>
      <span class="txt"><b>Sign in</b><span>With Google</span></span><span class="badge">Later</span></button>
    <button class="row" id="about"><span class="ico">${icons.info}</span>
      <span class="txt"><b>About this build</b><span>Photo Hub ${ctx.version}</span></span>${icons.chevron}</button>
    <p class="note">Photo Hub by Marvel Corp. This test build reads your photos on the phone only. It uploads nothing and
      deletes nothing.</p>
  </div>`;

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'access') {
      if (st === 'granted' || st === 'unavailable') return;
      const a = await askForPhotoAccess(ctx.access);
      ctx.setAccess(a);
      ctx.rerender();
    } else if (b.id === 'about') {
      openSheet({
        icon: 'info',
        title: 'Photo Hub - Phase 1 skeleton',
        body: `Version ${ctx.version}. Town names in Places come from GeoNames (geonames.org), shared under CC BY 4.0.`,
        list: [
          'Real: your photo library (read only), Smart Storage settings, the backup engine with its safety tests.',
          'Not connected yet: the cloud (Backblaze B2) and Google sign-in.',
          'Not built yet: Free Up Phone Space - it comes after the never-lose-a-photo tests.',
        ],
      });
    } else if (b.dataset.later) comingLater(b.dataset.later);
    else if (b.dataset.go) ctx.go(b.dataset.go);
  });
  return null;
}
