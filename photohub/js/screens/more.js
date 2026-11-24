// more.js - C:\MarvelApps\photohub\www\js\screens\more.js
// More: photo access status (and a way to turn it on), Cloud Backup (with Google sign-in), the privacy policy, and what this build is.
// 11/23 (Play closed test, Scott: "Yes, start closed test"): the old "Sign in - Later" row and the "uploads nothing" note were out of
// date since Cloud Backup (0.3.0); the privacy policy is linked here and from the Cloud page.

import { icons } from '../icons.js';
import { askForPhotoAccess, openSheet } from '../ui.js';
import { canRead, isNative } from '../native/media-library.js';

export const PRIVACY_URL = 'https://smarvel1963-ops.github.io/hubs/photohub/privacy.html';

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
      <span class="txt"><b>Cloud Backup</b><span>Google sign-in, backup settings and storage</span></span>${icons.chevron}</button>
    <button class="row" id="privacy"><span class="ico">${icons.lock}</span>
      <span class="txt"><b>Privacy policy</b><span>What stays on your phone and what doesn't</span></span>${icons.chevron}</button>
    <button class="row" id="about"><span class="ico">${icons.info}</span>
      <span class="txt"><b>About this build</b><span>Photo Hub ${ctx.version}</span></span>${icons.chevron}</button>
    <p class="note">Photo Hub by Marvel Corp. Your photos stay on your phone unless you turn on Cloud Backup or link your own PC.
      Photo Hub never deletes a photo from your phone.</p>
  </div>`;

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'access') {
      if (st === 'granted' || st === 'unavailable') return;
      const a = await askForPhotoAccess(ctx.access);
      ctx.setAccess(a);
      ctx.rerender();
    } else if (b.id === 'privacy') {
      window.open(isNative() ? PRIVACY_URL : './privacy.html', '_blank', 'noopener');
    } else if (b.id === 'about') {
      openSheet({
        icon: 'info',
        title: 'Photo Hub',
        body: `Version ${ctx.version}. By Marvel Corp. Town names in Places come from GeoNames (geonames.org), shared under CC BY 4.0.`,
        list: [
          'Your library: read only - Photo Hub never changes, moves or deletes a photo.',
          'Cloud Backup (optional, Google sign-in): private, encrypted copies in the United States. Invite-only during testing.',
          'Albums, Places, the Private Vault and hearts are kept on your phone.',
          'Coming later: Free Up Phone Space, People and Trips.',
        ],
      });
    } else if (b.dataset.go) ctx.go(b.dataset.go);
  });
  return null;
}
